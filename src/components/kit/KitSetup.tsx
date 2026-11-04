"use client";

import { useMemo, useState } from "react";
import { FileUp, Sparkles, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { extractText } from "@/lib/extract-text";
import { parseJson } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import { KIT_LANGUAGES, ROLE_LEVELS, type CompetencyOption, type KitInputs } from "@/shared/interview-kit-types";

/**
 * Interview kit input screen (PRD §3). Nothing is pasted from elsewhere: the
 * job description version, company sources and documents are picked from the
 * role's workspace; the user may add files and notes. Susan's form fields
 * (Hiring Toolkit PRD §5.1), filled from what the platform already holds.
 */

export type KitOptionsResponse = {
  company: string;
  title: string;
  jdVersions: { id: string; version: number; status: "draft" | "approved"; createdAt: string }[];
  hasResearch: boolean;
  hasProfile: boolean;
  documents: { id: string; filename: string }[];
  competencies: CompetencyOption[];
  defaults: Omit<KitInputs, "jdArtifactId" | "jdVersion"> & { jdArtifactId: string | null };
  kits: { id: string; version: number; createdAt: string; jdVersion: number | null }[];
  canWrite: boolean;
};

type Draft = Omit<KitInputs, "jdVersion" | "jdArtifactId"> & { jdArtifactId: string | null };

export function KitSetup({
  projectId,
  options,
  start,
  onCreated,
  onCancel,
}: {
  projectId: string;
  options: KitOptionsResponse;
  /** Prefill from an existing kit ("change inputs and rebuild"); uploaded files are not carried over. */
  start?: Partial<Draft>;
  onCreated: (kitId: string) => void;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<Draft>(() => ({ ...options.defaults, ...start, extra: [] }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const clusters = useMemo(() => {
    const m = new Map<string, CompetencyOption[]>();
    for (const c of options.competencies) m.set(c.cluster, [...(m.get(c.cluster) ?? []), c]);
    return [...m.entries()];
  }, [options.competencies]);

  const toggleComp = (no: number) =>
    set("competencies", d.competencies.includes(no) ? d.competencies.filter((n) => n !== no) : [...d.competencies, no].sort((a, b) => a - b));
  const toggleDoc = (id: string) => set("documentIds", d.documentIds.includes(id) ? d.documentIds.filter((x) => x !== id) : [...d.documentIds, id]);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const f of Array.from(files)) {
      try {
        const { name, text } = await extractText(f);
        setD((x) => ({ ...x, extra: [...x.extra, { name, text }] }));
      } catch (e) {
        setError(`${f.name}: ${e instanceof Error ? e.message : "could not be read"}`);
      }
    }
  }

  async function addBriefingNotes() {
    setLoadingNotes(true);
    try {
      const r = await parseJson<{ notes: string }>(await fetch(`/api/projects/${projectId}/interview-kit?briefingNotes=1`));
      if (!r.notes) setError("The briefing has no confidential answers recorded yet.");
      else set("notes", [d.notes.trim(), "Confidential briefing answers:", r.notes].filter(Boolean).join("\n\n"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the briefing answers");
    } finally {
      setLoadingNotes(false);
    }
  }

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const r = await parseJson<{ id: string }>(
        await fetch(`/api/projects/${projectId}/interview-kit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: d }),
        })
      );
      onCreated(r.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the kit");
      setBusy(false);
    }
  }

  const n = d.competencies.length;
  const canBuild = options.canWrite && Boolean(d.jdArtifactId) && n >= 1 && n <= 10 && !busy;

  return (
    <div className="space-y-6">
      <Section n={1} title="Job description" required>
        <select className="field" value={d.jdArtifactId ?? ""} onChange={(e) => set("jdArtifactId", e.target.value)}>
          {options.jdVersions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.version} · {v.status === "approved" ? "Approved" : "Draft"} · {relativeTime(v.createdAt)}
            </option>
          ))}
        </select>
      </Section>

      <Section n={2} title="Role and level" required>
        <input className="field" value={d.roleAndLevel} maxLength={300} onChange={(e) => set("roleAndLevel", e.target.value)} />
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          {ROLE_LEVELS.map((l) => (
            <label key={l} className="flex items-center gap-2">
              <input type="radio" name="level" checked={d.roleLevel === l} onChange={() => set("roleLevel", l)} />
              {l}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-faint">The level calibrates the Leadership rubric.</p>
      </Section>

      <Section n={3} title="Company context" hint="Shapes the Context areas.">
        <div className="space-y-2 text-sm">
          {options.hasResearch && (
            <Check checked={d.useResearch} onChange={(v) => set("useResearch", v)} label="Exec10X company research" note="attached by Exec10X" />
          )}
          {options.hasProfile && <Check checked={d.useProfile} onChange={(v) => set("useProfile", v)} label="Company profile" note="about, values, culture" />}
          {options.documents.map((doc) => (
            <Check key={doc.id} checked={d.documentIds.includes(doc.id)} onChange={() => toggleDoc(doc.id)} label={doc.filename} note="company document" />
          ))}
          {d.extra.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-ink">
              <FileUp className="size-4 text-accent" /> {e.name}
              <button className="text-faint hover:text-ink" onClick={() => set("extra", d.extra.filter((_, j) => j !== i))} aria-label={`Remove ${e.name}`}>
                <X className="size-4" />
              </button>
            </div>
          ))}
          {!options.hasResearch && !options.hasProfile && !options.documents.length && !d.extra.length && (
            <p className="text-faint">No company context yet: the Context areas will be marked [to validate].</p>
          )}
        </div>
        <label className="btn btn-ghost mt-3 cursor-pointer">
          <FileUp className="size-4" /> Add documents
          <input type="file" multiple accept=".pdf,.docx,.md,.txt" className="hidden" onChange={(e) => void addFiles(e.target.files)} />
        </label>
      </Section>

      <Section n={4} title="Leadership competencies" required hint={`${n} selected · recommended: the 5 core plus 2-3 for the role (7-8), allowed 1-10`}>
        <div className="grid gap-5 sm:grid-cols-2">
          {clusters.map(([cluster, comps]) => (
            <div key={cluster}>
              <p className="label-mono mb-2">{cluster}</p>
              <div className="space-y-1.5 text-sm">
                {comps.map((c) => (
                  <Check key={c.no} checked={d.competencies.includes(c.no)} onChange={() => toggleComp(c.no)} label={c.name} note={c.core ? "Core" : undefined} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-sm">
          <Check checked={d.suggest} onChange={(v) => set("suggest", v)} label="Let Claude suggest 2-3 role-specific competencies" note="each with a why" />
        </div>
      </Section>

      <Section n={5} title="Kick-off notes" hint="Optional: must-haves, languages, values, what the hiring manager confirmed.">
        <textarea className="field min-h-28" maxLength={10000} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
        <button className="mt-2 text-sm text-accent hover:underline disabled:opacity-50" onClick={addBriefingNotes} disabled={loadingNotes}>
          {loadingNotes ? "Loading…" : "Add the confidential briefing answers"}
        </button>
      </Section>

      <Section n={6} title="Kit language" required>
        <select className="field max-w-xs" value={d.language} onChange={(e) => set("language", e.target.value as Draft["language"])}>
          {KIT_LANGUAGES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </Section>

      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-gold gold-glow" disabled={!canBuild} onClick={build}>
          <Sparkles className="size-4" /> {busy ? "Starting…" : "Build the interview kit"}
        </button>
        {onCancel && (
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        {!options.canWrite && <span className="text-xs text-faint">View-only access.</span>}
      </div>
      <p className="text-xs text-faint">Takes 2–4 minutes. Every build is saved as a new version of this role&apos;s kit.</p>
    </div>
  );
}

function Section({ n, title, required, hint, children }: { n: number; title: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card-surface p-6">
      <p className="label-mono mb-1">
        {n} · {title}
        {required && " *"}
      </p>
      {hint && <p className="mb-3 text-xs text-faint">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Check({ checked, onChange, label, note }: { checked: boolean; onChange: (v: boolean) => void; label: string; note?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-ink">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {note && <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{note}</span>}
      </span>
    </label>
  );
}
