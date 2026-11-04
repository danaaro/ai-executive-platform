"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Loader2, Pencil, RefreshCw, Save, Square } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { DownloadMenu } from "@/components/review/DownloadMenu";
import { parseJson, readAgentStream } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import type {
  GuideArea,
  InterviewGuide,
  KitInputs,
  KitPart,
  PartResult,
  Question,
  RecruiterScreen,
  RubricLevel,
} from "@/shared/interview-kit-types";

/**
 * One interview kit version (PRD §4): progress per part while it is written,
 * then the three tabs of Susan's pack. Text is edited in place; saving makes a
 * new version. A failed or cut-short part can be regenerated on its own.
 */

export type KitResponse = {
  id: string;
  version: number;
  createdAt: string;
  createdByName: string;
  company: string;
  howWeAssess: string;
  inputs: Omit<KitInputs, "extra"> & { extra: { name: string }[] };
  parts: Partial<Record<KitPart, PartResult>>;
  latestJdVersion: number | null;
  canWrite: boolean;
};

type Tab = "how" | KitPart;
type RunState = { state: "idle" | "writing" | "error" | "stopped"; chars: number; error?: string };
const TABS: { key: Tab; label: string }[] = [
  { key: "how", label: "1 · How we assess" },
  { key: "screen", label: "2 · Recruiter screen" },
  { key: "interviews", label: "3 · Interviews" },
];

