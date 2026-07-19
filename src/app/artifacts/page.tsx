"use client";

import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";

type ArtifactRow = {
  id: string;
  agentSlug: string;
  version: number;
  label: string;
  status: "draft" | "approved";
  createdBy: string;
  createdAt: string;
};

type ArtifactFull = ArtifactRow & { content: string };

export default function ArtifactsPage() {
  const [rows, setRows] = useState<ArtifactRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selected, setSelected] = useState<ArtifactFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/artifacts")
      .then((r) => r.json())
      .then((d) => {
        setRows(d.artifacts ?? []);
        setIsAdmin(Boolean(d.isAdmin));
      })
      .catch(() => setError("Could not load artifacts"))
      .finally(() => setLoading(false));
  }, []);

  async function open(id: string) {
    setError(null);
    const res = await fetch(`/api/artifacts?id=${id}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not load artifact");
      return;
    }
    setSelected(data.artifact);
  }

  // Group by agent slug; latest version first within each group.
  const groups = new Map<string, ArtifactRow[]>();
  for (const r of rows) {
    const g = groups.get(r.agentSlug) ?? [];
    g.push(r);
    groups.set(r.agentSlug, g);
  }
  for (const g of groups.values()) g.sort((a, b) => b.version - a.version);

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div style={s.logo}>A</div>
        <div>
          <h1 style={s.title}>Artifacts</h1>
          <p style={s.subtitle}>
            Saved agent outputs · versioned per agent{isAdmin ? " · admin view (all users)" : ""}
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <a href="/" style={s.navLink}>← Back to chat</a>
          <UserButton />
        </div>
      </header>

      <div style={s.layout}>
        <div style={s.list}>
          {loading && <p style={s.muted}>Loading…</p>}
          {!loading && rows.length === 0 && (
            <p style={s.muted}>
              Nothing saved yet. Run an agent in the chat and press 💾 Save artifact —
              it will appear here, versioned.
            </p>
          )}
          {[...groups.entries()].map(([slug, items]) => (
            <div key={slug} style={{ marginBottom: 18 }}>
              <div style={s.groupHead}>{slug}</div>
              {items.map((r) => (
                <button
                  key={r.id}
                  onClick={() => open(r.id)}
                  style={{
                    ...s.item,
                    ...(selected?.id === r.id ? s.itemActive : {}),
                  }}
                >
                  <span style={s.itemLabel}>
                    v{r.version} · {r.label}
                  </span>
                  <span style={s.itemMeta}>
                    <span style={{ ...s.pill, ...(r.status === "approved" ? s.pillOk : s.pillDraft) }}>
                      {r.status}
                    </span>
                    {new Date(r.createdAt).toLocaleDateString()}
                    {isAdmin && ` · ${r.createdBy}`}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div style={s.detail}>
          {error && <div style={s.error}>{error}</div>}
          {!selected && !error && (
            <p style={s.muted}>Select an artifact to view its content.</p>
          )}
          {selected && (
            <>
              <div style={s.detailHead}>
                <b>
                  {selected.agentSlug} · v{selected.version}
                </b>
                <button
                  style={s.copyBtn}
                  onClick={() => navigator.clipboard.writeText(selected.content)}
                >
                  Copy content
                </button>
              </div>
              <pre style={s.content}>{selected.content}</pre>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "flex", flexDirection: "column", padding: "40px 16px", maxWidth: 1100, margin: "0 auto" },
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20 },
  logo: { width: 40, height: 40, borderRadius: 10, background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 },
  title: { margin: 0, fontSize: 20, fontWeight: 650 },
  subtitle: { margin: "2px 0 0", fontSize: 13, color: "var(--text-muted)" },
  navLink: { fontSize: 13.5, fontWeight: 550, color: "var(--accent)", textDecoration: "none" },
  layout: { display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, alignItems: "start" },
  list: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, maxHeight: "72vh", overflowY: "auto" },
  groupHead: { fontSize: 11, fontWeight: 650, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-muted)", margin: "4px 0 6px" },
  item: { display: "flex", flexDirection: "column", gap: 2, width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid transparent", background: "none", cursor: "pointer", color: "var(--text)", fontSize: 13.5 },
  itemActive: { borderColor: "var(--accent)", background: "var(--bubble-assistant)" },
  itemLabel: { fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  itemMeta: { display: "flex", gap: 8, alignItems: "center", color: "var(--text-muted)", fontSize: 12 },
  pill: { borderRadius: 99, padding: "0 8px", fontSize: 10.5, fontWeight: 650 },
  pillDraft: { background: "var(--bubble-assistant)", color: "var(--text-muted)", border: "1px solid var(--border)" },
  pillOk: { background: "var(--accent)", color: "#fff" },
  detail: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, minHeight: 300, maxHeight: "72vh", overflowY: "auto" },
  detailHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  copyBtn: { padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 12.5, cursor: "pointer" },
  content: { whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.55, fontFamily: "inherit", margin: 0 },
  muted: { color: "var(--text-muted)", fontSize: 13.5 },
  error: { color: "var(--danger)", fontSize: 13 },
};
