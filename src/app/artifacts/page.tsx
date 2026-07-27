"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { relativeTime, cn } from "@/lib/utils";

/**
 * Artifact library (#1b, fourth frame) — a two-pane list/detail over every
 * versioned artifact the viewer can reach, grouped by position first
 * (ADR-007: the project is the key everything hangs off).
 *
 * The list carries `projectTitle` from the API, so no second fetch is needed.
 */

type ArtifactRow = {
  id: string;
  projectId: string;
  projectTitle: string;
  agentSlug: string;
  version: number;
  label: string;
  status: "draft" | "approved";
  createdBy: string;
  createdAt: string;
};

type ArtifactFull = ArtifactRow & { content: string; createdByName?: string };
type Approval = {
  action: "approved" | "changes_requested";
  note: string | null;
  actorName: string;
  createdAt: string;
};

export default function ArtifactsPage() {
  const [rows, setRows] = useState<ArtifactRow[] | null>(null);
  const [selected, setSelected] = useState<ArtifactFull | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/artifacts")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load artifacts");
        setRows(d.artifacts ?? []);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Could not load artifacts");
        setRows([]);
      });
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
    setApprovals(data.approvals ?? []);
  }

  // Group by position, newest activity first.
  const groups = new Map<string, { title: string; items: ArtifactRow[] }>();
  for (const r of rows ?? []) {
    const g = groups.get(r.projectId) ?? { title: r.projectTitle, items: [] };
    g.items.push(r);
    groups.set(r.projectId, g);
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-display text-[22px] font-semibold text-ink">Artifacts</h1>
        <p className="mt-1 text-[13px] text-muted">
          Every saved version, grouped by hiring position. Approved versions are the ones that feed
          downstream stages.
        </p>

        {error && (
          <Alert tone="danger" className="mt-5">
            {error}
          </Alert>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          {/* List pane */}
          <div className="flex flex-col gap-5">
            {rows === null ? (
              <>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : groups.size === 0 ? (
              <div className="rounded-card border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-muted">
                Nothing saved yet. Run a stage and save its draft.
              </div>
            ) : (
              [...groups.entries()].map(([projectId, group]) => (
                <section key={projectId}>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h2 className="truncate font-display text-[13px] font-semibold text-ink">
                      {group.title}
                    </h2>
                    <Link
                      href={`/projects/${projectId}`}
                      className="shrink-0 text-[11.5px] font-medium text-accent-ink hover:underline"
                    >
                      Board →
                    </Link>
                  </div>
                  <ul className="overflow-hidden rounded-card border border-line">
                    {group.items.map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => open(r.id)}
                          className={cn(
                            "flex w-full items-center gap-2 border-b border-line bg-card px-3 py-2.5 text-left last:border-b-0 transition-colors hover:bg-canvas-subtle",
                            selected?.id === r.id && "bg-accent-wash"
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-ink">
                              {r.label}
                            </span>
                            <span className="text-[11px] text-muted">
                              {relativeTime(r.createdAt)} · {r.createdBy}
                            </span>
                          </span>
                          <Badge tone={r.status === "approved" ? "done" : "draft"}>
                            v{r.version}
                          </Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>

          {/* Detail pane */}
          <div className="rounded-card border border-line bg-card">
            {!selected ? (
              <p className="px-5 py-8 text-center text-[13px] text-muted">
                Select an artifact to read it.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
                  <h2 className="font-display text-[14px] font-semibold text-ink">
                    {selected.label}
                  </h2>
                  <Badge tone={selected.status === "approved" ? "done" : "draft"}>
                    v{selected.version} · {selected.status}
                  </Badge>
                  <span className="text-[11.5px] text-muted">
                    {selected.projectTitle} · {relativeTime(selected.createdAt)}
                  </span>
                </div>

                <article className="max-h-[62vh] overflow-y-auto whitespace-pre-wrap px-5 py-4 text-[13.5px] leading-[1.7] text-ink">
                  {selected.content}
                </article>

                {approvals.length > 0 && (
                  <div className="border-t border-line px-5 py-3">
                    <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                      Oversight trail
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {approvals.map((a, i) => (
                        <li key={i} className="text-[12px] leading-snug text-muted">
                          <span className="font-medium text-ink">
                            {a.action === "approved" ? "Approved" : "Changes requested"}
                          </span>{" "}
                          by {a.actorName} · {relativeTime(a.createdAt)}
                          {a.note && <span className="italic"> — “{a.note}”</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
