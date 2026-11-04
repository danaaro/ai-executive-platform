"use client";

import { useState } from "react";
import { Archive, Pencil, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Input, Label } from "@/components/ui/field";

type Role = {
  title: string;
  status: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  showSalaryOnJd: boolean;
};

/**
 * Super admins only (Dana 2026-11-01): correct a role's locked facts (a
 * misspelt title, a wrong salary) and archive or restore it. The server
 * enforces both; this is just the surface. Archiving never refunds the credit.
 */
export function RoleAdminControls({ projectId, role, onChanged }: { projectId: string; role: Role; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(role.title);
  const [min, setMin] = useState(role.salaryMin?.toString() ?? "");
  const [max, setMax] = useState(role.salaryMax?.toString() ?? "");
  const [currency, setCurrency] = useState(role.salaryCurrency ?? "");
  const [show, setShow] = useState(role.showSalaryOnJd);
  const [applyToDocs, setApplyToDocs] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const archived = role.status === "archived";

  async function patch(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Could not save");
      onChanged();
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const body: Record<string, unknown> = { reason: reason || undefined };
    if (title.trim() !== role.title) body.title = title;
    if (min !== (role.salaryMin?.toString() ?? "")) body.salaryMin = Number(min);
    if (max !== (role.salaryMax?.toString() ?? "")) body.salaryMax = Number(max);
    if (currency !== (role.salaryCurrency ?? "")) body.salaryCurrency = currency;
    if (show !== role.showSalaryOnJd) body.showSalaryOnJd = show;
    if (Object.keys(body).length === 1) return setEditing(false);
    if (body.title) body.applyTitleToDocuments = applyToDocs;
    const d = await patch(body);
    if (!d) return;
    const docs = d.documents as { jdVersion: number | null; kitVersion: number | null; kitError?: string } | null;
    const made = [
      docs?.jdVersion ? `job description v${docs.jdVersion} (a draft, approve it again)` : null,
      docs?.kitVersion ? `interview kit v${docs.kitVersion}` : null,
    ].filter(Boolean);
    setNotice(
      ["Role updated.", made.length ? `New title applied in ${made.join(" and ")}.` : null, docs?.kitError ?? null]
        .filter(Boolean)
        .join(" ")
    );
    setEditing(false);
  }

  async function toggleArchive() {
    const d = await patch({ status: archived ? "open" : "archived" });
    if (d) setNotice(archived ? "Role restored." : "Role archived. The credit stays spent; adjust credits on the company account page if needed.");
  }

  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-mono mr-1">Exec10X admin</span>
        {!editing && (
          <button className="btn btn-ghost" onClick={() => setEditing(true)} disabled={busy}>
            <Pencil className="size-4" /> Edit role
          </button>
        )}
        <button className="btn btn-ghost" onClick={toggleArchive} disabled={busy}>
          {archived ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}
          {archived ? "Restore role" : "Archive role"}
        </button>
      </div>
      {notice && <div className="mt-3"><Alert tone="accent">{notice}</Alert></div>}
      {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}

      {editing && (
        <div className="card-surface mt-4 grid gap-4 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="ra-title">Role title *</Label>
            <Input id="ra-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ra-min">Salary minimum *</Label>
            <Input id="ra-min" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <Label htmlFor="ra-max">Salary maximum *</Label>
            <Input id="ra-max" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div>
            <Label htmlFor="ra-cur">Currency *</Label>
            <Input id="ra-cur" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </div>
          <label className="flex items-center gap-2 self-end text-sm text-ink">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show salary on the job description
          </label>
          {title.trim() !== role.title && (
            <label className="flex items-start gap-2 text-sm text-ink sm:col-span-2">
              <input type="checkbox" className="mt-1" checked={applyToDocs} onChange={(e) => setApplyToDocs(e.target.checked)} />
              <span>
                Apply the new title to the job description and interview kit
                <span className="block text-xs text-muted">
                  Saves a new version of each with the old title replaced. No regeneration, no credit; earlier versions are kept.
                </span>
              </span>
            </label>
          )}
          <div className="sm:col-span-2">
            <Label htmlFor="ra-reason">Reason (for the log)</Label>
            <Input id="ra-reason" placeholder="e.g. typo in the title" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn btn-gold" onClick={save} disabled={busy || title.trim().length < 2}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
