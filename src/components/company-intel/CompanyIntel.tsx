"use client";

import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { parseJson, readAgentStream } from "@/lib/api";
import { extractText } from "@/lib/extract-text";
import { estimateRunCost, formatUsd } from "@/shared/ai-cost";
import { CompanyLogo, ReportView } from "@/components/company-intel/ReportView";
import type { ReportData } from "@/shared/company-report";
import { cn, relativeTime } from "@/lib/utils";

/**
 * Company Intelligence — the guided flow (ADR-009). This page IS the
 * orchestrator the package's /research-company command used to be:
 *   1. company name   → find-or-create, show what's cached
 *   2. documents      → optional uploads / pastes, highest-trust source
 *   3. run            → stale/missing modules in parallel, then synthesis
 *   → result: ONE analyzed report (download .md, saved in the DB); the raw
 *     research stays behind a collapsed fact-check panel
 */

type ModuleState = {
  module: string;
  title: string;
  status: "fresh" | "stale" | "missing";
  researchedOn: string | null;
  coverage: string | null;
  sourcesCount: number | null;
};
type Output = {
  id: string;
  version: number;
  mode: "full" | "culture-only";
  content: string;
  data: ReportData | null;
  reviewed: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
} | null;
type Detail = {
  company: { slug: string; name: string; website: string | null; logoUrl: string | null };
  modules: ModuleState[];
  research: { module: string; content: string; researchedOn: string }[];
  inputs: { id: string; filename: string; chars: number; createdAt: string }[];
  report: Output;
  cost: { thisReport: number | null; allTime: number };
};
type Step = "name" | "docs" | "run" | "results";
type Scope = "culture-only" | "full";
type RunState = "queued" | "running" | "done" | "failed" | "skipped";

const CULTURE = "05-culture-voice";

