"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";

/**
 * The intake engine behind a stage drawer — all four input methods (#3a)
 * writing into one conversation and one shared progress meter.
 *
 * Lifted out of the original single-page chat rather than rewritten: the
 * voice-continuity machinery here (per-turn persistence through a ref, the
 * signed grant handed to ElevenLabs, the dropped-call resume path) was earned
 * by debugging a real 15-minutes-lost incident on 2026-07-19. Behaviour is
 * preserved exactly; only the packaging changed.
 */

export type Message = { role: "user" | "assistant"; content: string };

export type CoverageSection = {
  id: number;
  name: string;
  status: "covered" | "partial" | "missing";
};

export type InheritedRef = { agentSlug: string; name: string; version: number };

// Minimal Web Speech API surface (not in TS's DOM lib on all configs).
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((event: {
        results: ArrayLike<
          { isFinal: boolean; 0: { transcript: string } } & ArrayLike<{ transcript: string }>
        >;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type IntakeMethod = "voice" | "dictate" | "type" | "upload";

type Options = {
  agentSlug: string;
  projectId: string;
  /** Thread to resume; null starts a new one. */
  initialConversationId: string | null;
  /** Ask the server to inject approved upstream artifacts on the first turn. */
  inherit?: boolean;
  /** Live voice is JD-only today (the ElevenLabs agent is JD-configured). */
  voiceEnabled?: boolean;
  /** Coverage meter is JD-only server-side. */
  coverageEnabled?: boolean;
  /** Called after any turn lands, so the board can refresh stage state. */
  onTurnComplete?: () => void;
};

export function useIntakeSession({
  agentSlug,
  projectId,
  initialConversationId,
  inherit = false,
  voiceEnabled = false,
  coverageEnabled = false,
  onTurnComplete,
}: Options) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [inherited, setInherited] = useState<InheritedRef[]>([]);
  const [hydrating, setHydrating] = useState(Boolean(initialConversationId));

  // The voice onMessage callback fires from the ElevenLabs SDK outside the
  // React render cycle — read the conversation id through a ref so per-turn
  // persistence never writes to a stale conversation.
  const conversationIdRef = useRef<string | null>(initialConversationId);
  conversationIdRef.current = conversationId;

  /* ---------------- coverage meter (shared across all methods) ---------- */

  const [coverage, setCoverage] = useState<CoverageSection[] | null>(null);
  const coverageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coverageBusyRef = useRef(false);

  const refreshCoverage = useCallback(
    (delayMs = 0) => {
      if (!coverageEnabled) return;
      if (coverageTimerRef.current) clearTimeout(coverageTimerRef.current);
      coverageTimerRef.current = setTimeout(async () => {
        const id = conversationIdRef.current;
        if (!id || coverageBusyRef.current) return;
        coverageBusyRef.current = true;
        try {
          const res = await fetch(`/api/conversations/${id}/coverage`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.sections)) setCoverage(data.sections);
          }
        } catch {
          // meter is best-effort — never disturb the conversation
        } finally {
          coverageBusyRef.current = false;
        }
      }, delayMs);
    },
    [coverageEnabled]
  );

  useEffect(
    () => () => {
      if (coverageTimerRef.current) clearTimeout(coverageTimerRef.current);
    },
    []
  );

  /* ---------------- resume an existing thread --------------------------- */

  useEffect(() => {
    if (!initialConversationId) {
      setHydrating(false);
      return;
    }
    let alive = true;
    setHydrating(true);
    fetch(`/api/conversations/${initialConversationId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load this session");
        if (!alive) return;
        setMessages(d.messages ?? []);
        setConversationId(d.id);
        conversationIdRef.current = d.id;
        refreshCoverage(300);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load session"))
      .finally(() => alive && setHydrating(false));
    return () => {
      alive = false;
    };
  }, [initialConversationId, refreshCoverage]);

  /* ---------------- sending a turn -------------------------------------- */

  const sendTurn = useCallback(
    async (next: Message[]) => {
      setMessages(next);
      setLoading(true);
      setError(null);

      const url =
        agentSlug === "job-description" ? "/api/job-description" : `/api/agents/${agentSlug}`;
      // Inheritance applies only to the very first turn of an empty thread;
      // the server enforces that too, this just avoids a pointless lookup.
      const wantsInherit = inherit && !conversationIdRef.current && next.length === 1;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next,
            conversationId: conversationIdRef.current,
            projectId,
            ...(wantsInherit ? { inherit: true } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Request failed");

        setMessages([...next, { role: "assistant", content: data.reply }]);
        if (data.conversationId) {
          setConversationId(data.conversationId);
          conversationIdRef.current = data.conversationId;
        }
        if (Array.isArray(data.inherited) && data.inherited.length) setInherited(data.inherited);
        refreshCoverage(300);
        onTurnComplete?.();
      } catch (e) {
        // The turn may well have been persisted server-side even if the
        // response never arrived (long non-streaming generations can outlive
        // the connection). Recover it from the DB rather than showing a bare
        // failure — the reply is not actually lost.
        const recovered = await recoverLastReply(conversationIdRef.current, next.length);
        if (recovered) {
          setMessages([...next, { role: "assistant", content: recovered }]);
          refreshCoverage(300);
          onTurnComplete?.();
        } else {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        setLoading(false);
      }
    },
    [agentSlug, projectId, inherit, refreshCoverage, onTurnComplete]
  );

  /* ---------------- method: type ---------------------------------------- */

  const send = useCallback(async () => {
    if (!input.trim() || loading) return;
    stopDictation();
    const text = input;
    setInput("");
    await sendTurn([...messages, { role: "user", content: text }]);
  }, [input, loading, messages, sendTurn]);

  /** Used by the request-changes loop to push a note straight to the agent. */
  const sendText = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      await sendTurn([...messages, { role: "user", content: text }]);
    },
    [loading, messages, sendTurn]
  );

  /** First turn of a brand-new thread (opening line differs per stage). */
  const startSession = useCallback(
    async (opener: string) => {
      if (loading || messages.length > 0) return;
      await sendTurn([{ role: "user", content: opener }]);
    },
    [loading, messages.length, sendTurn]
  );

  /* ---------------- method: dictate (Web Speech → text) ----------------- */

  const [dictating, setDictating] = useState(false);
  const recogRef = useRef<{ stop: () => void } | null>(null);
  const dictationBaseRef = useRef("");

  function stopDictation() {
    recogRef.current?.stop();
    recogRef.current = null;
    setDictating(false);
  }

  function toggleDictation() {
    if (dictating) {
      stopDictation();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setError(
        "Dictation is not supported in this browser — try Chrome, or use the live voice conversation."
      );
      return;
    }
    setError(null);
    dictationBaseRef.current = input ? input.trimEnd() + " " : "";
    const recog = new SR();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = "en-US";
    recog.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      // Transcription lands in the composer for review/edit before it is
      // submitted — the "voice → text" method of #3a, distinct from live voice.
      setInput(dictationBaseRef.current + finalText + interim);
    };
    recog.onend = () => setDictating(false);
    recog.onerror = () => setDictating(false);
    recogRef.current = recog;
    setDictating(true);
    recog.start();
  }

  /* ---------------- method: upload -------------------------------------- */

  const [uploading, setUploading] = useState(false);
  const [lastUpload, setLastUpload] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload-parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      const note = data.truncated ? " (truncated — document was very long)" : "";
      // The `[Uploaded document: …]` framing is what the JD prompt's v1.1
      // document-ingest behaviour looks for. Do not reword it.
      const docMessage = `[Uploaded document: ${data.name}${note}]\n\n${data.text}`;
      setLastUpload(data.name);
      await sendTurn([...messages, { role: "user", content: docMessage }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /* ---------------- method: live voice ---------------------------------- */

  const [voiceStarting, setVoiceStarting] = useState(false);
  const [voiceDropped, setVoiceDropped] = useState(false);
  const intentionalEndRef = useRef(false);

  // Persist a voice turn the moment it is transcribed (voice-continuity fix):
  // the transcript is in the DB before the audio finishes playing, so a
  // dropped call loses nothing. Fire-and-forget with one retry.
  const persistVoiceTurn = useCallback(
    (role: "user" | "assistant", content: string) => {
      const id = conversationIdRef.current;
      if (!id || !content.trim()) return;
      const post = () =>
        fetch(`/api/conversations/${id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, content }),
          keepalive: true,
        });
      post().catch(() => setTimeout(() => post().catch(() => {}), 2000));
      // Voice turns arrive rapidly — refresh the meter at most every ~8s.
      refreshCoverage(8000);
    },
    [refreshCoverage]
  );

  const conversation = useConversation({
    onMessage: ({ message, role }: { message: string; role: string }) => {
      if (!message) return;
      const r = role === "user" ? "user" : "assistant";
      setMessages((prev) => [...prev, { role: r, content: message }]);
      persistVoiceTurn(r, message);
    },
    onError: (message: string) => setError(message),
    onConnect: () => {
      setVoiceStarting(false);
      setVoiceDropped(false);
    },
    onDisconnect: () => {
      setVoiceStarting(false);
      // A call that ended without the user pressing "End" (network, duration
      // cap, ElevenLabs error) gets an explicit resume path — everything is
      // persisted, nothing is lost.
      if (!intentionalEndRef.current) setVoiceDropped(true);
      intentionalEndRef.current = false;
      onTurnComplete?.();
    },
  });

  const voiceLive =
    voiceStarting ||
    conversation.status === "connecting" ||
    conversation.status === "connected";

  async function startVoice() {
    if (!voiceEnabled) return;
    setError(null);
    setVoiceStarting(true);
    setVoiceDropped(false);
    stopDictation();
    try {
      // The server anchors this session to a persisted conversation and signs
      // a voice grant; ElevenLabs echoes the grant into every LLM callback so
      // the voice brain hydrates prior context from the DB (voice continuity —
      // survives dropped calls, duration caps, and serverless instances).
      const res = await fetch("/api/job-description/voice-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, conversationId: conversationIdRef.current, projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start a voice session");
      if (data.conversationId) {
        setConversationId(data.conversationId);
        conversationIdRef.current = data.conversationId;
      }
      await conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
        ...(data.extraBody ? { customLlmExtraBody: data.extraBody } : {}),
      });
    } catch (e) {
      setVoiceStarting(false);
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function endVoice() {
    intentionalEndRef.current = true;
    conversation.endSession();
    setVoiceStarting(false);
  }

  const voiceStatusLabel =
    conversation.status === "connected"
      ? conversation.isSpeaking
        ? "Agent is speaking — you can interrupt"
        : "Listening…"
      : "Connecting…";

  return {
    // state
    messages,
    input,
    setInput,
    loading,
    hydrating,
    error,
    setError,
    conversationId,
    coverage,
    inherited,
    // type
    send,
    sendText,
    startSession,
    // dictate
    dictating,
    toggleDictation,
    stopDictation,
    // upload
    uploading,
    lastUpload,
    handleFile,
    // voice
    voiceLive,
    voiceStarting,
    voiceDropped,
    voiceStatusLabel,
    isSpeaking: conversation.isSpeaking,
    startVoice,
    endVoice,
    // misc
    refreshCoverage,
  };
}

