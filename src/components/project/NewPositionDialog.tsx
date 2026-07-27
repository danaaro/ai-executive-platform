"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

type Invite = { email: string; role: "editor" | "viewer" };

/**
 * New position (#4c) — title plus collaborators, in one step.
 *
 * Invites are by email and may precede the account: a row is stored against
 * the address and binds to a Clerk id on that person's first sign-in
 * (ADR-008 §2). No email is sent yet — the invitee sees the position under
 * "Shared with you" once they log in.
 */
export function NewPositionDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function addInvite() {
    const clean = email.trim().toLowerCase();
    if (!valid.test(clean)) {
      setError("Enter a valid email address to invite.");
      return;
    }
    if (invites.some((i) => i.email === clean)) {
      setError("That person is already on the list.");
      return;
    }
    setInvites([...invites, { email: clean, role }]);
    setEmail("");
    setError(null);
  }

  async function create() {
    if (!title.trim()) {
      setError("Give the position a role title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), invites }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the position");
      // Straight into the new board with stage 1 ready for intake (#4c).
      router.push(`/projects/${data.project.id}?stage=job-description`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the position");
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setTitle("");
          setEmail("");
          setInvites([]);
          setError(null);
        }
      }}
    >
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus /> New position
      </Button>

      <DialogContent>
        <DialogTitle>Start a new hiring position</DialogTitle>
        <DialogDescription className="mt-1">
          One position is one board: job description, competencies, panel and interview system.
        </DialogDescription>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-title">Role title</Label>
            <Input
              id="role-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Head of DevOps"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Who else should have access?</Label>
            <div className="flex gap-1.5">
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addInvite();
                  }
                }}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                aria-label="Access level"
                className="h-9 rounded-lg border border-line-strong bg-card px-2 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-accent-ink"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <Button variant="secondary" size="icon" aria-label="Add invite" onClick={addInvite}>
                <UserPlus />
              </Button>
            </div>
            <p className="text-[11.5px] text-muted">
              Editors can run agents and approve. Viewers can read only.
            </p>
          </div>

          {invites.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {invites.map((i) => (
                <li
                  key={i.email}
                  className="flex items-center gap-2 rounded-lg border border-line bg-canvas-subtle px-2.5 py-1.5"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-soft text-[10px] font-bold text-canvas">
                    {i.email.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{i.email}</span>
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                    {i.role}
                  </span>
                  <button
                    aria-label={`Remove ${i.email}`}
                    onClick={() => setInvites(invites.filter((x) => x.email !== i.email))}
                    className="text-muted transition-colors hover:text-danger"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <Alert tone="danger">{error}</Alert>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} disabled={busy || !title.trim()}>
            {busy ? "Creating…" : "Create board →"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
