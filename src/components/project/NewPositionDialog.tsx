"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus, UserPlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";

type Invite = { email: string; role: "editor" | "viewer" };

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SGD", "ILS", "AED", "HKD"] as const;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Open a role (ADR-011). Spends one role credit and locks the title and the
 * salary range; names the hiring manager who will approve the job
 * description; optionally invites colleagues. The button is disabled with no
 * credits left — and the server refuses regardless.
 */
export function NewPositionDialog({ credits }: { credits: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [currency, setCurrency] = useState<string>("EUR");
  const [showSalary, setShowSalary] = useState(false);
  const [hmSelf, setHmSelf] = useState(true);
  const [hmEmail, setHmEmail] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noCredits = credits !== null && credits < 1;

  function reset() {
    setTitle("");
    setSalaryMin("");
    setSalaryMax("");
    setCurrency("EUR");
    setShowSalary(false);
    setHmSelf(true);
    setHmEmail("");
    setEmail("");
    setInvites([]);
    setError(null);
  }

  function addInvite() {
    const clean = email.trim().toLowerCase();
    if (!EMAIL.test(clean)) {
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

  const min = Number(salaryMin);
  const max = Number(salaryMax);
  const salaryOk = Number.isInteger(min) && Number.isInteger(max) && min > 0 && max >= min;
  const hmOk = hmSelf || EMAIL.test(hmEmail.trim());
  const ready = title.trim() && salaryOk && hmOk;

  async function create() {
    if (!ready) {
      setError(
        !title.trim()
          ? "Give the role a title."
          : !salaryOk
            ? "Enter the annual base salary range as whole numbers, minimum first."
            : "Enter a valid email for the hiring manager."
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          salaryMin: min,
          salaryMax: max,
          salaryCurrency: currency,
          showSalaryOnJd: showSalary,
          hiringManagerEmail: hmSelf ? null : hmEmail.trim(),
          invites,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not open the role");
      router.push(`/projects/${data.project.id}/interview`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the role");
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          className="btn btn-gold"
          onClick={() => setOpen(true)}
          disabled={noCredits}
        >
          <Plus className="size-4" /> Start new role
        </button>
        {credits !== null && (
          <p className={`font-mono text-xs ${noCredits ? "text-warn" : "text-muted"}`}>
            {noCredits
              ? "No role credits left — contact us to add more"
              : `${credits} role credit${credits === 1 ? "" : "s"} available`}
          </p>
        )}
      </div>

      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle className="font-display text-2xl font-normal">Open a new role</DialogTitle>
        <DialogDescription className="mt-1 text-muted">
          Opening a role uses 1 credit. The title and salary range are locked once the role is open.
        </DialogDescription>

        <div className="mt-5 flex flex-col gap-5">
          <label className="block space-y-2">
            <span className="label-mono">Role title <span className="text-accent" aria-hidden>*</span></span>
            <input
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chief Financial Officer"
              maxLength={120}
              autoFocus
            />
          </label>

          <div className="space-y-2">
            <span className="label-mono">Annual base salary range <span className="text-accent" aria-hidden>*</span></span>
            <div className="flex gap-2">
              <input
                className="field"
                type="number"
                min={1}
                inputMode="numeric"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                placeholder="From"
                aria-label="Salary from"
              />
              <input
                className="field"
                type="number"
                min={1}
                inputMode="numeric"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                placeholder="To"
                aria-label="Salary to"
              />
              <select
                className="field w-28"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                aria-label="Currency"
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={showSalary}
                onChange={(e) => setShowSalary(e.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
              Show the salary range on the job description
            </label>
          </div>

          <div className="space-y-2">
            <span className="label-mono">Hiring manager (approves the job description) <span className="text-accent" aria-hidden>*</span></span>
            <div className="flex flex-wrap gap-4 text-sm text-ink">
              <label className="flex items-center gap-2">
                <input type="radio" checked={hmSelf} onChange={() => setHmSelf(true)} className="accent-[var(--accent)]" />
                Me
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!hmSelf} onChange={() => setHmSelf(false)} className="accent-[var(--accent)]" />
                Someone else
              </label>
            </div>
            {!hmSelf && (
              <label className="block space-y-2">
                <span className="label-mono">Hiring manager email <span className="text-accent" aria-hidden>*</span></span>
                <input
                  className="field"
                  type="email"
                  value={hmEmail}
                  onChange={(e) => setHmEmail(e.target.value)}
                  placeholder="hiring.manager@company.com"
                  required
                />
              </label>
            )}
          </div>

          <div className="space-y-2">
            <span className="label-mono">Who else should have access? (optional)</span>
            <div className="flex gap-2">
              <input
                className="field"
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
                className="field w-28"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button type="button" className="btn btn-ghost px-3" aria-label="Add invite" onClick={addInvite}>
                <UserPlus className="size-4" />
              </button>
            </div>
            {invites.length > 0 && (
              <ul className="flex flex-col gap-1.5 pt-1">
                {invites.map((i) => (
                  <li key={i.email} className="flex items-center gap-2 rounded-lg border border-line bg-canvas-subtle px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{i.email}</span>
                    <span className="label-mono">{i.role}</span>
                    <button
                      type="button"
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
          </div>

          <p className="text-xs text-faint">* Required</p>

          {error && <Alert tone="danger">{error}</Alert>}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-gold" onClick={create} disabled={busy || !ready || noCredits}>
            <Lock className="size-4" /> {busy ? "Opening…" : "Open role · uses 1 credit"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