export function KitView({
  projectId,
  kitId,
  autoRun,
  onNewVersion,
  onChangeInputs,
}: {
  projectId: string;
  kitId: string;
  autoRun: boolean;
  onNewVersion: (kitId: string, run: boolean) => void;
  onChangeInputs: (inputs: KitResponse["inputs"]) => void;
}) {
  const [kit, setKit] = useState<KitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("interviews");
  const [run, setRun] = useState<Record<KitPart, RunState>>({ screen: { state: "idle", chars: 0 }, interviews: { state: "idle", chars: 0 } });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);
  const aborts = useRef<AbortController[]>([]);
  const started = useRef(false);

  const load = useCallback(async () => {
    try {
      setKit(await parseJson<KitResponse>(await fetch(`/api/projects/${projectId}/interview-kit/${kitId}`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the kit");
    }
  }, [projectId, kitId]);

  useEffect(() => {
    void load();
    return () => aborts.current.forEach((a) => a.abort());
  }, [load]);

  const writePart = useCallback(
    async (part: KitPart) => {
      const ctl = new AbortController();
      aborts.current.push(ctl);
      setRun((r) => ({ ...r, [part]: { state: "writing", chars: 0 } }));
      try {
        const res = await fetch(`/api/projects/${projectId}/interview-kit/${kitId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ part }),
          signal: ctl.signal,
        });
        if (!res.ok) await parseJson(res);
        let failed: string | null = null;
        await readAgentStream(res, (ev) => {
          if (ev.type === "delta") setRun((r) => ({ ...r, [part]: { state: "writing", chars: r[part].chars + ev.text.length } }));
          else if (ev.type === "reset") setRun((r) => ({ ...r, [part]: { state: "writing", chars: 0 } }));
          else if (ev.type === "error") failed = ev.error;
        });
        if (failed) throw new Error(failed);
        setRun((r) => ({ ...r, [part]: { state: "idle", chars: 0 } }));
      } catch (e) {
        const stopped = ctl.signal.aborted;
        setRun((r) => ({ ...r, [part]: { state: stopped ? "stopped" : "error", chars: 0, error: e instanceof Error ? e.message : "Not done" } }));
      }
      await load();
    },
    [projectId, kitId, load]
  );

  // A freshly created version writes its missing parts at once, in parallel.
  useEffect(() => {
    if (!kit || started.current || !autoRun || !kit.canWrite) return;
    started.current = true;
    const missing = (["interviews", "screen"] as KitPart[]).filter((p) => !kit.parts[p]);
    if (missing.length) setTab(missing[0] === "interviews" || missing.length === 2 ? "interviews" : "screen");
    missing.forEach((p) => void writePart(p));
  }, [kit, autoRun, writePart]);

  const writing = run.screen.state === "writing" || run.interviews.state === "writing";

  async function newVersion(body: Record<string, unknown>, runAfter: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await parseJson<{ id: string }>(
        await fetch(`/api/projects/${projectId}/interview-kit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromKitId: kitId, ...body }),
        })
      );
      onNewVersion(r.id, runAfter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  function saveEdits() {
    if (!kit || !docRef.current) return;
    const edits: Record<string, unknown> = {};
    for (const p of ["screen", "interviews"] as KitPart[]) if (kit.parts[p]?.data) edits[p] = structuredClone(kit.parts[p]!.data);
    docRef.current.querySelectorAll<HTMLElement>("[data-path]").forEach((el) => {
      const keys = el.dataset.path!.split(".");
      let o = edits as Record<string, unknown>;
      for (const k of keys.slice(0, -1)) o = o?.[k] as Record<string, unknown>;
      if (o) o[keys[keys.length - 1]] = el.innerText.replace(/\s+/g, " ").trim();
    });
    const changed = Object.fromEntries(Object.entries(edits).filter(([p, v]) => JSON.stringify(v) !== JSON.stringify(kit.parts[p as KitPart]?.data)));
    if (!Object.keys(changed).length) {
      setEditing(false);
      return;
    }
    void newVersion({ edits: changed }, false);
  }

  async function copyPart() {
    const el = docRef.current;
    if (!el) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": new Blob([el.innerHTML], { type: "text/html" }), "text/plain": new Blob([el.innerText], { type: "text/plain" }) }),
      ]);
    } catch {
      await navigator.clipboard.writeText(el.innerText).catch(() => undefined);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (error && !kit) return <Alert tone="danger">{error}</Alert>;
  if (!kit) return <p className="text-sm text-muted">Loading the kit…</p>;

  const staleJd = kit.latestJdVersion != null && kit.latestJdVersion > kit.inputs.jdVersion;
  const part = tab === "how" ? null : kit.parts[tab];
  const allDone = kit.parts.screen?.status === "done" && kit.parts.interviews?.status === "done";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <p className="label-mono mb-2">
          Interview kit · v{kit.version} · built from job description v{kit.inputs.jdVersion}
        </p>
        <p className="text-xs text-faint">
          {kit.createdByName && `by ${kit.createdByName} · `}
          {relativeTime(kit.createdAt)} · {kit.inputs.roleLevel} · {kit.inputs.competencies.length} leadership competencies
          {kit.inputs.suggest && " + Claude's suggestions"} · {kit.inputs.language}
        </p>
        {staleJd && (
          <Alert tone="warn" className="mt-4">
            Built from job description v{kit.inputs.jdVersion}; v{kit.latestJdVersion} is now available.{" "}
            {kit.canWrite && (
              <button className="underline" onClick={() => onChangeInputs(kit.inputs)}>
                Rebuild with the new version
              </button>
            )}
          </Alert>
        )}

        <ol className="mt-6 grid gap-2 sm:grid-cols-3">
          <Step label="How we assess" status="Ready" ok />
          {(["screen", "interviews"] as KitPart[]).map((p) => (
            <Step key={p} label={p === "screen" ? "Recruiter screen" : "Interviews"} {...stepStatus(kit.parts[p], run[p])} />
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap gap-1 border-b border-line" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t.key ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {part && part.failures.length > 0 && (
          <details className="mt-4 rounded-md border border-warn bg-warn-wash p-3 text-sm">
            <summary className="cursor-pointer text-warn">
              <AlertTriangle className="mr-1 inline size-4" /> Some parts need a manual check ({part.failures.length})
            </summary>
            <ul className="mt-2 list-disc pl-5 text-ink">
              {part.failures.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </details>
        )}
        {part && part.warnings.length > 0 && (
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer">{part.warnings.length} notes from the quality checks</summary>
            <ul className="mt-1 list-disc pl-5">
              {part.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        )}

        <div ref={docRef} className={`kit-doc mt-6 text-[15px] ${editing ? "kit-editing" : ""}`}>
          {tab === "how" && <HowWeAssess text={kit.howWeAssess} />}
          {tab === "screen" && <PartBody part={part} running={run.screen} render={(d) => <Screen d={d as RecruiterScreen} edit={editing} />} />}
          {tab === "interviews" && (
            <PartBody part={part} running={run.interviews} render={(d) => <Interviews d={d as InterviewGuide} edit={editing} level={kit.inputs.roleLevel} />} />
          )}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        {error && <Alert tone="danger">{error}</Alert>}
        {writing && (
          <div className="card-surface p-5 text-sm">
            <p className="flex items-center gap-2 text-ink">
              <Loader2 className="size-4 animate-spin" /> Writing the kit…
            </p>
            <p className="mt-1 text-xs text-faint">2–4 minutes. You can stay on this page.</p>
            <button className="btn btn-ghost mt-3 w-full" onClick={() => aborts.current.forEach((a) => a.abort())}>
              <Square className="size-4" /> Stop
            </button>
          </div>
        )}

        {kit.canWrite && !writing && (
          <div className="card-surface p-5">
            <p className="label-mono mb-3">Edit</p>
            {editing ? (
              <>
                <p className="text-xs text-muted">Click any text to change it. Saving creates a new version.</p>
                <button className="btn btn-gold mt-3 w-full" disabled={busy} onClick={saveEdits}>
                  <Save className="size-4" /> {busy ? "Saving…" : "Save as new version"}
                </button>
                <button className="btn btn-ghost mt-2 w-full" disabled={busy} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost w-full" disabled={!allDone && !kit.parts.screen?.data && !kit.parts.interviews?.data} onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit text in place
                </button>
                {tab !== "how" && (
                  <button className="btn btn-ghost mt-2 w-full" disabled={busy} onClick={() => void newVersion({ regenerate: tab }, true)}>
                    <RefreshCw className="size-4" /> Regenerate this part
                  </button>
                )}
                <button className="btn btn-ghost mt-2 w-full" onClick={() => onChangeInputs(kit.inputs)}>
                  Change inputs and rebuild
                </button>
              </>
            )}
          </div>
        )}

        <button className="btn btn-ghost w-full" onClick={copyPart} disabled={editing}>
          <Copy className="size-4" /> {copied ? "Copied" : "Copy this part"}
        </button>
        <DownloadMenu artifactId={kit.id} note={`The whole kit, this version (v${kit.version}), with the Role ID in the footer.`} />
      </aside>
    </div>
  );
}

function stepStatus(p: PartResult | undefined, r: RunState): { status: string; ok?: boolean; bad?: boolean; spin?: boolean } {
  if (r.state === "writing") return { status: r.chars ? `Writing… ${(r.chars / 1000).toFixed(1)}k characters` : "Writing…", spin: true };
  if (p?.status === "done") return { status: p.truncated ? "Done (cut short)" : p.failures.length ? "Done · check needed" : "Done", ok: !p.truncated && !p.failures.length, bad: p.truncated };
  if (p?.status === "failed") return { status: "Not done", bad: true };
  if (r.state === "stopped") return { status: "Stopped", bad: true };
  if (r.state === "error") return { status: r.error ?? "Not done", bad: true };
  return { status: "Waiting" };
}

function Step({ label, status, ok, bad, spin }: { label: string; status: string; ok?: boolean; bad?: boolean; spin?: boolean }) {
  return (
    <li className="card-surface flex items-center gap-2 px-4 py-3 text-sm">
      {spin ? <Loader2 className="size-4 animate-spin text-accent" /> : ok ? <CheckCircle2 className="size-4 text-success" /> : bad ? <AlertTriangle className="size-4 text-warn" /> : <span className="size-4" />}
      <span className="text-ink">{label}</span>
      <span className="ml-auto truncate text-xs text-muted">{status}</span>
    </li>
  );
}

function PartBody({ part, running, render }: { part: PartResult | null | undefined; running: RunState; render: (d: unknown) => React.ReactNode }) {
  if (part?.data) return <>{render(part.data)}</>;
  if (running.state === "writing") return <p className="text-sm text-muted">Writing this part…</p>;
  if (part?.raw)
    return (
      <>
        <p className="text-sm text-muted">The answer could not be laid out as tables. Regenerate this part, or use the text below.</p>
        <pre className="mt-3 whitespace-pre-wrap text-xs text-ink">{part.raw}</pre>
      </>
    );
  return <p className="text-sm text-muted">{running.error ?? "This part has not been written yet."}</p>;
}

/* ---------------- Rendering --------------------------------------------- */

/** An editable text span: its data-path is where the edit is written back. */
function T({ path, text, edit, as: As = "span", className }: { path: string; text: string; edit: boolean; as?: "span" | "p" | "h3"; className?: string }) {
  return (
    <As data-path={path} contentEditable={edit} suppressContentEditableWarning className={`${className ?? ""} ${edit ? "rounded px-0.5 outline-1 outline-dashed outline-accent/50 focus:outline-accent" : ""}`}>
      {text}
    </As>
  );
}

function Questions({ qs, base, edit }: { qs: Question[]; base: string; edit: boolean }) {
  return (
    <ol className="list-decimal space-y-2 pl-5">
      {qs.map((q, i) => (
        <li key={i} className="text-ink">
          <T path={`${base}.${i}.q`} text={q.q} edit={edit} />
          <ul className="mt-1 space-y-0.5 pl-4 text-sm text-muted">
            {q.probes.map((p, j) => (
              <li key={j}>
                – <T path={`${base}.${i}.probes.${j}`} text={p} edit={edit} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

const TOP = /^(Outstanding|Aligned|High|Top 5%|Met)$/;
const SOLID = /^(Solid)$/;
function Rubric({ r, base, edit }: { r: RubricLevel[]; base: string; edit: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr>
            {r.map((x) => (
              <th
                key={x.level}
                scope="col"
                className={`border border-line px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.12em] ${TOP.test(x.level) ? "bg-accent text-white" : SOLID.test(x.level) ? "bg-accent-wash text-ink" : "bg-canvas-subtle text-muted"}`}
              >
                {x.level}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {r.map((x, i) => (
              <td key={x.level} className="border border-line px-3 py-2 align-top text-ink">
                <T path={`${base}.${i}.text`} text={x.text} edit={edit} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <p className="label-mono mb-2 mt-4">{children}</p>;

function HowWeAssess({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="space-y-2">
      {lines.map((l, i) =>
        i === 0 ? (
          <h2 key={i} className="font-display text-3xl font-normal text-ink">
            How we assess
          </h2>
        ) : l === l.toUpperCase() && /[A-Z]/.test(l) && l.length < 60 ? (
          <h3 key={i} className="pt-4 font-display text-xl font-normal text-ink">
            {l[0] + l.slice(1).toLowerCase()}
          </h3>
        ) : /^\d\.\s/.test(l) && /[A-Z]{4}/.test(l.slice(0, 20)) ? (
          <p key={i} className="pt-3 font-medium text-ink">
            {l}
          </p>
        ) : (
          <p key={i} className="text-muted">
            {l}
          </p>
        )
      )}
    </div>
  );
}

function Screen({ d, edit }: { d: RecruiterScreen; edit: boolean }) {
  return (
    <div>
      <T as="p" path="screen.intro" text={d.intro} edit={edit} className="text-muted" />
      <h2 className="mt-8 font-display text-2xl font-normal text-ink">Running order · 60 minutes</h2>
      <table className="mt-3 w-full border-collapse text-sm">
        <tbody>
          {d.running_order.map((r, i) => (
            <tr key={i}>
              <td className="w-20 border border-line px-3 py-2 font-mono text-xs text-muted">{r.minutes}</td>
              <td className="border border-line px-3 py-2 text-ink">
                <T path={`screen.running_order.${i}.what`} text={r.what} edit={edit} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="mt-10 font-display text-2xl font-normal text-ink">Areas, questions and rubric</h2>
      {d.areas.map((a, i) => (
        <section key={i} className="mt-8 border-t border-line pt-6">
          <T as="h3" path={`screen.areas.${i}.name`} text={a.name} edit={edit} className="font-display text-xl font-normal text-ink" />
          <T as="p" path={`screen.areas.${i}.checks`} text={a.checks} edit={edit} className="mt-1 text-sm italic text-muted" />
          <Label>Questions · choose 1 or 2</Label>
          <Questions qs={a.questions} base={`screen.areas.${i}.questions`} edit={edit} />
          <Label>Rubric</Label>
          <Rubric r={a.rubric} base={`screen.areas.${i}.rubric`} edit={edit} />
        </section>
      ))}
      <p className="mt-8 rounded-md bg-canvas-subtle p-4 text-sm text-ink">
        <b>Do not ask.</b> <T path="screen.do_not_ask" text={d.do_not_ask} edit={edit} />
      </p>
    </div>
  );
}

function Interviews({ d, edit, level }: { d: InterviewGuide; edit: boolean; level: string }) {
  return (
    <div>
      <p className="text-muted">
        Each interviewer takes two attributes, so every attribute gets two views. For each area, choose the questions you like before the first candidate and ask the same ones to everyone. Rate each area against its rubric, then give one rating per attribute. Strong evidence is specific, personal, measured, recent, repeated and confirmable by a named person.
      </p>
      <h2 className="mt-8 font-display text-2xl font-normal text-ink">At a glance</h2>
      <table className="mt-3 w-full border-collapse text-sm">
        <tbody>
          {d.attributes.map((at) => (
            <tr key={at.key}>
              <td className="w-1/3 border border-line px-3 py-2 align-top">
                <span className="text-ink">{at.name}</span>
                <br />
                <span className="italic text-muted">{at.question}</span>
              </td>
              <td className="border border-line px-3 py-2">
                <ul className="space-y-0.5">
                  {at.areas.map((x) => (
                    <li key={x.id} className="text-ink">
                      <span className="mr-2 font-mono text-xs text-accent">{x.id}</span>
                      {x.name}
                      {x.must_have && <Tag>Must-have</Tag>}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.attributes.map((at, ai) => (
        <div key={at.key} className="mt-12">
          <div className="border-b-2 border-accent pb-2">
            <h2 className="font-display text-3xl font-normal text-ink">{at.name}</h2>
            <p className="italic text-muted">{at.question}</p>
          </div>
          {at.key === "LF" && (
            <p className="mt-3 text-sm text-muted">
              Competencies and rubrics from the SP&amp;P Executive Leadership &amp; Future Readiness framework, calibrated to {level}. If the evidence is not enough to rate, record N/A and name what is missing.
            </p>
          )}
          {at.areas.map((x, xi) => (
            <Area key={x.id} x={x} base={`interviews.attributes.${ai}.areas.${xi}`} edit={edit} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Area({ x, base, edit }: { x: GuideArea; base: string; edit: boolean }) {
  return (
    <section className="mt-8 border-t border-line pt-6">
      <h3 className="font-display text-xl font-normal text-ink">
        <span className="mr-2 font-mono text-sm text-accent">{x.id}</span>
        <T path={`${base}.name`} text={x.name} edit={edit && !x.framework_no} />
        {x.must_have && <Tag>Must-have</Tag>}
        {x.selection && <Tag>{x.selection === "core" ? "Core" : "Role-specific"}</Tag>}
      </h3>
      <T as="p" path={`${base}.what`} text={x.what} edit={edit} className="mt-1 text-sm text-muted" />
      {x.why && (
        <p className="mt-2 text-sm text-muted">
          <b className="text-ink">Why for this role:</b> <T path={`${base}.why`} text={x.why} edit={edit} />
        </p>
      )}
      {x.evidence && (
        <p className="mt-2 text-sm text-muted">
          <b className="text-ink">Evidence to look for:</b> <T path={`${base}.evidence`} text={x.evidence} edit={edit} />
        </p>
      )}
      <Label>Questions and probes</Label>
      <Questions qs={x.questions} base={`${base}.questions`} edit={edit} />
      <Label>Rubric</Label>
      <Rubric r={x.rubric} base={`${base}.rubric`} edit={edit} />
    </section>
  );
}

const Tag = ({ children }: { children: React.ReactNode }) => (
  <span className="ml-2 inline-block rounded-full border border-accent/50 bg-accent-wash px-2 py-0.5 align-middle font-mono text-[10px] uppercase tracking-[0.12em] text-accent">{children}</span>
);
