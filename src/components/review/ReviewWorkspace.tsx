"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pencil, Save, ShieldCheck, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { MarkdownLite } from "./MarkdownLite";
import { DownloadMenu } from "./DownloadMenu";
import { parseJson } from "@/lib/api";
import { cleanDeliverable } from "@/shared/clean-deliverable";
import { pendingTurnKey } from "@/components/intake/InterviewWorkspace";
import { relativeTime } from "@/lib/utils";
import type { ProjectDetail } from "@/components/board/stage-types";

/**
 * Job description review — the Lovable mockup's "Review" screen
 * (jobs.$jobId.review): the formatted document on the left; on the right
 * "Your decision" (Approve), "Download" and "Ask the agent".
 *
 * Same approval and request-changes calls as before. A revision request is
 * recorded in the oversight trail, then handed to the interview page, which
 * sends it to the agent as the next turn.
 *
 * Direct editing (Dana, 2026-11-01): "Edit" opens the document section by
 * section; saving stores a new draft version, which is then approved. After
 * approval, "Make changes" does the same from the approved text, so every
 * approved version stays as it was and the next one gets its own approval.
 */

type Section = { heading: string | null; body: string };

/** Splits the Markdown at its "## " headings; the part before the first one is the header. */
function splitSections(md: string): Section[] {
  const out: Section[] = [{ heading: null, body: "" }];
  for (const line of md.split("\n")) {
    const h = /^##\s+(.*)$/.exec(line);
    if (h) out.push({ heading: h[1].trim(), body: "" });
    else out[out.length - 1].body += (out[out.length - 1].body ? "\n" : "") + line;
  }
  return out.map((x) => ({ ...x, body: x.body.trim() })).filter((x) => x.heading !== null || x.body);
}
const joinSections = (secs: Section[]) =>
  secs.map((x) => (x.heading !== null ? `## ${x.heading.trim()}\n\n${x.body.trim()}` : x.body.trim())).join("\n\n") + "\n";

type Artifact = {
  content: string;
  version: number;
  status: "draft" | "approved";
  createdByName: string;
  createdAt: string;
};
type Approval = {
  action: "approved" | "changes_requested";
  note: string | null;
  actorName: string;
  createdAt: string;
};