/**
 * A full job description is a non-streaming ~16K-token generation behind a
 * 120s function budget, so the response can be lost while the turn itself
 * committed. The reply is in Postgres either way — go and read it rather than
 * telling the user their work failed.
 */
async function recoverLastReply(
  conversationId: string | null,
  expectedUserTurns: number
): Promise<string | null> {
  if (!conversationId) return null;
  try {
    const res = await fetch(`/api/conversations/${conversationId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const msgs: Message[] = data.messages ?? [];
    const last = msgs[msgs.length - 1];
    const userTurns = msgs.filter((m) => m.role === "user").length;
    if (last?.role === "assistant" && userTurns >= expectedUserTurns) return last.content;
    return null;
  } catch {
    return null;
  }
}

/** Progress figures for the shared meter panel (#3a). */
export function coverageSummary(coverage: CoverageSection[] | null) {
  if (!coverage || coverage.length === 0) {
    return { covered: 0, partial: 0, total: 0, fraction: 0 };
  }
  const covered = coverage.filter((s) => s.status === "covered").length;
  const partial = coverage.filter((s) => s.status === "partial").length;
  return {
    covered,
    partial,
    total: coverage.length,
    // Partials count as half — the bar should move when someone answers
    // something incompletely, or the meter feels broken.
    fraction: (covered + partial * 0.5) / coverage.length,
  };
}
