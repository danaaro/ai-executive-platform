"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

type Message = { role: "user" | "assistant"; content: string };

// Minimal Web Speech API surface (not in TS's DOM lib on all configs).
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: {
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } } & ArrayLike<{ transcript: string }>>;
  }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const INTAKE_START = "Start the NEW JOB intake session.";

// Mirrors AGENT_REGISTRY in src/orchestrator/agent-orchestrator.ts.
// job-description keeps its dedicated route (voice depends on it).
// projectScoped mirrors isPersistableAgent() server-side (ADR-006 §5 /
// ADR-007): these five live inside a project; the rest stay ad-hoc/ephemeral.
const AGENTS = [
  {
    slug: "job-description",
    title: "1 · Job Description",
    hint: "Start a NEW JOB intake session — have a live voice conversation, or type. The agent works through the Job Discovery Questionnaire conversationally.",
    voice: true,
    projectScoped: true,
  },
  {
    slug: "competency-builder",
    title: "2 · Competency Builder",
    hint: "Paste the Job Description (plus any company context) as your first message. Output: 8 predictive competencies (4 execution + 4 operating).",
    voice: false,
    projectScoped: true,
  },
  {
    slug: "panel-designer",
    title: "3 · Panel Designer",
    hint: "Paste the Competency Framework (and ideally the JD) as your first message. Output: an interview panel of up to 5 interviewers with owned competencies.",
    voice: false,
    projectScoped: true,
  },
  {
    slug: "interview-system-builder",
    title: "4 · Interview System Builder",
    hint: "Paste the Competency Framework AND the Interview Panel as your first message. Output: per-interviewer guides, questions, probes, scoring and bias checklist.",
    voice: false,
    projectScoped: true,
  },
  {
    slug: "feedback-form-builder",
    title: "5 · Feedback Form Builder (Phase 2)",
    hint: "Per candidate. Paste the interview transcript, the interview guide, and this interviewer's assigned competencies. Output: one-page evidence report — no scores, human decides.",
    voice: false,
    projectScoped: false,
  },
  {
    slug: "hiring-rationale",
    title: "6 · Hiring Rationale (Phase 2)",
    hint: "Per candidate. Paste candidate name, position, JD, CV, and ALL interview feedback. Output: one-page evidence-based rationale — committee decides.",
    voice: false,
    projectScoped: false,
  },
  {
    slug: "success-blueprint",
    title: "7 · Success Blueprint (Phase 2)",
    hint: "Per candidate. Paste the candidate profile, interview evaluations, and JD. Output: one-page Manager's Success Blueprint for onboarding.",
    voice: false,
    projectScoped: false,
  },
  {
    slug: "interview-coach",
    title: "8 · Interview Coach (Phase 2)",
    hint: "Paste the interviewer guide (role, competencies, questions) and the transcript. Output: coaching report scoring the INTERVIEWER (0–100), not the candidate.",
    voice: false,
    projectScoped: false,
  },
  {
    slug: "recruiter-evaluation-report",
    title: "A1 · Recruiter Evaluation Report (Phase 2)",
    hint: "Independent assistant. Paste the interview transcription (+ CV, notes, role/company). Output: executive-search-grade evaluation report — no recommendations.",
    voice: false,
    projectScoped: false,
  },
  {
    slug: "screening-guide",
    title: "A2 · Screening Guide (draft)",
    hint: "Independent assistant. Paste the JD and the competency framework. Output: 5-step recruiter screening guide. (Prompt drafted from Susan's description — needs her review.)",
    voice: false,
    projectScoped: true,
  },
] as const;

type AgentSlug = (typeof AGENTS)[number]["slug"];