export function ReviewWorkspace({
  projectId,
  data,
  artifactId,
  onChanged,
}: {
  projectId: string;
  data: ProjectDetail;
  artifactId: string;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revise, setRevise] = useState("");
  const [sections, setSections] = useState<Section[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/artifacts?id=${artifactId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load the draft");
        if (!alive) return;
        setArtifact(d.artifact);
        setApprovals(d.approvals ?? []);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Could not load"));
    return () => {
      alive = false;
    };
  }, [artifactId]);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/artifacts/${artifactId}/approve`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Approve failed");
      setArtifact((a) => (a ? { ...a, status: "approved" } : a));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function requestRevision() {
    if (!revise.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/artifacts/${artifactId}/request-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: revise }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not send the request");
      try {
        sessionStorage.setItem(pendingTurnKey(projectId), d.prompt);
      } catch {
        /* the interview page simply won't auto-send; the note is still logged */
      }
      router.push(`/projects/${projectId}/interview`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the request");
      setBusy(false);
    }
  }

  const approved = artifact?.status === "approved";
  const editing = sections !== null;

  async function saveEdits() {
    if (!sections || !artifact) return;
    const content = joinSections(sections);
    if (content.trim() === cleanDeliverable(artifact.content).trim()) {
      setSections(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await parseJson<{ id: string }>(
        await fetch("/api/agents/job-description/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, projectId, label: "Job description (edited)" }),
        })
      );
      onChanged();
      router.replace(`/projects/${projectId}/review?artifact=${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your changes");
      setBusy(false);
    }
  }
  const startEditing = () => artifact && setSections(splitSections(cleanDeliverable(artifact.content)));

  return (
    <>
      <AppHeader
        breadcrumb={
          <span className="truncate text-sm text-muted">
            <Link href="/projects" className="hover:text-ink">
              Executive roles
            </Link>{" "}
            /{" "}
            <Link href={`/projects/${projectId}`} className="hover:text-ink">
              {data.project.title}
            </Link>{" "}
            / Review
          </span>
        }
      />
      <main className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_300px]">
        <article className="min-w-0">
          <p className="label-mono mb-3">
            {artifact ? `Job description · ${approved ? "Approved" : "Draft"} v${artifact.version}` : "Job description"}
          </p>
          <h1 className="font-display text-5xl font-normal text-ink">{data.project.title}</h1>
          {artifact && (
            <p className="mt-3 text-xs text-faint">
              by {artifact.createdByName} · {relativeTime(artifact.createdAt)}
            </p>
          )}
          <div className="mt-8 text-[15px]">
            {editing ? (
              <div className="space-y-6">
                <p className="text-xs text-faint">
                  Edit any section. Keep &quot;- &quot; at the start of a bullet line, and **text** for bold. Saving creates a new version; the current one stays as it is.
                </p>
                {sections!.map((sec, i) => (
                  <div key={i} className="card-surface p-4">
                    {sec.heading !== null ? (
                      <input
                        className="field mb-2 font-display text-lg"
                        value={sec.heading}
                        aria-label="Section heading"
                        onChange={(e) => setSections((x) => x!.map((y, j) => (j === i ? { ...y, heading: e.target.value } : y)))}
                      />
                    ) : (
                      <p className="label-mono mb-2">Header</p>
                    )}
                    <textarea
                      className="field font-mono text-[13px] leading-relaxed"
                      style={{ minHeight: `${Math.min(40, Math.max(4, sec.body.split("\n").length + 1)) * 1.6}em` }}
                      value={sec.body}
                      aria-label={sec.heading ?? "Header"}
                      onChange={(e) => setSections((x) => x!.map((y, j) => (j === i ? { ...y, body: e.target.value } : y)))}
                    />
                  </div>
                ))}
              </div>
            ) : artifact ? (
              <MarkdownLite text={cleanDeliverable(artifact.content)} />
            ) : error ? null : (
              <div className="space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}
          </div>

          {approvals.length > 0 && (
            <div className="mt-10 border-t border-line pt-6">
              <p className="label-mono mb-3 flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" /> Oversight trail
              </p>
              <ul className="space-y-2 text-sm">
                {approvals.map((a, i) => (
                  <li key={i}>
                    <span className="text-ink">{a.action === "approved" ? "Approved" : "Changes requested"}</span>
                    <span className="text-muted">
                      {" "}
                      by {a.actorName} · {relativeTime(a.createdAt)}
                    </span>
                    {a.note && <p className="mt-0.5 italic text-muted">“{a.note}”</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {error && <Alert tone="danger">{error}</Alert>}

          {editing ? (
            <div className="card-surface p-6">
              <p className="label-mono mb-3">Editing</p>
              <p className="text-sm text-muted">Your changes are saved as v{(data.stages.find((s) => s.slug === "job-description")?.latest?.version ?? artifact?.version ?? 0) + 1}, a new draft. Then approve it.</p>
              <button className="btn btn-gold gold-glow mt-5 w-full" onClick={saveEdits} disabled={busy}>
                <Save className="size-4" /> {busy ? "Saving…" : "Save as new version"}
              </button>
              <button className="btn btn-ghost mt-2 w-full" onClick={() => setSections(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          ) : approved ? (
            <div className="card-surface p-6 text-center">
              <CheckCircle2 className="mx-auto size-10 text-success" />
              <h3 className="mt-3 font-display text-2xl font-normal text-ink">Approved</h3>
              <p className="mt-2 text-sm text-muted">This version is locked. Changes are saved as a new version, which you approve again.</p>
              {data.canWrite && (
                <button className="btn btn-gold mt-5 w-full" onClick={startEditing}>
                  <Pencil className="size-4" /> Make changes
                </button>
              )}
              <Link href={`/projects/${projectId}`} className="btn btn-ghost mt-2 w-full">
                Back to role
              </Link>
            </div>
          ) : (
            <div className="card-surface p-6">
              <p className="label-mono mb-3">Your decision</p>
              <p className="text-sm text-muted">Read it through. Change the text yourself or ask the agent to revise, then approve.</p>
              {data.canWrite && (
                <button className="btn btn-ghost mt-5 w-full border border-accent text-accent" onClick={startEditing} disabled={busy || !artifact}>
                  <Pencil className="size-4" /> Edit the text
                </button>
              )}
              <button
                className="btn btn-gold gold-glow mt-2 w-full"
                onClick={approve}
                disabled={busy || !artifact || !data.canWrite}
              >
                <CheckCircle2 className="size-4" /> {busy ? "Working…" : "Approve"}
              </button>
              {!data.canWrite && <p className="mt-2 text-xs text-faint">View-only access.</p>}
            </div>
          )}

          {artifact && !editing && (
            <DownloadMenu
              artifactId={artifactId}
              note={`This version (v${artifact.version}, ${approved ? "approved" : "draft"}), with the Role ID in the footer.`}
            />
          )}

          {!approved && !editing && data.canWrite && (
            <div className="card-surface p-6">
              <p className="label-mono mb-3">Ask the agent</p>
              <textarea
                className="field min-h-24 resize-none"
                autoFocus
                placeholder="e.g. Make the opportunity sharper and shorten the mandate"
                value={revise}
                onChange={(e) => setRevise(e.target.value)}
              />
              <button className="btn btn-ghost mt-3 w-full" disabled={busy || !revise.trim()} onClick={requestRevision}>
                <Sparkles className="size-4" /> Revise draft
              </button>
            </div>
          )}

          <Link
            href={`/projects/${projectId}/interview`}
            className="block text-center text-sm text-muted hover:text-ink"
          >
            ← Back to interview
          </Link>
        </aside>
      </main>
    </>
  );
}
