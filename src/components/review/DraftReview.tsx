"use client";

import { useEffect, useState } from "react";
import { Check, PencilLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Textarea, Label, Separator } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { relativeTime } from "@/lib/utils";

/**
 * Draft review (#3d step 1) — where a generated artifact becomes the approved
 * version that feeds the next stage.
 *
 * Renders in the WIDE drawer (640px, not the wireframe's 300px): a 700-word
 * job description cannot be judged in a narrow column, and approving
 * something you can't read properly defeats the human-oversight point.
 */

type Approval = {
  action: "approved" | "changes_requested";
  note: string | null;
  actorName: string;
  createdAt: string;
};

export function DraftReview({
  artifactId,
  stageName,
  canWrite,
  onApproved,
  onRequestChanges,
}: {
  artifactId: string;
  stageName: string;
  canWrite: boolean;
  onApproved: () => void;
  onRequestChanges: (prompt: string) => void;
}) {
  const [artifact, setArtifact] = useState<{
    content: string;
    version: number;
    status: "draft" | "approved";
    createdByName: string;
    createdAt: string;
  } | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [note, setNote] = useState("");

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
      onApproved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitChanges() {
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/artifacts/${artifactId}/request-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not record the request");
      setChangesOpen(false);
      setNote("");
      // The agent revises in the chat thread; its answer is saved as a new
      // version, which is what makes the v-chips on the board meaningful.
      onRequestChanges(d.prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the request");
    } finally {
      setBusy(false);
    }
  }

  if (error && !artifact) {
    return <Alert tone="danger" className="m-4">{error}</Alert>;
  }
  if (!artifact) {
    return <p className="p-4 text-[13px] text-muted">Loading draft…</p>;
  }

  const approved = artifact.status === "approved";

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <Badge tone={approved ? "done" : "draft"}>
              v{artifact.version} · {approved ? "approved" : "draft"}
            </Badge>
            <span className="text-[11.5px] text-muted">
              by {artifact.createdByName} · {relativeTime(artifact.createdAt)}
            </span>
          </div>
        </div>

        <article className="whitespace-pre-wrap px-5 py-4 font-sans text-[13.5px] leading-[1.7] text-ink">
          {artifact.content}
        </article>

        {approvals.length > 0 && (
          <div className="px-5 pb-5">
            <Separator className="mb-3" />
            <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
              <ShieldCheck className="size-3.5" /> Oversight trail
            </p>
            <ul className="flex flex-col gap-2">
              {approvals.map((a, i) => (
                <li key={i} className="text-[12px] leading-snug">
                  <span className="font-medium text-ink">
                    {a.action === "approved" ? "Approved" : "Changes requested"}
                  </span>
                  <span className="text-muted">
                    {" "}
                    by {a.actorName} · {relativeTime(a.createdAt)}
                  </span>
                  {a.note && <p className="mt-0.5 text-muted italic">“{a.note}”</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {error && <Alert tone="danger" className="mx-4 mb-2">{error}</Alert>}

      {canWrite && !approved && (
        <div className="flex gap-2 border-t border-line bg-canvas-subtle px-4 py-3">
          <Button variant="secondary" onClick={() => setChangesOpen(true)} disabled={busy}>
            <PencilLine /> Request changes
          </Button>
          <Button variant="primary" className="flex-1" onClick={approve} disabled={busy}>
            <Check /> {busy ? "Approving…" : "Approve"}
          </Button>
        </div>
      )}

      {approved && (
        <Alert tone="accent" className="m-4">
          <Check className="mt-0.5 size-4 shrink-0" />
          <span>
            Approved — this version now feeds the next stage. A further revision creates a new
            version to approve.
          </span>
        </Alert>
      )}

      {!canWrite && (
        <Alert tone="info" className="m-4">
          You have view-only access to this position, so you can read drafts but not approve them.
        </Alert>
      )}

      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogContent className="w-[min(520px,calc(100vw-32px))]">
          <DialogTitle>Request changes to the {stageName.toLowerCase()}</DialogTitle>
          <DialogDescription className="mt-1">
            Describe what should change. This goes to the agent as your next message and is
            recorded in the oversight trail.
          </DialogDescription>
          <div className="mt-4 flex flex-col gap-2">
            <Label htmlFor="change-note">Requested changes</Label>
            <Textarea
              id="change-note"
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. The 30/60/90 plan is too vague — tie each milestone to a measurable outcome, and cut the marketing language in the scope section."
              autoFocus
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setChangesOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitChanges} disabled={busy || !note.trim()}>
              Send to agent
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
