"use client";

import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";

type Project = {
  id: string;
  title: string;
  status: "open" | "filled" | "archived";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  artifactCount: number;
};

/**
 * Projects (ADR-007): the unique key everything else — job description,
 * competencies, panel, interview system, every version — hangs off. This is
 * the new landing surface for project-scoped work; each card opens the
 * per-project workspace.
 */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        setProjects(d.projects ?? []);
        setIsAdmin(Boolean(d.isAdmin));
      })
      .catch(() => setError("Could not load projects"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function createProject() {
    const t = title.trim();
    if (!t) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create project");
      setTitle("");
      window.location.href = `/projects/${data.project.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create project");
      setCreating(false);
    }
  }

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div style={s.logo}>P</div>
        <div>
          <h1 style={s.title}>Projects</h1>
          <p style={s.subtitle}>
            One project per hiring role — every artifact and version lives inside it
            {isAdmin ? " · admin view (all users)" : ""}
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <a href="/" style={s.navLink}>← Back to chat</a>
          <a href="/artifacts" style={s.navLink}>Artifacts</a>
          <UserButton />
        </div>
      </header>

      <div style={s.createBar}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              createProject();
            }
          }}
          placeholder="New project — the role you're hiring for (e.g. Head of DevOps)"
          style={s.input}
        />
        <button onClick={createProject} disabled={creating || !title.trim()} style={s.primaryButton}>
          {creating ? "Creating…" : "+ New project"}
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}
      {loading && <p style={s.muted}>Loading…</p>}
      {!loading && projects.length === 0 && (
        <p style={s.muted}>
          No projects yet. Create one above — it becomes the home for this role&rsquo;s
          job description, competencies, panel, and interview system, all versioned together.
        </p>
      )}

      <div style={s.grid}>
        {projects.map((p) => (
          <a key={p.id} href={`/projects/${p.id}`} style={s.card}>
            <div style={s.cardHead}>
              <span style={s.cardTitle}>{p.title}</span>
              <span style={{ ...s.pill, ...(p.status === "open" ? s.pillOpen : s.pillOther) }}>
                {p.status}
              </span>
            </div>
            <div style={s.cardMeta}>
              {p.artifactCount} artifact{p.artifactCount === 1 ? "" : "s"}
              {isAdmin && ` · ${p.createdBy}`}
            </div>
            <div style={s.cardMeta}>Updated {new Date(p.updatedAt).toLocaleDateString()}</div>
          </a>
        ))}
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "flex", flexDirection: "column", padding: "40px 16px", maxWidth: 1100, margin: "0 auto", gap: 20 },
  header: { display: "flex", alignItems: "center", gap: 14 },
  logo: { width: 40, height: 40, borderRadius: 10, background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 },
  title: { margin: 0, fontSize: 20, fontWeight: 650 },
  subtitle: { margin: "2px 0 0", fontSize: 13, color: "var(--text-muted)" },
  navLink: { fontSize: 13.5, fontWeight: 550, color: "var(--accent)", textDecoration: "none" },
  createBar: { display: "flex", gap: 10 },
  input: { flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 14.5, background: "var(--card)", color: "var(--text)" },
  primaryButton: { padding: "10px 18px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontSize: 14.5, fontWeight: 550, cursor: "pointer", whiteSpace: "nowrap" },
  error: { color: "var(--danger)", fontSize: 13 },
  muted: { color: "var(--text-muted)", fontSize: 13.5 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 },
  card: { display: "flex", flexDirection: "column", gap: 6, padding: 16, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", textDecoration: "none", color: "var(--text)", boxShadow: "0 1px 2px rgba(16,24,40,0.04)" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { fontWeight: 650, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cardMeta: { fontSize: 12.5, color: "var(--text-muted)" },
  pill: { borderRadius: 99, padding: "2px 9px", fontSize: 10.5, fontWeight: 650, flexShrink: 0 },
  pillOpen: { background: "var(--accent)", color: "#fff" },
  pillOther: { background: "var(--bubble-assistant)", color: "var(--text-muted)", border: "1px solid var(--border)" },
};
