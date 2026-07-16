"use client";

import { useEffect, useRef, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { ConversationProvider, useConversation } from "@elevenlabs/react";

type Message = { role: "user" | "assistant"; content: string };

const INTAKE_START = "Start the NEW JOB intake session.";

async function postTurn(messages: Message[]): Promise<string> {
  const res = await fetch("/api/job-description", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data.reply as string;
}

export default function Home() {
  return (
    <ConversationProvider>
      <JobDescriptionAgent />
    </ConversationProvider>
  );
}

function JobDescriptionAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [voiceStarting, setVoiceStarting] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Live voice session (ElevenLabs Agents over WebRTC, ADR-005). The voice
  // agent's brain is the same orchestrator prompt as text chat — ElevenLabs
  // calls back into /api/job-description/voice-llm for every turn.
  const conversation = useConversation({
    onMessage: ({ message, role }) => {
      if (!message) return;
      setMessages((prev) => [
        ...prev,
        { role: role === "user" ? "user" : "assistant", content: message },
      ]);
    },
    onError: (message) => setError(message),
    onConnect: () => setVoiceStarting(false),
    onDisconnect: () => setVoiceStarting(false),
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
      const reply = await postTurn(next);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function startTyped() {
    setStarted(true);
    await sendTurn([{ role: "user", content: INTAKE_START }]);
  }

  async function startVoice() {
    setError(null);
    setVoiceStarting(true);
    try {
      const res = await fetch("/api/job-description/voice-token");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start voice session");
      setStarted(true);
      conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
      });
    } catch (e) {
      setVoiceStarting(false);
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  function endVoice() {
    conversation.endSession();
    setVoiceStarting(false);
  }

  async function send() {
    if (!input.trim() || loading || voiceLive) return;
    const text = input;
    setInput("");
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
      <header style={styles.header}>
        <div style={styles.logo}>JD</div>
        <div>
          <h1 style={styles.title}>Job Description Agent</h1>
          <p style={styles.subtitle}>
            AI Executive Platform · interview-intelligence (internal name)
          </p>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <UserButton />
        </div>
      </header>

      <div style={styles.card}>
        {!started ? (
          <div style={styles.emptyState}>
            <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
              Start a NEW JOB intake session — have a live voice conversation,
              or type. The agent asks one question at a time.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={startVoice}
                style={styles.primaryButton}
                disabled={loading || voiceStarting}
              >
                {voiceStarting ? "Connecting…" : "🎙 Start voice conversation"}
              </button>
              <button
                onClick={startTyped}
                style={styles.secondaryButton}
                disabled={loading || voiceStarting}
              >
                Start by typing
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={styles.messages}>
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
              <div style={styles.inputBar}>
                <button
                  onClick={startVoice}
                  disabled={loading || voiceStarting}
                  title="Switch to a live voice conversation"
                  style={styles.micButton}
                >
                  🎙
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Type your answer…"
                  style={styles.input}
                  disabled={loading}
                />
                <button
                  onClick={() => send()}
                  style={styles.primaryButton}
                  disabled={loading || !input.trim()}
                >
                  Send
                </button>
              </div>
            )}

            <div style={styles.footerRow}>
              <span style={styles.hint}>
                {voiceLive
                  ? "Live voice session — speak naturally, interrupt any time."
                  : "🎙 switches to a live voice conversation (mic permission required)."}
              </span>
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
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "40px 20px",
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
