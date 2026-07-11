"use client";

import { useState } from "react";

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

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  async function start() {
    setStarted(true);
    setLoading(true);
    setError(null);
    try {
      const kickoff: Message[] = [
        { role: "user", content: "Start the NEW JOB intake session." },
      ];
      const reply = await postTurn(kickoff);
      setMessages([...kickoff, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!input.trim() || loading) return;
    const next: Message[] = [...messages, { role: "user", content: input }];
    setMessages(next);
    setInput("");
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

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "2rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <div>
        <h1 style={{ marginBottom: 4 }}>Job Description Agent</h1>
        <p style={{ color: "#666", marginTop: 0, fontSize: 14 }}>
          Test harness — AI Executive Platform / interview-intelligence (internal name).
        </p>
      </div>

      {!started && (
        <button onClick={start} style={buttonStyle} disabled={loading}>
          Start NEW JOB intake
        </button>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {messages
          .filter((m) => !(m.role === "user" && m.content === "Start the NEW JOB intake session."))
          .map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "#111" : "#f1f1f1",
                color: m.role === "user" ? "#fff" : "#111",
                padding: "10px 14px",
                borderRadius: 10,
                maxWidth: "85%",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          ))}
        {loading && <div style={{ color: "#888" }}>Thinking…</div>}
        {error && <div style={{ color: "#c00" }}>Error: {error}</div>}
      </div>

      {started && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Your answer…"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 14,
            }}
            disabled={loading}
          />
          <button onClick={send} style={buttonStyle} disabled={loading}>
            Send
          </button>
        </div>
      )}
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
  fontSize: 14,
  cursor: "pointer",
};