export function CompanyIntel() {
  const [step, setStep] = useState<Step>("name");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [existed, setExisted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (slug: string) => {
    const d = await parseJson<Detail>(await fetch(`/api/company-intel/companies/${slug}`));
    setDetail(d);
    return d;
  };

  const open = async (slug: string, fromList: boolean) => {
    setError(null);
    try {
      const d = await load(slug);
      const hasOutputs = Boolean(d.report || d.research.length);
      setExisted(true);
      setStep(fromList && hasOutputs ? "results" : "docs");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that company");
    }
  };

  const reset = () => {
    setDetail(null);
    setExisted(false);
    setError(null);
    setStep("name");
  };

  return (
    <>
      <AppHeader
        breadcrumb={
          <span className="text-[13px] font-medium text-muted">
            Internal · Company Intel{detail ? ` · ${detail.company.name}` : ""}
          </span>
        }
      />
      <main className={cn("mx-auto px-4 py-8", step === "results" ? "max-w-6xl" : "max-w-4xl")}>
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[22px] font-semibold text-ink">Company Intelligence</h1>
          {step !== "name" && (
            <Button size="sm" variant="ghost" onClick={reset}>
              ← New research
            </Button>
          )}
        </div>
        <p className="no-print mt-1 text-[13px] text-muted">
          Internal research tool for Dana and Susan. Researches a company in depth and delivers one
          analyzed report. Not visible to customers.
        </p>

        {step !== "results" && <Stepper step={step} />}

        {error && (
          <Alert tone="danger" className="mt-5">
            {error}
          </Alert>
        )}

        <div className="mt-6">
          {step === "name" && (
            <NameStep
              onPicked={async (slug, wasExisting) => {
                setError(null);
                try {
                  await load(slug);
                  setExisted(wasExisting);
                  setStep("docs");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not load the company");
                }
              }}
              onOpen={(slug) => open(slug, true)}
              onError={setError}
            />
          )}
          {step === "docs" && detail && (
            <DocsStep
              detail={detail}
              existed={existed}
              reload={() => load(detail.company.slug)}
              onNext={() => setStep("run")}
            />
          )}
          {step === "run" && detail && (
            <RunStep
              detail={detail}
              onBack={() => setStep("docs")}
              onFinished={async () => {
                await load(detail.company.slug);
                setStep("results");
              }}
            />
          )}
          {step === "results" && detail && (
            <ResultsStep detail={detail} onUpdate={() => setStep("docs")} />
          )}
        </div>
      </main>
    </>
  );
}

/* ---------------------------------------------------------------------- */

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "name", label: "1 · Company" },
    { id: "docs", label: "2 · Documents" },
    { id: "run", label: "3 · Run" },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="mt-5 flex gap-2 text-[12px] font-medium">
      {steps.map((s, i) => (
        <li
          key={s.id}
          className={cn(
            "rounded-full border px-3 py-1",
            i === idx
              ? "border-accent bg-accent-wash text-accent-ink"
              : i < idx
                ? "border-line bg-canvas-subtle text-ink"
                : "border-line text-muted"
          )}
        >
          {s.label}
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------------- */

function NameStep({
  onPicked,
  onOpen,
  onError,
}: {
  onPicked: (slug: string, existed: boolean) => void;
  onOpen: (slug: string) => void;
  onError: (e: string) => void;
}) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [past, setPast] = useState<
    { slug: string; name: string; logoUrl: string | null; updatedAt: string }[] | null
  >(null);

  useEffect(() => {
    fetch("/api/company-intel/companies")
      .then((r) => parseJson<{ companies: typeof past }>(r))
      .then((d) => setPast(d.companies ?? []))
      .catch(() => setPast([]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const d = await parseJson<{ slug: string; existed: boolean }>(
        await fetch("/api/company-intel/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, website }),
        })
      );
      onPicked(d.slug, d.existed);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not start");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardBody>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ci-name">Which company are we researching?</Label>
              <Input
                id="ci-name"
                autoFocus
                placeholder="e.g. Amdocs"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci-web">
                Website <span className="font-normal text-muted">(optional, helps with common names)</span>
              </Label>
              <Input
                id="ci-web"
                placeholder="https://…"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
              {busy ? "Checking…" : "Continue"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <section>
        <h2 className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted">
          Past research
        </h2>
        {past === null ? (
          <p className="text-[13px] text-muted">Loading…</p>
        ) : past.length === 0 ? (
          <p className="text-[13px] text-muted">No companies researched yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-card">
            {past.map((c) => (
              <li key={c.slug}>
                <button
                  onClick={() => onOpen(c.slug)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13.5px] hover:bg-canvas-subtle"
                >
                  <span className="flex items-center gap-2.5 font-medium text-ink">
                    {c.logoUrl ? (
                      <CompanyLogo url={c.logoUrl} name={c.name} size="sm" />
                    ) : (
                      <span className="size-7 rounded-md border border-dashed border-line" aria-hidden />
                    )}
                    {c.name}
                  </span>
                  <span className="text-[12px] text-muted">updated {relativeTime(c.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function DocsStep({
  detail,
  existed,
  reload,
  onNext,
}: {
  detail: Detail;
  existed: boolean;
  reload: () => Promise<Detail>;
  onNext: () => void;
}) {
  const slug = detail.company.slug;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const addInput = async (filename: string, content: string) => {
    await parseJson(
      await fetch(`/api/company-intel/companies/${slug}/inputs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content }),
      })
    );
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(null);
    for (const file of Array.from(files)) {
      setBusy(`Reading ${file.name}…`);
      try {
        // Extracted in the browser: only text is sent, so Vercel's 4.5 MB body
        // limit no longer applies to the file (see lib/extract-text.ts).
        const parsed = await extractText(file);
        await addInput(parsed.name, parsed.text);
        if (parsed.truncated) setErr(`${file.name} was long and has been cut to about 60,000 characters.`);
      } catch (e) {
        setErr(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
    await reload();
    setBusy(null);
  };

  const paste = async () => {
    if (!pasteText.trim()) return;
    setBusy("Saving…");
    setErr(null);
    try {
      const name = pasteName.trim() || `notes-${new Date().toISOString().slice(0, 10)}.md`;
      await addInput(name, pasteText);
      setPasteName("");
      setPasteText("");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/company-intel/companies/${slug}/inputs?id=${id}`, { method: "DELETE" });
    await reload();
  };

  const researched = detail.modules.filter((m) => m.status !== "missing");
  // The platform's own read of the website is source #1, shown on the website card, not as a document.
  const uploads = detail.inputs.filter((i) => !i.filename.startsWith("company-website-"));

  return (
    <div className="space-y-5">
      <WebsiteCard detail={detail} reload={reload} />

      {existed && researched.length > 0 && (
        <Alert tone="accent">
          <div>
            <strong>{detail.company.name}</strong> has been researched before.{" "}
            {detail.modules.filter((m) => m.status === "fresh").length} of 5 modules are still fresh
            and will be reused, not re-run. You can force a full refresh in the next step.
          </div>
        </Alert>
      )}

      <Card>
        <CardBody className="space-y-4">
          <div>
            <h2 className="font-display text-[16px] font-semibold text-ink">
              Do you have any documents from {detail.company.name}?
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Anything they&apos;ve already shared with us, such as decks, handbooks, org charts,
              Glassdoor exports or meeting notes. Every research module reads these first, and they
              rank above web sources.
            </p>
          </div>

          {uploads.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {uploads.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-3 py-2 text-[13px]">
                  <span className="text-ink">
                    {i.filename}{" "}
                    <span className="text-muted">· {Math.round(i.chars / 1000)}k chars</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => remove(i.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.docx,.md,.markdown,.txt"
              className="hidden"
              onChange={(e) => upload(e.target.files)}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
              Upload files
            </Button>
            <span className="text-[12px] text-muted">PDF, DOCX, MD, TXT · any size (long documents are cut at ~60k characters)</span>
          </div>

          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-[13px] font-medium text-ink">Or paste text</summary>
            <div className="mt-3 space-y-2">
              <Input
                placeholder="Name, e.g. glassdoor-2026-09.md or call-notes-ceo.md"
                value={pasteName}
                onChange={(e) => setPasteName(e.target.value)}
              />
              <Textarea
                rows={6}
                placeholder="Paste here…"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <Button size="sm" onClick={paste} disabled={Boolean(busy) || !pasteText.trim()}>
                Add
              </Button>
            </div>
          </details>

          {busy && <p className="text-[13px] text-muted">{busy}</p>}
          {err && <Alert tone="warn">{err}</Alert>}
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={onNext} disabled={Boolean(busy)}>
          {uploads.length ? "Continue" : "Skip, use public sources only"}
        </Button>
      </div>
    </div>
  );
}

/** The official website: source #1 for every run, so it is shown and correctable. */
function WebsiteCard({ detail, reload }: { detail: Detail; reload: () => Promise<Detail> }) {
  const [value, setValue] = useState(detail.company.website ?? "");
  const lastRead = detail.inputs.find((i) => i.filename.startsWith("company-website-"));
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setErr(null);
    try {
      await parseJson(
        await fetch(`/api/company-intel/companies/${detail.company.slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ website: value }),
        })
      );
      setEditing(false);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    }
  };
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[16px] font-semibold text-ink">Official website</h2>
            <p className="text-[12.5px] text-muted">
              Source #1 of truth. Read first on every run, before your documents and before web search.
            </p>
          </div>
          {!editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              {detail.company.website ? "Change" : "Set it"}
            </Button>
          )}
        </div>
        {editing ? (
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-md"
              placeholder="https://company.com"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button size="sm" variant="primary" onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : detail.company.website ? (
          <a
            href={detail.company.website}
            target="_blank"
            rel="noreferrer"
            className="text-[13.5px] font-medium text-accent-ink underline-offset-2 hover:underline"
          >
            {detail.company.website}
          </a>
        ) : (
          <p className="text-[13px] text-muted">Not set. The run will find the official site automatically.</p>
        )}
        {lastRead && !editing && (
          <p className="text-[12px] text-muted">Last read on {lastRead.filename.slice(16, 26)} · read again on every run</p>
        )}
        {err && <Alert tone="danger">{err}</Alert>}
      </CardBody>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */

function RunStep({
  detail,
  onBack,
  onFinished,
}: {
  detail: Detail;
  onBack: () => void;
  onFinished: () => Promise<void>;
}) {
  const slug = detail.company.slug;
  const [scope, setScope] = useState<Scope>(
    detail.modules.find((m) => m.module === CULTURE)?.status === "fresh" ? "full" : "culture-only"
  );
  const [refresh, setRefresh] = useState(false);
  const [running, setRunning] = useState(false);
  const [states, setStates] = useState<Record<string, { state: RunState; log: string[]; error?: string }>>({});
  const [synth, setSynth] = useState<{ state: RunState; chars: number; error?: string } | null>(null);
  const [photos, setPhotos] = useState<RunState | null>(null);
  const [site, setSite] = useState<RunState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const inScope = detail.modules.filter((m) => scope === "full" || m.module === CULTURE);
  const toRun = inScope.filter((m) => refresh || m.status !== "fresh");

  const patch = (module: string, p: Partial<{ state: RunState; log: string[]; error?: string }>) =>
    setStates((s) => ({ ...s, [module]: { ...(s[module] ?? { state: "queued", log: [] }), ...p } }));

  /** Reads one NDJSON stream; resolves on `done`, throws on `error`. */
  const stream = async (url: string, body: unknown, onDelta: (t: string) => void) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) await parseJson(res); // throws a readable error
    let failed = null as string | null;
    let done = false as boolean;
    await readAgentStream(res, (ev) => {
      if (ev.type === "delta") onDelta(ev.text);
      else if (ev.type === "error") failed = ev.error;
      else if (ev.type === "done") done = true;
    });
    if (failed) throw new Error(failed);
    if (!done) throw new Error("The connection closed before the run finished");
  };

  /**
   * Every failure — including the browser losing the connection mid-run
   * ("Failed to fetch": the server restarted, the laptop slept, Wi-Fi dropped)
   * — ends as a readable note and a usable Run button, never as an uncaught
   * error. Finished modules are already saved and are reused on the next run.
   */
  const run = async () => {
    try {
      await runSteps();
    } catch (e) {
      setNotice(friendlyError(e));
    } finally {
      setRunning(false);
    }
  };

  const runSteps = async () => {
    setRunning(true);
    setNotice(null);
    setStartedAt(Date.now());
    setSynth(null);
    const init: typeof states = {};
    for (const m of inScope) init[m.module] = { state: toRun.includes(m) ? "queued" : "skipped", log: [] };
    setStates(init);

    // Step 0: the company's own website, read server-side and stored as a
    // dated input every module reads first (ADR-009 §12). Non-fatal.
    if (toRun.length) {
      setSite("running");
      try {
        const res = await fetch(`/api/company-intel/companies/${slug}/site`, { method: "POST" });
        const out = await parseJson<{ pages: number }>(res);
        setSite(out.pages > 0 ? "done" : "failed");
      } catch {
        setSite("failed");
      }
    } else {
      setSite("skipped");
    }

    // Parallel, one request per module (ADR-009 §5).
    const results = await Promise.all(
      toRun.map(async (m) => {
        patch(m.module, { state: "running" });
        try {
          await stream(`/api/company-intel/companies/${slug}/research/${m.module}`, {}, (t) =>
            setStates((s) => {
              const cur = s[m.module];
              return { ...s, [m.module]: { ...cur, log: [...cur.log, ...t.split("\n").filter(Boolean)] } };
            })
          );
          patch(m.module, { state: "done" });
          return true;
        } catch (e) {
          patch(m.module, { state: "failed", error: friendlyError(e) });
          return false;
        }
      })
    );

    // Synthesize if anything was (re)researched or the wanted output is missing.
    const fresh = await fetch(`/api/company-intel/companies/${slug}`).then((r) => parseJson<Detail>(r));
    const cultureOk = fresh.modules.find((m) => m.module === CULTURE)?.status !== "missing";
    // Anything the current format expects but the saved report lacks is
    // rebuilt from saved research here — no separate "re-analyze" or
    // "find photos" buttons (Dana, 2026-09-26).
    const outputMissing =
      !fresh.report || !fresh.report.data || (scope === "full" && fresh.report.mode !== "full");
    const photosMissing =
      scope === "full" && Boolean(fresh.report?.data?.keyPersonas.length) && !fresh.report?.data?.photosCheckedAt;
    const anyRan = results.some(Boolean);

    if (!cultureOk) {
      setNotice("Module 05 (culture) has no research yet, so there's nothing to synthesize. Check the error above and run again.");
      setRunning(false);
      return;
    }
    if (!anyRan && !outputMissing && !photosMissing) {
      setNotice("Everything in scope is fresh and the report is up to date. Nothing to re-run. Showing the saved report.");
      setRunning(false);
      await onFinished();
      return;
    }

    const synthesize = anyRan || outputMissing;
    setSynth(synthesize ? { state: "running", chars: 0 } : { state: "skipped", chars: 0 });
    try {
      if (synthesize) {
        await stream(`/api/company-intel/companies/${slug}/synthesize`, { mode: scope }, (t) =>
          setSynth((s) => (s ? { ...s, chars: s.chars + t.length } : s))
        );
        setSynth((s) => (s ? { ...s, state: "done" } : s));
      }
      if (scope === "full") {
        setPhotos("running");
        try {
          await stream(`/api/company-intel/companies/${slug}/photos`, {}, () => {});
          setPhotos("done");
        } catch {
          setPhotos("failed"); // non-fatal: the report is saved; initials stay
        }
      }
      setRunning(false);
      await onFinished();
    } catch (e) {
      setSynth((s) => (s ? { ...s, state: "failed", error: friendlyError(e) } : s));
      setRunning(false);
    }
  };

  const elapsed = startedAt ? Math.round((now - startedAt) / 1000) : 0;
  const started = Object.keys(states).length > 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-4">
          <h2 className="font-display text-[16px] font-semibold text-ink">What should we run?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <ScopeOption
              active={scope === "culture-only"}
              disabled={running}
              onClick={() => setScope("culture-only")}
              title="Culture only"
              text="Culture & employee voice only → a culture-focused report. Faster."
            />
            <ScopeOption
              active={scope === "full"}
              disabled={running}
              onClick={() => setScope("full")}
              title="Full research"
              text="All 5 research areas in parallel → the full company report."
            />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={refresh}
              disabled={running}
              onChange={(e) => setRefresh(e.target.checked)}
            />
            Refresh everything (ignore cached research)
          </label>

          {/* Fixed layout: long progress lines truncate inside the first column
              instead of pushing the status columns out of the card. */}
          <table className="w-full table-fixed text-[13px]">
            <colgroup>
              <col />
              <col className="w-[86px] sm:w-[96px]" />
              <col className="hidden w-[118px] sm:table-column" />
              <col className="w-[96px]" />
            </colgroup>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                <th className="py-1.5 font-semibold">Step</th>
                <th className="font-semibold">Saved</th>
                <th className="hidden font-semibold sm:table-cell">Researched</th>
                <th className="font-semibold">{started ? "This run" : "Plan"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td colSpan={3} className="py-2">
                  <span className="font-medium text-ink">1 · Read the company website</span>
                  <span className="block text-[12px] text-muted">
                    Official team, companies and about pages
                    {site === "failed" && " · couldn't be read, research continues without it"}
                  </span>
                </td>
                <td>{site ? <RunBadge state={site} /> : <Badge>waiting</Badge>}</td>
              </tr>
              <tr>
                <td colSpan={4} className="pb-1 pt-3 font-medium text-ink">
                  2 · Research{inScope.length > 1 ? `, ${inScope.length} areas in parallel` : ""}
                </td>
              </tr>
              {inScope.map((m) => {
                const st = states[m.module];
                const will = toRun.includes(m);
                return (
                  <tr key={m.module} className="align-top">
                    <td className="min-w-0 py-2 pl-4 pr-2 text-ink">
                      <span className="text-muted">{m.module.slice(0, 2)}</span> {m.title}
                      {st?.state === "running" && st.log.length > 0 && (
                        <div className="mt-0.5 truncate text-[11.5px] text-muted" title={st.log.at(-1)}>
                          {st.log.length} steps · {st.log.at(-1)}
                        </div>
                      )}
                      {st?.error && <div className="mt-0.5 text-[11.5px] text-danger">{st.error}</div>}
                    </td>
                    <td>
                      <Badge tone={m.status === "fresh" ? "done" : m.status === "stale" ? "warn" : "neutral"}>
                        {m.status}
                      </Badge>
                    </td>
                    <td className="hidden text-[12px] text-muted sm:table-cell">
                      {m.researchedOn ?? "—"}
                      {m.coverage ? ` · ${m.coverage}` : ""}
                    </td>
                    <td>
                      {st ? <RunBadge state={st.state} /> : will ? <Badge tone="active">will run</Badge> : <Badge>reuse</Badge>}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={3} className="py-2 pt-3">
                  <span className="font-medium text-ink">3 · Write the report</span>
                  <span className="block text-[12px] text-muted">
                    {scope === "full" ? "The analyzed company report" : "A culture-focused report"}
                    {synth?.state === "running" && synth.chars > 0 && ` · writing (${Math.round(synth.chars / 1000)}k chars)`}
                  </span>
                  {synth?.error && <span className="block text-[11.5px] text-danger">{synth.error}</span>}
                </td>
                <td>{synth ? <RunBadge state={synth.state} /> : <Badge>waiting</Badge>}</td>
              </tr>
              {scope === "full" && (
                <tr>
                  <td colSpan={3} className="py-2">
                    <span className="font-medium text-ink">4 · Find photos of key people</span>
                    <span className="block text-[12px] text-muted">Official photos, matched by name</span>
                  </td>
                  <td>{photos ? <RunBadge state={photos} /> : <Badge>waiting</Badge>}</td>
                </tr>
              )}
            </tbody>
          </table>

          {running && (
            <p className="text-[12.5px] text-muted">
              Running · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}. Research
              modules usually take 1–4 minutes each. Keep this tab open.
            </p>
          )}
          {notice && <Alert tone="info">{notice}</Alert>}
        </CardBody>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack} disabled={running}>
          ← Documents
        </Button>
        <div className="flex items-center gap-3">
          {!running && (
            <span className="text-[12.5px] text-muted" title="Approximate, at Anthropic list prices">
              {toRun.length === 0
                ? "Nothing new to research"
                : `Estimated AI cost ≈ ${formatUsd(estimateRunCost(toRun.length, true, scope === "full"))}`}
            </span>
          )}
          <Button variant="primary" onClick={run} disabled={running}>
            {running ? "Running…" : started ? "Run again" : "Start research"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|load failed|networkerror|network error|connection closed/i.test(msg)) {
    return "Lost the connection to the server, so this step stopped. Anything already finished is saved and will be reused. Click Run again.";
  }
  return msg || "Something went wrong. Click Run again.";
}

function ScopeOption(props: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  text: string;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
        props.active ? "border-accent bg-accent-wash" : "border-line hover:border-line-strong"
      )}
    >
      <div className="text-[14px] font-semibold text-ink">{props.title}</div>
      <div className="mt-0.5 text-[12.5px] text-muted">{props.text}</div>
    </button>
  );
}

function RunBadge({ state }: { state: RunState }) {
  const tone = { queued: "neutral", running: "active", done: "done", failed: "danger", skipped: "neutral" } as const;
  const label = { queued: "queued", running: "running…", done: "done", failed: "failed", skipped: "reused" };
  return <Badge tone={tone[state]}>{label[state]}</Badge>;
}

/* ---------------------------------------------------------------------- */

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ResultsStep({
  detail,
  onUpdate,
}: {
  detail: Detail;
  onUpdate: () => void;
}) {
  const { slug, name } = detail.company;
  const report = detail.report;
  const legacy = Boolean(report && !report.data);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-semibold text-ink">{name}</h2>
          {detail.cost.allTime > 0 && (
            <p
              className="text-[12px] text-muted"
              title="Approximate, at Anthropic list prices. Includes research reused from earlier runs. Not shown in the PDF."
            >
              AI cost ≈ {detail.cost.thisReport !== null && <>{formatUsd(detail.cost.thisReport)} for this report · </>}
              {formatUsd(detail.cost.allTime)} spent on {name} in total
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={onUpdate}>
            Update research
          </Button>
          {report?.data && (
            <Button size="sm" onClick={() => window.print()}>
              Save as PDF
            </Button>
          )}
          {report && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => download(`${slug}-company-report.md`, report.content)}
            >
              Download .md
            </Button>
          )}
        </div>
      </div>

      {!report || legacy ? (
        <Alert tone="accent">
          {detail.research.length
            ? "This company was researched before the current report format. Click \u201cUpdate research\u201d and Run: saved research that is still fresh is reused (no new web searches) and the full visual report is built from it."
            : "No research yet for this company. Click \u201cUpdate research\u201d to start."}
        </Alert>
      ) : null}

      {report?.data ? (
        <ReportView
          data={report.data}
          meta={{
            company: name,
            mode: report.mode,
            version: report.version,
            createdAt: report.createdAt,
            logoUrl: detail.company.logoUrl,
          }}
        />
      ) : report ? (
        <Card>
          <article className="max-h-[75vh] overflow-y-auto whitespace-pre-wrap px-5 py-4 text-[13.5px] leading-[1.7] text-ink">
            {report.content}
          </article>
        </Card>
      ) : null}

      {detail.research.length > 0 && (
        <details className="no-print rounded-card border border-line bg-card p-4">
          <summary className="cursor-pointer text-[13px] font-medium text-muted">
            Underlying research, sourced and dated (only for fact-checking)
          </summary>
          <ul className="mt-3 space-y-1.5 text-[12.5px]">
            {detail.research.map((r) => (
              <li key={r.module} className="flex items-center justify-between gap-2">
                <span className="text-ink">
                  {r.module} <span className="text-muted">· researched {r.researchedOn}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => download(`${slug}-${r.module}.md`, r.content)}>
                  Download
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
