"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

type Artifact = {
  id: string;
  agentSlug: string;
  version: number;
  label: string;
  status: "draft" | "approved";
  createdAt: string;
};

type Slot = { slug: string; title: string; latest: Artifact | null; history: Artifact[] };

type Detail = {
  project: { id: string; title: string; status: string; createdAt: string; updatedAt: string };
  isOwner: boolean;
  slots: Slot[];
  conversations: { id: string; agentSlug: string; title: string | null; updatedAt: string }[];
};

/**
 * Project workspace (ADR-007): the board Dana asked for — one hiring role,
 * every chained artifact (JD → competencies → panel → interview system)
 * visible as slots with their version history, plus in-progress sessions.
 */
export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${params.id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load project");
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load project"));
  }, [params.id]);

  if (error) {
    return (
      <main style={s.page}>
        <div style={s.error}>{error}</div>
        <a href="/projects" style={s.navLink}>← Back to projects</a>
      </main>
    );
  }
  if (!data) {
    return (
      <main style={s.page}>
        <p style={s.muted}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div style={s.logo}>{data.project.title.slice(0, 1).toUpperCase()}</div>
        <div>
          <h1 style={s.title}>{data.project.title}</h1>
          <p style={s.subtitle}>
            {data.project.status} · created {new Date(data.project.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <a href="/projects" style={s.navLink}>← Projects</a>
          <a href="/artifacts" style={s.navLink}>Artifacts</a>
          <UserButton />
        </div>
      </header>

      <div style={s.slotGrid}>
        {data.slots.map((slot) => (
          <div key={slot.slug} style={s.slotCard}>
            <div style={s.slotHead}>
              <span style={s.slotTitle}>{slot.title.replace(/^\S+ · /, "")}</span>
              {slot.latest && (
                <span style={{ ...s.pill, ...(slot.latest.status === "approved" ? s.pillOk : s.pillDraft) }}>
                  v{slot.latest.version} · {slot.latest.status}
                </span>
              )}
            </div>
            {slot.latest ? (
              <p style={s.slotMeta}>
                Last updated {new Date(slot.latest.createdAt).toLocaleDateString()}
                {slot.history.length > 1 && ` · ${slot.history.length} versions`}
              </p>
            ) : (
              <p style={s.slotMeta}>No artifact saved yet.</p>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <a
                href={`/?agent=${slot.slug}&project=${data.project.id}`}
                style={s.primaryButton}
              >
                {slot.latest ? "Continue in chat" : "Start"}
              </a>
              {slot.history.length > 0 && (
                <button
                  onClick={() => setExpanded(expanded === slot.slug ? null : slot.slug)}
                  style={s.secondaryButton}
                >
                  {expanded === slot.slug ? "Hide history" : "History"}
                </button>
              )}
            </div>
            {expanded === slot.slug && (
              <div style={s.historyList}>
                {slot.history.map((h) => (
                  <div key={h.id} style={s.historyRow}>
                    <span>v{h.version}</span>
                    <span style={{ ...s.pill, ...(h.status === "approved" ? s.pillOk : s.pillDraft) }}>
                      {h.status}
                    </span>
                    <span style={s.slotMeta}>{new Date(h.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {data.conversations.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={s.sectionHead}>In-progress sessions</div>
          <div style={s.list}>
            {data.conversations.map((c) => (
              <a
                key={c.id}
                href={`/?agent=${c.agentSlug}&project=${data.project.id}`}
                style={s.listItem}
              >
                <span style={s.slotMeta}>{c.agentSlug}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.title || "Untitled session"}
                </span>
                <span style={s.slotMeta}>{new Date(c.updatedAt).toLocaleDateString()}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "flex", flexDirection: "column", padding: "40px 16px", maxWidth: 1100, margin: "0 auto", gap: 20 },
  header: { display: "flex", alignItems: "center", gap: 14 },
  logo: { width: 40, height: 40, borderRadius: 10, background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 },
  title: { margin: 0, fontSize: 20, fontWeight: 650 },
  subtitle: { margin: "2px 0 0", fontSize: 13, color: "var(--text-muted)", textTransform: "capitalize" },
  navLink: { fontSize: 13.5, fontWeight: 550, color: "var(--accent)", textDecoration: "none" },
  muted: { color: "var(--text-muted)", fontSize: 13.5 },
  error: { color: "var(--danger)", fontSize: 13.5, marginBottom: 12 },
  slotGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 },
  slotCard: { display: "flex", flexDirection: "column", gap: 8, padding: 16, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)" },
  slotHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  slotTitle: { fontWeight: 650, fontSize: 14.5 },
  slotMeta: { fontSize: 12.5, color: "var(--text-muted)" },
  pill: { borderRadius: 99, padding: "2px 9px", fontSize: 10.5, fontWeight: 650, flexShrink: 0 },
  pillOk: { background: "var(--accent)", color: "#fff" },
  pillDraft: { background: "var(--bubble-assistant)", color: "var(--text-muted)", border: "1px solid var(--border)" },
  primaryButton: { padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 550, cursor: "pointer", textDecoration: "none", display: "inline-block" },
  secondaryButton: { padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13, fontWeight: 550, cursor: "pointer" },
  historyList: { display: "flex", flexDirection: "column", gap: 4, marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--border)" },
  historyRow: { display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 },
  sectionHead: { fontSize: 11, fontWeight: 650, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 },
  list: { display: "flex", flexDirection: "column", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" },
  listItem: { display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--border)", textDecoration: "none", color: "var(--text)", fontSize: 13.5, background: "var(--card)" },
};
