"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

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

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  window.speechSynthesis.speak(utterance);
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SpeechRecognitionCtor);
  }, []);

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
      if (voiceReplies) speak(reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function start() {
    setStarted(true);
    await sendTurn([{ role: "user", content: "Start the NEW JOB intake session." }]);
  }

  async function send(overrideText?: string) {
    const text = overrideText ?? input;
    if (!text.trim() || loading) return;
    setInput("");
    await sendTurn([...messages, { role: "user", content: text }]);
  }

  function toggleListening() {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };
    recognition.onend = () => {
      setListening(false);
      setVoiceReplies(true);
      setInput((current) => {
        if (current.trim()) send(current);
        return current;
      });
    };
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  const visibleMessages = messages.filter(
    (m) => !(m.role === "user" && m.content === "Start the NEW JOB intake session.")
  );

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
      </header>

      <div style={styles.card}>
        {!started ? (
          <div style={styles.emptyState}>
            <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>
              Start a NEW JOB intake session. Answer by typing or speaking — the
              agent asks one question at a time.
            </p>
            <button onClick={start} style={styles.primaryButton} disabled={loading}>
              Start NEW JOB intake
            </button>
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

            <div style={styles.inputBar}>
              <button
                onClick={toggleListening}
                disabled={!voiceSupported || loading}
                title={
                  voiceSupported
                    ? listening
                      ? "Stop listening"
                      : "Speak your answer"
                    : "Voice input not supported in this browser"
                }
                style={{
                  ...styles.micButton,
                  background: listening ? "var(--danger)" : "var(--card)",
                  color: listening ? "#fff" : "var(--text)",
                }}
              >
                {listening ? "●" : "🎤"}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={listening ? "Listening…" : "Type your answer…"}
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

            <div style={styles.footerRow}>
              <label style={styles.voiceToggle}>
                <input
                  type="checkbox"
                  checked={voiceReplies}
                  onChange={(e) => setVoiceReplies(e.target.checked)}
                />
                Read replies aloud
              </label>
              {!voiceSupported && (
                <span style={styles.hint}>
                  Voice input needs Chrome or Edge (not supported in this browser).
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
  micButton: {
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: 10,
    border: "1px solid var(--border)",
    fontSize: 16,
    cursor: "pointer",
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
  footerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 12.5,
    color: "var(--text-muted)",
  },
  voiceToggle: { display: "flex", alignItems: "center", gap: 6 },
  hint: { fontStyle: "italic" },
};