async function postTurn(
  agent: AgentSlug,
  messages: Message[],
  conversationId: string | null,
  projectId: string | null
): Promise<{ reply: string; conversationId: string | null }> {
  const url =
    agent === "job-description" ? "/api/job-description" : `/api/agents/${agent}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, conversationId, projectId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return {
    reply: data.reply as string,
    conversationId: (data.conversationId as string | null) ?? conversationId,
  };
}

type RecentConversation = {
  id: string;
  title: string | null;
  updatedAt: string;
  createdBy: string;
  own: boolean;
};

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ConversationProvider>
        <JobDescriptionAgent />
      </ConversationProvider>
    </Suspense>
  );
}

type ProjectSummary = { id: string; title: string; status: string; artifactCount: number };

function JobDescriptionAgent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [agent, setAgent] = useState<AgentSlug>(() => {
    const a = searchParams.get("agent");
    return a && AGENTS.some((x) => x.slug === a) ? (a as AgentSlug) : "job-description";
  });
  const [projectId, setProjectId] = useState<string | null>(() => searchParams.get("project"));
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceStarting, setVoiceStarting] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentConversation[]>([]);
  const [voiceDropped, setVoiceDropped] = useState(false);

  // Intake-progress meter (JD agent): covered/partial/missing per
  // questionnaire section, refreshed (debounced) as the conversation grows.
  type CoverageSection = { id: number; name: string; status: "covered" | "partial" | "missing" };
  const [coverage, setCoverage] = useState<CoverageSection[] | null>(null);
  const coverageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coverageBusyRef = useRef(false);

  function refreshCoverage(delayMs = 0) {
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
  }

  // The voice onMessage callback fires from the ElevenLabs SDK outside the
  // React render cycle — read the conversation id through a ref so per-turn
  // persistence never writes to a stale conversation.
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;

  // Persist a voice turn the moment it is transcribed (voice-continuity fix):
  // the transcript is in the DB before the audio finishes playing, so a
  // dropped call loses nothing. Fire-and-forget with one retry.
  function persistVoiceTurn(role: "user" | "assistant", content: string) {
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
  }

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const agentMeta = AGENTS.find((a) => a.slug === agent)!;

  // --- Dictation (speech-to-text into the input box; Web Speech API) ---
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
      setError("Dictation is not supported in this browser — try Chrome, or use the live voice conversation.");
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
      setInput(dictationBaseRef.current + finalText + interim);
    };
    recog.onend = () => setDictating(false);
    recog.onerror = () => setDictating(false);
    recogRef.current = recog;
    setDictating(true);
    recog.start();
  }

  // --- Document upload → parsed text enters the conversation ---
  const [uploading, setUploading] = useState(false);

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
      const docMessage = `[Uploaded document: ${data.name}${note}]\n\n${data.text}`;
      await sendTurn([...messages, { role: "user", content: docMessage }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function switchAgent(next: AgentSlug) {
    stopDictation();
    setAgent(next);
    setMessages([]);
    setError(null);
    setSavedPath(null);
    setConversationId(null);
    setVoiceDropped(false);
    setCoverage(null);
    // projectId is intentionally kept — switching between project-scoped
    // agents inside the same project is exactly how chaining works (ADR-007).
    const nextMeta = AGENTS.find((a) => a.slug === next)!;
    const qp = new URLSearchParams({ agent: next });
    if (nextMeta.projectScoped && projectId) qp.set("project", projectId);
    router.replace(`/?${qp.toString()}`);
  }

  // Project (ADR-007): the unique key everything else — conversations,
  // artifacts, versions — hangs off. Project-scoped agents require one.
  function selectProject(id: string, title?: string) {
    setProjectId(id);
    if (title) setProjectTitle(title);
    setProjectPickerOpen(false);
    setMessages([]);
    setConversationId(null);
    conversationIdRef.current = null;
    setCoverage(null);
    setError(null);
    router.replace(`/?${new URLSearchParams({ agent, project: id }).toString()}`);
  }

  async function createProject() {
    const title = newProjectTitle.trim();
    if (!title) return;
    setCreatingProject(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create project");
      setProjects((prev) => [{ id: data.project.id, title: data.project.title, status: "open", artifactCount: 0 }, ...prev]);
      selectProject(data.project.id, data.project.title);
      setNewProjectTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create project");
    } finally {
      setCreatingProject(false);
    }
  }

  // Fetch the active project's title for the header badge.
  useEffect(() => {
    if (!projectId) {
      setProjectTitle(null);
      return;
    }
    let alive = true;
    fetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.project) setProjectTitle(d.project.title);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Fetch the project list whenever a project-scoped agent is active — used
  // by the picker/gate below (and to switch projects without leaving chat).
  useEffect(() => {
    if (!agentMeta.projectScoped) return;
    let alive = true;
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => {
        if (alive) setProjects(d.projects ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [agentMeta.projectScoped]);

  async function saveArtifact() {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agent}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: lastAssistant.content,
          label: agent,
          conversationId,
          projectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSavedPath(data.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Live voice session (ElevenLabs Agents over WebRTC, ADR-005). The voice
  // agent's brain is the same orchestrator prompt as text chat — ElevenLabs
  // calls back into /api/job-description/voice-llm for every turn.
  const conversation = useConversation({
    onMessage: ({ message, role }) => {
      if (!message) return;
      const r = role === "user" ? "user" : "assistant";
      setMessages((prev) => [...prev, { role: r, content: message }]);
      persistVoiceTurn(r, message);
    },
    onError: (message) => setError(message),
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
    },
  });

  const voiceLive =
    voiceStarting ||
    conversation.status === "connecting" ||
    conversation.status === "connected";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendTurn(next: Message[]) {
    setMessages(next);
    setLoading(true);
    setError(null);
    try {
      const out = await postTurn(agent, next, conversationId, projectId);
      setMessages([...next, { role: "assistant", content: out.reply }]);
      if (out.conversationId) {
        setConversationId(out.conversationId);
        conversationIdRef.current = out.conversationId;
      }
      if (agent === "job-description") refreshCoverage(300);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Recent sessions for the selected agent (persistable agents only),
  // scoped to the active project once one is required (ADR-007).
  useEffect(() => {
    if (agentMeta.projectScoped && !projectId) {
      setRecent([]);
      return;
    }
    let alive = true;
    setRecent([]);
    const qp = new URLSearchParams({ agent });
    if (projectId) qp.set("project", projectId);
    fetch(`/api/conversations?${qp.toString()}`)
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d) => {
        if (alive) setRecent(d.conversations ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [agent, projectId, agentMeta.projectScoped]);

  async function resumeConversation(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load session");
      setMessages(data.messages);
      setConversationId(data.id);
      conversationIdRef.current = data.id;
      if (agent === "job-description") refreshCoverage(300);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load session");
    }
  }

  async function startVoice() {
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
        body: JSON.stringify({ messages, conversationId, projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start voice session");
      if (data.conversationId) {
        setConversationId(data.conversationId);
        conversationIdRef.current = data.conversationId;
      }
      conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
        ...(data.extraBody ? { customLlmExtraBody: data.extraBody } : {}),
      });
    } catch (e) {
      setVoiceStarting(false);
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  const intentionalEndRef = useRef(false);

  function endVoice() {
    intentionalEndRef.current = true;
    conversation.endSession();
    setVoiceStarting(false);
  }

  async function send() {
    if (!input.trim() || loading || voiceLive) return;
    stopDictation();
    const text = input;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    await sendTurn([...messages, { role: "user", content: text }]);
  }

  const visibleMessages = messages.filter(
    (m) => !(m.role === "user" && m.content === INTAKE_START)
  );

  const voiceStatusLabel =
    conversation.status === "connected"
      ? conversation.isSpeaking
        ? "Agent is speaking — you can interrupt"
        : "Listening…"
      : "Connecting…";

  return (
    <main style={styles.page}>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.md,.markdown,.txt"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <header style={styles.header}>
        <div style={styles.logo}>{agent === "job-description" ? "JD" : agentMeta.title.slice(0, 1)}</div>
        <div>
          <h1 style={styles.title}>{agentMeta.title.replace(/^\d+ · /, "")}</h1>
          <p style={styles.subtitle}>
            AI Executive Platform · interview-intelligence (internal name)
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <a href="/projects" style={styles.navLink}>
            Projects
          </a>
          <a href="/artifacts" style={styles.navLink}>
            Artifacts
          </a>
          {agentMeta.projectScoped && projectId && (
            <button
              onClick={() => setProjectPickerOpen(true)}
              style={styles.projectBadge}
              title="Switch project"
            >
              📁 {projectTitle ?? "…"}
            </button>
          )}
          <select
            value={agent}
            onChange={(e) => switchAgent(e.target.value as AgentSlug)}
            style={styles.agentSelect}
            aria-label="Choose agent"
          >
            {AGENTS.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.title}
              </option>
            ))}
          </select>
          <UserButton />
        </div>
      </header>

      {agent === "job-description" && coverage && (
        <div style={styles.meterBox}>
          <div style={styles.meterHead}>
            <span style={{ fontWeight: 650 }}>
              Intake progress: {coverage.filter((s) => s.status === "covered").length}/
              {coverage.length} sections covered
              {coverage.some((s) => s.status === "partial") &&
                ` · ${coverage.filter((s) => s.status === "partial").length} partial`}
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
              updates as you talk, type, or upload
            </span>
          </div>
          <div style={styles.meterBar}>
            {coverage.map((s) => (
              <span
                key={s.id}
                title={`${s.id}. ${s.name} — ${s.status}`}
                style={{
                  ...styles.meterSeg,
                  background:
                    s.status === "covered"
                      ? "var(--accent)"
                      : s.status === "partial"
                        ? "var(--accent)"
                        : "var(--border)",
                  opacity: s.status === "partial" ? 0.45 : 1,
                }}
              />
            ))}
          </div>
          {coverage.some((s) => s.status !== "covered") && (
            <div style={styles.meterMissing}>
              Still needed:{" "}
              {coverage
                .filter((s) => s.status !== "covered")
                .map((s) => `${s.name}${s.status === "partial" ? " (partial)" : ""}`)
                .join(" · ")}
            </div>
          )}
        </div>
      )}

      <div style={styles.card}>
        {agentMeta.projectScoped && (!projectId || projectPickerOpen) ? (
          <div style={styles.projectGate}>
            <p style={{ color: "var(--text-muted)", maxWidth: 480, margin: 0 }}>
              This agent&rsquo;s work lives inside a <b>project</b> — the job opening
              its outputs (and every version of them) get filed under. Pick one or
              start a new one.
            </p>
            {projects.length > 0 && (
              <div style={styles.recentBox}>
                <div style={styles.recentHead}>Your projects</div>
                {projects.map((p) => (
                  <button key={p.id} onClick={() => selectProject(p.id, p.title)} style={styles.recentItem}>
                    <span style={styles.recentTitle}>{p.title}</span>
                    <span style={styles.recentMeta}>
                      {p.artifactCount} artifact{p.artifactCount === 1 ? "" : "s"} · {p.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14, width: "100%", maxWidth: 440 }}>
              <input
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    createProject();
                  }
                }}
                placeholder="New project — the role you're hiring for (e.g. Head of DevOps)"
                style={styles.input}
              />
              <button
                onClick={createProject}
                disabled={creatingProject || !newProjectTitle.trim()}
                style={styles.primaryButton}
              >
                {creatingProject ? "Creating…" : "+ Create"}
              </button>
            </div>
            {projectId && projectPickerOpen && (
              <button onClick={() => setProjectPickerOpen(false)} style={{ ...styles.chip, marginTop: 14 }}>
                Cancel — stay in {projectTitle ?? "current project"}
              </button>
            )}
            {error && <div style={{ ...styles.error, marginTop: 14 }}>Error: {error}</div>}
          </div>
        ) : (
        <>
            <div style={styles.messages}>
              {visibleMessages.length === 0 && !voiceLive && !loading && (
                <div style={styles.emptyState}>
                  <p style={{ color: "var(--text-muted)", marginBottom: 16, maxWidth: 480 }}>
                    {agentMeta.hint}
                  </p>
                  {agent === "job-description" && (
                    <button
                      onClick={() => sendTurn([{ role: "user", content: INTAKE_START }])}
                      style={styles.chip}
                      disabled={loading || voiceStarting}
                    >
                      ▶ Let the agent lead — start the intake
                    </button>
                  )}
                  {recent.length > 0 && (
                    <div style={styles.recentBox}>
                      <div style={styles.recentHead}>Resume a session</div>
                      {recent.slice(0, 6).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => resumeConversation(c.id)}
                          style={styles.recentItem}
                        >
                          <span style={styles.recentTitle}>
                            {c.title || "Untitled session"}
                          </span>
                          <span style={styles.recentMeta}>
                            {new Date(c.updatedAt).toLocaleDateString()}
                            {!c.own && ` · ${c.createdBy}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {visibleMessages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.row,
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      ...styles.bubble,
                      background:
                        m.role === "user" ? "var(--bubble-user)" : "var(--bubble-assistant)",
                      color:
                        m.role === "user"
                          ? "var(--bubble-user-text)"
                          : "var(--bubble-assistant-text)",
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ ...styles.row, justifyContent: "flex-start" }}>
                  <div style={{ ...styles.bubble, background: "var(--bubble-assistant)" }}>
                    <span style={styles.typingDot}>●</span>
                    <span style={{ ...styles.typingDot, animationDelay: "0.15s" }}>●</span>
                    <span style={{ ...styles.typingDot, animationDelay: "0.3s" }}>●</span>
                  </div>
                </div>
              )}
              {error && <div style={styles.error}>Error: {error}</div>}
              <div ref={bottomRef} />
            </div>

            {voiceDropped && !voiceLive && (
              <div style={styles.voiceDroppedBar}>
                <span style={{ flex: 1 }}>
                  Voice session ended — every turn is saved. Resume to continue exactly where
                  you left off.
                </span>
                <button onClick={startVoice} style={styles.primaryButton} disabled={voiceStarting}>
                  {voiceStarting ? "Reconnecting…" : "🎙 Resume voice"}
                </button>
                <button onClick={() => setVoiceDropped(false)} style={styles.secondaryButton}>
                  Continue in text
                </button>
              </div>
            )}
            {voiceLive ? (
              <div style={styles.voiceBar}>
                <span
                  style={{
                    ...styles.voiceDot,
                    background:
                      conversation.status === "connected"
                        ? conversation.isSpeaking
                          ? "var(--accent)"
                          : "var(--danger)"
                        : "var(--text-muted)",
                  }}
                />
                <span style={styles.voiceStatus}>{voiceStatusLabel}</span>
                <button
                  onClick={() => conversation.setMuted(!conversation.isMuted)}
                  style={styles.secondaryButton}
                  disabled={conversation.status !== "connected"}
                >
                  {conversation.isMuted ? "Unmute mic" : "Mute mic"}
                </button>
                <button onClick={endVoice} style={styles.dangerButton}>
                  End voice chat
                </button>
              </div>
            ) : (
              <div style={styles.composer}>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={loading || voiceStarting || uploading}
                  title="Add a document (PDF, DOCX, MD, TXT)"
                  aria-label="Add a document"
                  style={styles.iconBtn}
                >
                  {uploading ? "…" : "+"}
                </button>
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={dictating ? "Listening — speak now…" : "Message the agent…"}
                  style={styles.composerInput}
                  rows={1}
                  disabled={loading}
                />
                <button
                  onClick={toggleDictation}
                  disabled={loading || voiceStarting}
                  title={dictating ? "Stop dictating" : "Dictate — your speech becomes text here"}
                  aria-label="Dictate"
                  style={{
                    ...styles.iconBtn,
                    ...(dictating
                      ? { background: "var(--danger)", color: "#fff" }
                      : {}),
                  }}
                >
                  🎤
                </button>
                {agentMeta.voice && (
                  <button
                    onClick={startVoice}
                    disabled={loading || voiceStarting}
                    title="Live voice conversation (keeps the conversation so far)"
                    aria-label="Start live voice conversation"
                    style={styles.iconBtn}
                  >
                    {voiceStarting ? "…" : "🎙"}
                  </button>
                )}
                <button
                  onClick={() => send()}
                  style={{
                    ...styles.sendBtn,
                    ...(input.trim() && !loading ? {} : styles.sendBtnDisabled),
                  }}
                  disabled={loading || !input.trim()}
                  aria-label="Send"
                  title="Send"
                >
                  ↑
                </button>
              </div>
            )}

            <div style={styles.footerRow}>
              <span style={styles.hint}>
                {voiceLive
                  ? "Live voice session — speak naturally, interrupt any time. Ending it keeps the conversation."
                  : agentMeta.voice
                    ? "+ add a document · 🎤 dictate · 🎙 live conversation — context carries across all of them. Shift+Enter for a new line."
                    : "+ add a document · 🎤 dictate · or paste artifacts directly. Shift+Enter for a new line."}
              </span>
              {messages.some((m) => m.role === "assistant") && (
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {savedPath && (
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      Saved: {savedPath}
                    </span>
                  )}
                  <button
                    onClick={saveArtifact}
                    style={styles.secondaryButton}
                    disabled={saving || loading}
                    title="Save the latest agent output to generated/outputs/ (database later)"
                  >
                    {saving ? "Saving…" : "💾 Save artifact"}
                  </button>
                </span>
              )}
            </div>
        </>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "40px 16px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    maxWidth: 720,
    marginBottom: 20,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "var(--accent)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0,
  },
  title: { margin: 0, fontSize: 20, fontWeight: 650 },
  subtitle: { margin: "2px 0 0", fontSize: 13, color: "var(--text-muted)" },
  card: {
    width: "100%",
    maxWidth: 720,
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minHeight: 480,
  },
  emptyState: {
    margin: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "40px 20px",
  },
  chip: {
    padding: "8px 16px",
    borderRadius: 99,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--accent)",
    fontSize: 13.5,
    fontWeight: 550,
    cursor: "pointer",
  },
  composer: {
    display: "flex",
    alignItems: "flex-end",
    gap: 6,
    border: "1px solid var(--border)",
    borderRadius: 24,
    padding: "8px 10px",
    background: "var(--card)",
    boxShadow: "0 1px 3px rgba(16,24,40,0.06)",
  },
  composerInput: {
    flex: 1,
    border: "none",
    outline: "none",
    resize: "none",
    background: "transparent",
    color: "var(--text)",
    fontSize: 14.5,
    lineHeight: 1.5,
    padding: "7px 4px",
    maxHeight: 180,
    fontFamily: "inherit",
  },
  iconBtn: {
    width: 34,
    height: 34,
    flexShrink: 0,
    borderRadius: "50%",
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: 17,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    width: 34,
    height: 34,
    flexShrink: 0,
    borderRadius: "50%",
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontSize: 17,
    fontWeight: 700,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.35,
    cursor: "default",
  },
  messages: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: 520,
    overflowY: "auto",
    paddingRight: 4,
  },
  row: { display: "flex" },
  bubble: {
    padding: "11px 15px",
    borderRadius: 14,
    maxWidth: "82%",
    whiteSpace: "pre-wrap",
    fontSize: 14.5,
    lineHeight: 1.5,
  },
  typingDot: {
    display: "inline-block",
    fontSize: 8,
    animation: "none",
    opacity: 0.5,
    marginRight: 3,
  },
  error: {
    color: "var(--danger)",
    fontSize: 13,
    background: "#fdecea",
    padding: "8px 12px",
    borderRadius: 8,
  },
  inputBar: { display: "flex", gap: 8 },
  voiceBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
  },
  meterBox: {
    width: "100%",
    maxWidth: 720,
    marginBottom: 12,
    padding: "10px 14px",
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },
  meterHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 10,
    fontSize: 13,
  },
  meterBar: { display: "flex", gap: 3 },
  meterSeg: { flex: 1, height: 7, borderRadius: 3 },
  meterMissing: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 },
  voiceDroppedBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid var(--accent)",
    background: "var(--bubble-assistant)",
    fontSize: 13.5,
  },
  voiceDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  voiceStatus: {
    flex: 1,
    fontSize: 14,
    color: "var(--text-muted)",
  },
  micButton: {
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: 10,
    border: "1px solid var(--border)",
    fontSize: 16,
    cursor: "pointer",
    background: "var(--card)",
    color: "var(--text)",
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    fontSize: 14.5,
    background: "var(--card)",
    color: "var(--text)",
  },
  agentSelect: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    fontSize: 13.5,
    background: "var(--card)",
    color: "var(--text)",
    maxWidth: 260,
    cursor: "pointer",
  },
  navLink: {
    fontSize: 13.5,
    fontWeight: 550,
    color: "var(--accent)",
    textDecoration: "none",
  },
  projectBadge: {
    padding: "7px 12px",
    borderRadius: 99,
    border: "1px solid var(--border)",
    background: "var(--bubble-assistant)",
    color: "var(--text)",
    fontSize: 13,
    fontWeight: 550,
    cursor: "pointer",
    maxWidth: 200,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  projectGate: {
    margin: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    padding: "40px 20px",
    width: "100%",
  },
  recentBox: {
    marginTop: 22,
    width: "100%",
    maxWidth: 440,
    textAlign: "left",
    border: "1px solid var(--border)",
    borderRadius: 12,
    overflow: "hidden",
  },
  recentHead: {
    fontSize: 11,
    fontWeight: 650,
    letterSpacing: ".08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    padding: "9px 14px",
    borderBottom: "1px solid var(--border)",
    background: "var(--card)",
  },
  recentItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    textAlign: "left",
    padding: "9px 14px",
    background: "none",
    border: "none",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
    color: "var(--text)",
    fontSize: 13.5,
  },
  recentTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  recentMeta: { color: "var(--text-muted)", fontSize: 12, flexShrink: 0 },
  primaryButton: {
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontSize: 14.5,
    fontWeight: 550,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "10px 18px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--text)",
    fontSize: 14.5,
    fontWeight: 550,
    cursor: "pointer",
  },
  dangerButton: {
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    background: "var(--danger)",
    color: "#fff",
    fontSize: 14.5,
    fontWeight: 550,
    cursor: "pointer",
  },
  footerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 12.5,
    color: "var(--text-muted)",
  },
  hint: { fontStyle: "italic" },
};
