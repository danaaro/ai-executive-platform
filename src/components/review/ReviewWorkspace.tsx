"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileDown, ShieldCheck, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { MarkdownLite } from "./MarkdownLite";
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
 */

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
            {artifact ? (
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

          {approved ? (
            <div className="card-surface p-6 text-center">
              <CheckCircle2 className="mx-auto size-10 text-success" />
              <h3 className="mt-3 font-display text-2xl font-normal text-ink">Approved</h3>
              <p className="mt-2 text-sm text-muted">This job description is final. A change creates a new version.</p>
              <Link href={`/projects/${projectId}`} className="btn btn-ghost mt-5 w-full">
                Back to role
              </Link>
            </div>
          ) : (
            <div className="card-surface p-6">
              <p className="label-mono mb-3">Your decision</p>
              <p className="text-sm text-muted">Read it through, ask the agent to revise, or approve.</p>
              <button
                className="btn btn-gold gold-glow mt-5 w-full"
                onClick={approve}
                disabled={busy || !artifact || !data.canWrite}
              >
                <CheckCircle2 className="size-4" /> {busy ? "Working…" : "Approve"}
              </button>
              {!data.canWrite && <p className="mt-2 text-xs text-faint">View-only access.</p>}
            </div>
          )}

          <div className="card-surface p-6">
            <p className="label-mono mb-3">Download</p>
            {/* Dana 2026-10-29: downloads open at 80% readiness, i.e. as soon as a job description exists, not on approval. */}
            {artifact ? (
              <>
                <a className="btn btn-ghost w-full" href={`/api/artifacts/${artifactId}/download?format=docx`} download>
                  <FileDown className="size-4" /> Word document
                </a>
                <a className="btn btn-ghost mt-2 w-full" href={`/api/artifacts/${artifactId}/download?format=pdf`} download>
                  <FileDown className="size-4" /> PDF
                </a>
              </>
            ) : (
              <Skeleton className="h-20 w-full" />
            )}
            <p className="mt-3 text-xs text-faint">
              This version{artifact ? ` (v${artifact.version}, ${approved ? "approved" : "draft"})` : ""}, with the Role ID in the footer.
            </p>
          </div>

          {!approved && data.canWrite && (
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
