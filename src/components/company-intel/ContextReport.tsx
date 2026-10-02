"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  LayoutGrid,
  Rows3,
  X,
} from "lucide-react";
import {
  BottomLine,
  CompanyLogo,
  GroupStructure,
  KeyFigures,
  Opportunities,
  Personas,
  PrintCover,
  Risks,
  SayVsDo,
  Sentiment,
  Timeline,
  TrajectoryIcon,
  sentimentSubtitle,
  type ReportMeta,
} from "@/components/company-intel/ReportView";
import {
  CATEGORIES,
  LAYERS,
  STAGES,
  coverage,
  interviewQuestions,
  type Answer,
  type CategoryDef,
  type CategoryId,
  type CategoryResult,
  type ContextReportData,
  type Evidence,
  type Rating,
  type Status,
} from "@/shared/company-context";
import type { ReportData } from "@/shared/company-report";
import { cn } from "@/lib/utils";

/**
 * The Company Context report (v2, ADR-009 §17): grouped by category.
 *
 * Screen: a compact header, a collapsible layer → category sidebar (mobile
 * chips), one view at a time, deep-linkable by #hash. Inside a view, detail is
 * nested: established answers first, evidence behind a per-answer toggle,
 * unknowns folded into one "ask in the interview" group, secondary material in
 * tabs/disclosures. Print/PDF: every view, every tab and disclosure expanded,
 * one category per page.
 *
 * Every answer shows its status — Found (sourced), Inferred (labelled, with
 * what it rests on) or Unknown (→ "Include these questions in your
 * interview"). Unknown never shows a value: no default scores, no guesses.
 */

export type View = "overview" | CategoryId | "interview" | "sources";
type Layout = "report" | "cockpit";
const LAYOUT_KEY = "company-intel:layout";

export function ContextReport({ data: d, meta, initialView = "overview" }: { data: ContextReportData; meta: ReportMeta; initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  const iq = useMemo(() => interviewQuestions(d), [d]);
  const iqCount = iq.reduce((t, g) => t + g.questions.length, 0);
  const present = CATEGORIES.filter((c) => d.categories[c.id]);

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1) as View;
      const valid = h === "overview" || h === "interview" || h === "sources" || CATEGORIES.some((c) => c.id === h);
      if (valid) setView(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  /* Two screen layouts over the same data: "report" (sidebar + one view) and
   * "cockpit" (all categories as tiles, detail in a side panel). Print always
   * uses the report layout. The choice is remembered per browser. */
  const [layout, setLayout] = useState<Layout>("report");
  useEffect(() => {
    try {
      const s = window.localStorage.getItem(LAYOUT_KEY);
      if (s === "report" || s === "cockpit") setLayout(s);
    } catch {
      /* storage blocked — default layout */
    }
  }, []);
  const pickLayout = (l: Layout) => {
    setLayout(l);
    try {
      window.localStorage.setItem(LAYOUT_KEY, l);
    } catch {
      /* ignore */
    }
  };

  const go = (v: View) => {
    window.location.hash = v;
    setView(v);
    if (layout === "report") document.getElementById("ctx-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
    else document.getElementById("ctx-panel")?.scrollTo({ top: 0 });
  };

  const toc = ["Overview", ...present.map((c) => c.title), "Include these questions in your interview", "Sources & validation"];
  const r1 = d as unknown as ReportData; // shared hero/cover fields

  return (
    <div className="space-y-5 print:space-y-5">
      <PrintCover r={r1} meta={meta} toc={toc} />
      <CompactHero d={d} meta={meta} />

      <LayoutSwitch layout={layout} pick={pickLayout} />

      {layout === "cockpit" && (
        <div className="no-print">
          <Cockpit d={d} meta={meta} view={view} go={go} iqCount={iqCount} iq={iq} present={present} />
        </div>
      )}

      <div
        id="ctx-top"
        className={cn(
          "scroll-mt-20 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start lg:gap-5",
          layout === "cockpit" && "hidden print:block"
        )}
      >
        <Nav d={d} view={view} go={go} iqCount={iqCount} />

        <div className="min-w-0 space-y-5">
          <Pane show={view === "overview"}>
            <Overview d={d} go={go} meta={meta} iqCount={iqCount} />
          </Pane>
          {present.map((def, i) => (
            <Pane key={def.id} show={view === def.id} printBreak>
              <CategoryView def={def} c={d.categories[def.id]!} d={d} go={go} prev={present[i - 1]} next={present[i + 1]} />
            </Pane>
          ))}
          <Pane show={view === "interview"} printBreak>
            <InterviewView groups={iq} company={meta.company} />
          </Pane>
          <Pane show={view === "sources"} printBreak>
            <SourcesView d={d} />
          </Pane>
        </div>
      </div>
    </div>
  );
}

function Pane({ show, printBreak, children }: { show: boolean; printBreak?: boolean; children: React.ReactNode }) {
  return <div className={cn(show ? "block" : "hidden", "print:block", printBreak && "print:break-before-page")}>{children}</div>;
}

function LayoutSwitch({ layout, pick }: { layout: Layout; pick: (l: Layout) => void }) {
  return (
    <div className="no-print flex justify-end">
      <div className="inline-flex rounded-lg border border-line bg-card p-0.5 text-[12px] font-medium" role="radiogroup" aria-label="Layout">
        {(
          [
            ["report", "Report", Rows3],
            ["cockpit", "Cockpit", LayoutGrid],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            role="radio"
            aria-checked={layout === id}
            onClick={() => pick(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors",
              layout === id ? "bg-ink-soft text-canvas" : "text-muted hover:text-ink"
            )}
          >
            <Icon className="size-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Cockpit — every category visible at once; detail slides in from the right
 * ---------------------------------------------------------------------- */

function Cockpit({
  d,
  meta,
  view,
  go,
  iqCount,
  iq,
  present,
}: {
  d: ContextReportData;
  meta: ReportMeta;
  view: View;
  go: (v: View) => void;
  iqCount: number;
  iq: { category: string; questions: string[] }[];
  present: CategoryDef[];
}) {
  const open = view !== "overview";
  const close = () => go("overview");
  const highRisks = d.risks.filter((r) => r.severity === "high").length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const idx = present.findIndex((c) => c.id === view);
  const def = idx >= 0 ? present[idx] : undefined;

  return (
    <div className="space-y-4">
      {/* Signal strip */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <BottomLineCompact items={d.bottomLine} />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line">
          {d.keyFigures.slice(0, 2).map((k, i) => (
            <Metric key={i} label={k.label} value={k.value} note={[k.context, k.asOf].filter(Boolean).join(" · ")} />
          ))}
          <Metric label="Open questions" value={String(iqCount)} note="Couldn't be established — ask in the interview" onClick={() => go("interview")} accent />
          <Metric
            label="High-severity risks"
            value={String(highRisks)}
            note={d.risks.find((r) => r.severity === "high")?.risk ?? "None flagged"}
            onClick={() => document.getElementById("cockpit-insights")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        </div>
      </div>

      {/* Tiles */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-[15px] font-semibold text-ink">15 lenses on {meta.company}</h2>
          <p className="flex items-center gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-chart-mark" /> found</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-chart-mark/45" /> inferred</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-line" /> unknown</span>
            <span className="hidden sm:inline">· dashed = mostly unknown</span>
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {present.map((c) => (
            <Tile key={c.id} def={c} c={d.categories[c.id]!} d={d} onOpen={() => go(c.id)} active={view === c.id} />
          ))}
          <button
            onClick={() => go("interview")}
            className="group flex flex-col justify-between rounded-card border border-accent/60 bg-accent-wash p-3.5 text-left transition-shadow hover:shadow-[0_4px_16px_rgba(10,17,25,0.08)]"
          >
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-accent-ink">For the interview</span>
            <span className="mt-2 font-display text-[30px] font-semibold leading-none text-ink tabular-nums">{iqCount}</span>
            <span className="mt-1 text-[12.5px] leading-snug text-ink">questions public sources couldn&apos;t answer</span>
            <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-accent-ink">
              Open list <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </button>
        </div>
      </section>

      <div id="cockpit-insights" className="scroll-mt-20">
        <Tabs
          title="Insights"
          tabs={[
            ...(d.risks.length ? [{ id: "risks", label: "Risks", count: d.risks.length, content: <Risks items={d.risks} /> }] : []),
            ...(d.opportunities.length ? [{ id: "opps", label: "Opportunities", count: d.opportunities.length, content: <Opportunities items={d.opportunities} /> }] : []),
            ...(d.hireImplications.length
              ? [{ id: "hire", label: "For a senior hire", count: d.hireImplications.length, content: <ImplicationList items={d.hireImplications} /> }]
              : []),
            ...(d.keyPersonas.length ? [{ id: "people", label: "Key people", count: d.keyPersonas.length, content: <Personas items={d.keyPersonas} /> }] : []),
          ]}
        />
      </div>
      <p className="text-right text-[12px]">
        <button onClick={() => go("sources")} className="font-medium text-muted hover:text-ink hover:underline">
          Sources &amp; validation →
        </button>
      </p>

      {/* Side panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Details">
          <button className="absolute inset-0 cursor-default bg-ink/35 backdrop-blur-[1px]" onClick={close} aria-label="Close details" />
          <div id="ctx-panel" className="relative flex h-full w-full max-w-[760px] flex-col overflow-y-auto bg-canvas shadow-[-12px_0_40px_rgba(10,17,25,0.18)]">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-canvas/95 px-4 py-2.5 backdrop-blur sm:px-6">
              <p className="min-w-0 truncate text-[12px] text-muted">
                {meta.company} · <span className="font-semibold text-ink">{def ? `${def.n}. ${def.title}` : view === "interview" ? "Interview questions" : "Sources & validation"}</span>
              </p>
              <button onClick={close} className="flex size-8 items-center justify-center rounded-lg border border-line text-ink hover:bg-canvas-subtle" aria-label="Close">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="p-4 sm:p-6">
              {def ? (
                <CategoryView def={def} c={d.categories[def.id]!} d={d} go={go} prev={present[idx - 1]} next={present[idx + 1]} />
              ) : view === "interview" ? (
                <InterviewView groups={iq} company={meta.company} />
              ) : (
                <SourcesView d={d} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BottomLineCompact({ items }: { items: string[] }) {
  const [more, setMore] = useState(false);
  const [lead, ...rest] = items;
  return (
    <section className="rounded-card border border-line bg-card p-4 sm:p-5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">Bottom line</p>
      {lead && <p className="mt-2 text-[14.5px] font-semibold leading-snug text-ink">{lead}</p>}
      {rest.length > 0 && (
        <>
          {more && (
            <ol className="mt-3 space-y-2">
              {rest.map((t, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-ink">
                  <span className="w-4 shrink-0 text-right font-semibold tabular-nums text-accent-ink">{i + 2}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          )}
          <button onClick={() => setMore((m) => !m)} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-accent-ink hover:underline" aria-expanded={more}>
            {more ? "Show less" : `${rest.length} more points`}
            <ChevronDown className={cn("size-3.5 transition-transform", more && "rotate-180")} aria-hidden />
          </button>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, note, onClick, accent }: { label: string; value: string; note?: string; onClick?: () => void; accent?: boolean }) {
  const body = (
    <>
      <span className="block text-[11px] leading-tight text-muted">{label}</span>
      <span className={cn("mt-1 block text-[22px] font-semibold leading-tight tabular-nums", accent ? "text-accent-ink" : "text-ink")}>{value}</span>
      {note && <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted">{note}</span>}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="bg-card p-3.5 text-left hover:bg-canvas-subtle">{body}</button>
  ) : (
    <div className="bg-card p-3.5" title={note}>{body}</div>
  );
}

/** The one-line "headline value" a tile leads with, taken only from established answers. */
function tileSignal(def: CategoryDef, c: CategoryResult): string | null {
  const ok = (id: string) => {
    const a = c.answers.find((x) => x.id === id);
    return a && a.status !== "unknown" && a.answer ? a.answer : null;
  };
  switch (def.id) {
    case "ownership":
      return ok("model") ?? ok("owner");
    case "evolution":
      return c.stage && c.stage.status !== "unknown" && c.stage.current
        ? `Now: ${c.stage.current}${c.stage.next ? ` → next: ${c.stage.next}` : ""}`
        : ok("current");
    case "business":
      return ok("revenueModel") ?? ok("advantages");
    case "strategy":
      return ok("outcome1") ?? ok("priorities");
    case "organisation":
      return ok("archetype");
    case "centralisation": {
      const known = c.ratings.filter((r) => r.position !== null);
      if (!known.length) return null;
      const group = known.filter((r) => r.position! >= 4).map((r) => r.label);
      const local = known.filter((r) => r.position! <= 2).map((r) => r.label);
      return [group.length && `Group: ${group.join(", ")}`, local.length && `Local: ${local.join(", ")}`].filter(Boolean).join(" · ") || null;
    }
    case "power":
      return c.people?.length ? c.people.slice(0, 3).map((p) => p.name).join(", ") + (c.people.length > 3 ? ` +${c.people.length - 3}` : "") : null;
    case "ecosystem": {
      const hi = c.stakeholders?.filter((s) => s.importance === "high").map((s) => s.group) ?? [];
      return hi.length ? `Key: ${hi.join(", ")}` : null;
    }
    default:
      return null;
  }
}

function Tile({ def, c, onOpen, active }: { def: CategoryDef; c: CategoryResult; d: ContextReportData; onOpen: () => void; active: boolean }) {
  const cv = coverage(c);
  const pct = Math.round(((cv.found + cv.inferred) / Math.max(1, cv.total)) * 100);
  const thin = cv.total > 0 && cv.unknown / cv.total > 0.6;
  const signal = tileSignal(def, c);
  return (
    <button
      onClick={onOpen}
      aria-current={active ? "true" : undefined}
      title={c.summary || undefined}
      className={cn(
        "group flex min-h-[168px] flex-col rounded-card border bg-card p-3.5 text-left transition-all hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(10,17,25,0.08)] focus-visible:outline-2 focus-visible:outline-accent-ink",
        thin ? "border-dashed border-line-strong" : "border-line",
        active && "ring-2 ring-accent"
      )}
    >
      <span className="flex items-center justify-between gap-2 text-[10.5px]">
        <span className="min-w-0 truncate font-semibold uppercase tracking-[0.08em] text-muted">
          <span className="mr-1 text-accent-ink">{def.n}</span>
          {LAYERS.find((l) => l.id === def.layer)?.title}
        </span>
        <span className="shrink-0 font-semibold tabular-nums text-muted">{pct}%</span>
      </span>
      <span className="mt-1 text-[14px] font-semibold leading-snug text-ink">{def.title}</span>
      {signal ? (
        <>
          <span className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug text-accent-ink">{signal}</span>
          <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted">{c.summary}</span>
        </>
      ) : (
        <span className="mt-2 line-clamp-4 text-[12px] leading-snug text-muted">
          {c.summary || "Little could be established publicly — see the interview questions."}
        </span>
      )}
      <span className="mt-auto pt-3">
        <span className="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full bg-line" aria-hidden>
          {cv.found > 0 && <span className="h-full bg-chart-mark" style={{ width: `${(cv.found / cv.total) * 100}%` }} />}
          {cv.inferred > 0 && <span className="h-full bg-chart-mark/45" style={{ width: `${(cv.inferred / cv.total) * 100}%` }} />}
        </span>
        <span className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
          <span className="tabular-nums">
            {cv.found} found · {cv.inferred} inferred
          </span>
          {cv.unknown > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CircleDashed className="size-3" aria-hidden /> {cv.unknown} open
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------
 * Header — one compact band instead of a full-height hero
 * ---------------------------------------------------------------------- */

const CONF_STEPS = { low: 1, medium: 2, high: 3 } as const;

function CompactHero({ d, meta }: { d: ContextReportData; meta: ReportMeta }) {
  const v = d.validation;
  const total = Math.max(1, v.found + v.inferred + v.unknown);
  return (
    <section className="overflow-hidden rounded-card bg-ink-soft text-canvas print:hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5 sm:px-6">
        {meta.logoUrl && <CompanyLogo url={meta.logoUrl} name={meta.company} size="lg" />}
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-accent">
            Company Context · {meta.mode === "full" ? "Full research" : "Culture focus"}
          </p>
          <h1 className="mt-0.5 font-display text-[24px] font-semibold leading-tight">{meta.company}</h1>
          <p className="mt-1 line-clamp-2 max-w-3xl text-[14px] leading-snug text-canvas/80" title={d.headline}>
            {d.headline}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-canvas/10 bg-canvas/10 text-[12px] sm:grid-cols-4">
        <HeroStat label="Trajectory">
          <span className="inline-flex items-center gap-1.5 font-semibold capitalize">
            <TrajectoryIcon direction={d.trajectory.direction} light />
            {d.trajectory.direction}
          </span>
        </HeroStat>
        <HeroStat label="Confidence">
          <span className="flex items-center gap-2" aria-label={`Confidence: ${d.overallConfidence}`}>
            <span className="flex gap-0.5" aria-hidden>
              {[1, 2, 3].map((i) => (
                <span key={i} className={cn("h-1.5 w-4 rounded-full", i <= CONF_STEPS[d.overallConfidence] ? "bg-accent" : "bg-canvas/20")} />
              ))}
            </span>
            <span className="font-semibold capitalize">{d.overallConfidence}</span>
          </span>
        </HeroStat>
        <HeroStat label="Established">
          <span className="flex items-center gap-2">
            <span className="flex h-1.5 w-16 gap-[2px] overflow-hidden rounded-full bg-canvas/20" aria-hidden>
              <span className="h-full bg-accent" style={{ width: `${(v.found / total) * 100}%` }} />
              <span className="h-full bg-accent/50" style={{ width: `${(v.inferred / total) * 100}%` }} />
            </span>
            <span className="font-semibold tabular-nums">{Math.round(((v.found + v.inferred) / total) * 100)}%</span>
            <span className="sr-only">{`${v.found} found, ${v.inferred} inferred, ${v.unknown} unknown`}</span>
          </span>
        </HeroStat>
        <HeroStat label={`v${meta.version}`}>
          <span className="font-semibold">
            {new Date(meta.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          {d.sourcesCount !== null && <span className="text-canvas/60"> · {d.sourcesCount} sources</span>}
        </HeroStat>
      </dl>
    </section>
  );
}

function HeroStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-ink-soft px-5 py-2.5 sm:px-6">
      <dt className="text-[10.5px] uppercase tracking-[0.1em] text-canvas/55">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Navigation — layers collapse; the active one opens itself
 * ---------------------------------------------------------------------- */

function Nav({ d, view, go, iqCount }: { d: ContextReportData; view: View; go: (v: View) => void; iqCount: number }) {
  const activeLayer = CATEGORIES.find((c) => c.id === view)?.layer;
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeLayer ? [activeLayer] : []));
  useEffect(() => {
    if (activeLayer) setOpen((s) => (s.has(activeLayer) ? s : new Set(s).add(activeLayer)));
  }, [activeLayer]);
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const item = (v: View, label: React.ReactNode, extra?: React.ReactNode, indent?: boolean) => (
    <button
      key={v}
      onClick={() => go(v)}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md py-1.5 pr-2 text-left text-[12.5px] transition-colors",
        indent ? "pl-5" : "pl-2.5",
        view === v ? "bg-ink-soft font-semibold text-canvas" : "text-ink hover:bg-canvas-subtle"
      )}
    >
      <span className="min-w-0 truncate leading-snug">{label}</span>
      {extra}
    </button>
  );

  return (
    <nav className="no-print mb-4 lg:sticky lg:top-20 lg:mb-0 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto" aria-label="Report categories">
      {/* Mobile: chips */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:hidden">
        {(["overview", ...CATEGORIES.filter((c) => d.categories[c.id]).map((c) => c.id), "interview", "sources"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => go(v)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium",
              view === v ? "border-ink-soft bg-ink-soft text-canvas" : "border-line bg-card text-ink"
            )}
          >
            {v === "overview" ? "Overview" : v === "interview" ? `Interview questions (${iqCount})` : v === "sources" ? "Sources" : CATEGORIES.find((c) => c.id === v)!.title}
          </button>
        ))}
      </div>

      {/* Desktop: layer accordion */}
      <div className="hidden rounded-card border border-line bg-card p-1.5 lg:block">
        {item("overview", "Overview")}
        <div className="my-1.5 border-t border-line" />
        {LAYERS.map((l) => {
          const cats = CATEGORIES.filter((c) => c.layer === l.id && d.categories[c.id]);
          if (!cats.length) return null;
          const isOpen = open.has(l.id);
          const hasActive = cats.some((c) => c.id === view);
          const agg = cats.reduce(
            (t, c) => {
              const cv = coverage(d.categories[c.id]!);
              return { known: t.known + cv.found + cv.inferred, total: t.total + cv.total };
            },
            { known: 0, total: 0 }
          );
          return (
            <div key={l.id}>
              <button
                onClick={() => toggle(l.id)}
                aria-expanded={isOpen}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[12px] font-semibold hover:bg-canvas-subtle",
                  hasActive && !isOpen ? "text-accent-ink" : "text-ink/75"
                )}
              >
                <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", !isOpen && "-rotate-90")} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{l.title}</span>
                <span className="text-[11px] font-normal tabular-nums text-muted" title={`${agg.known} of ${agg.total} items established`}>
                  {cats.length}
                </span>
              </button>
              {isOpen && (
                <div className="pb-1">
                  {cats.map((c) =>
                    item(
                      c.id,
                      <>
                        <span className={cn("mr-1 tabular-nums", view === c.id ? "text-canvas/60" : "text-muted")}>{c.n}</span>
                        {c.title}
                      </>,
                      <CoverageBar c={d.categories[c.id]!} tiny inverted={view === c.id} />,
                      true
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="mt-1.5 border-t border-line pt-1.5">
          {item(
            "interview",
            "Interview questions",
            <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular-nums", view === "interview" ? "bg-accent text-ink" : "bg-accent-wash text-accent-ink")}>
              {iqCount}
            </span>
          )}
          {item("sources", "Sources & validation")}
        </div>
      </div>
    </nav>
  );
}

/** found ▮ inferred ▮ unknown — one hue, three intensities, with counts in text (never color alone). */
function CoverageBar({ c, tiny, inverted }: { c: CategoryResult; tiny?: boolean; inverted?: boolean }) {
  const cv = coverage(c);
  const pct = (n: number) => `${(n / Math.max(1, cv.total)) * 100}%`;
  return (
    <span
      className={cn("flex shrink-0 items-center gap-1.5", tiny ? "w-10" : "w-full")}
      title={`${cv.found} found · ${cv.inferred} inferred · ${cv.unknown} unknown`}
    >
      <span className={cn("flex h-1.5 flex-1 gap-[2px] overflow-hidden rounded-full", inverted ? "bg-canvas/20" : "bg-line")} aria-hidden>
        {cv.found > 0 && <span className="h-full bg-chart-mark" style={{ width: pct(cv.found) }} />}
        {cv.inferred > 0 && <span className="h-full bg-chart-mark/45" style={{ width: pct(cv.inferred) }} />}
      </span>
      {!tiny && (
        <span className="whitespace-nowrap text-[11px] tabular-nums text-muted">
          {cv.found} found · {cv.inferred} inferred · {cv.unknown} unknown
        </span>
      )}
      <span className="sr-only">{`${cv.found} found, ${cv.inferred} inferred, ${cv.unknown} unknown`}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------
 * Layout primitives: card, tabs, disclosure (all print fully expanded)
 * ---------------------------------------------------------------------- */

function Card({
  title,
  subtitle,
  aside,
  children,
  className,
  flush,
}: {
  title?: string;
  subtitle?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("print-avoid-break rounded-card border border-line bg-card print:shadow-none", !flush && "p-4 sm:p-5", className)}>
      {title && (
        <header className={cn("print-keep-with-next mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1", flush && "px-4 pt-4 sm:px-5")}>
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-semibold leading-snug text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
          </div>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

type Tab = { id: string; label: string; count?: number; content: React.ReactNode };

/** One card, several panes. On paper every pane prints under its own label. */
function Tabs({ tabs, title }: { tabs: Tab[]; title?: string }) {
  const live = tabs.filter(Boolean);
  const [active, setActive] = useState(live[0]?.id);
  if (!live.length) return null;
  return (
    <section className="rounded-card border border-line bg-card print:border-0">
      <div className="no-print flex items-center gap-1 overflow-x-auto border-b border-line px-2 sm:px-3" role="tablist">
        {title && <span className="mr-2 hidden shrink-0 pl-1 font-display text-[14px] font-semibold text-ink sm:block">{title}</span>}
        {live.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-2.5 py-2.5 text-[12.5px] font-medium transition-colors",
              active === t.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 rounded-full bg-canvas-subtle px-1.5 text-[11px] tabular-nums text-muted">{t.count}</span>}
          </button>
        ))}
      </div>
      {live.map((t) => (
        <div key={t.id} role="tabpanel" className={cn("p-4 sm:p-5 print:mb-4 print:block print:p-0", active === t.id ? "block" : "hidden")}>
          <h3 className="mb-3 hidden font-display text-[15px] font-semibold text-ink print:block">{t.label}</h3>
          {t.content}
        </div>
      ))}
    </section>
  );
}

function Disclosure({
  label,
  count,
  hint,
  defaultOpen,
  tone = "plain",
  children,
}: {
  label: string;
  count?: number;
  hint?: string;
  defaultOpen?: boolean;
  tone?: "plain" | "unknown";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <section className={cn("rounded-card border bg-card", tone === "unknown" ? "border-dashed border-line-strong" : "border-line")}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="no-print flex w-full items-center gap-2.5 px-4 py-3 text-left sm:px-5"
      >
        {tone === "unknown" ? (
          <CircleDashed className="size-4 shrink-0 text-muted" aria-hidden />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="text-[13.5px] font-semibold text-ink">{label}</span>
          {count !== undefined && <span className="ml-2 rounded-full bg-canvas-subtle px-1.5 text-[11px] font-semibold tabular-nums text-muted">{count}</span>}
          {hint && <span className="ml-2 hidden text-[12px] text-muted sm:inline">{hint}</span>}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <h3 className="hidden px-0 pb-2 font-display text-[15px] font-semibold text-ink print:block">{label}</h3>
      <div className={cn("border-t border-line px-4 py-3 sm:px-5 print:block print:border-0 print:p-0", open ? "block" : "hidden")}>{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------
 * Overview
 * ---------------------------------------------------------------------- */

function Overview({ d, go, meta, iqCount }: { d: ContextReportData; go: (v: View) => void; meta: ReportMeta; iqCount: number }) {
  const [lead, ...rest] = d.bottomLine;
  return (
    <div className="space-y-5">
      {/* Screen: bottom line + figures in one card. Print keeps the original blocks. */}
      <section className="no-print rounded-card border border-line bg-card">
        <div className={cn("grid", d.keyFigures.length > 0 && "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]")}>
          <div className="p-4 sm:p-5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">Bottom line</p>
            {lead && <p className="mt-2 text-[14.5px] font-semibold leading-snug text-ink">{lead}</p>}
            {rest.length > 0 && (
              <ol className="mt-3 space-y-2">
                {rest.map((t, i) => (
                  <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug text-ink">
                    <span className="w-4 shrink-0 text-right font-semibold tabular-nums text-accent-ink">{i + 2}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {d.keyFigures.length > 0 && (
            <dl className="grid grid-cols-2 content-start border-t border-line lg:border-l lg:border-t-0">
              {d.keyFigures.slice(0, 6).map((k, i) => (
                <div key={i} className={cn("border-b border-line p-3.5", i % 2 === 0 && "border-r")} title={k.context}>
                  <dt className="text-[11px] leading-tight text-muted">{k.label}</dt>
                  <dd className="mt-1 text-[18px] font-semibold leading-tight text-ink">{k.value}</dd>
                  <dd className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">
                    {k.context}
                    {k.asOf && <span className="whitespace-nowrap"> · {k.asOf}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>
      <div className="hidden space-y-5 print:block">
        <BottomLine items={d.bottomLine} />
        {d.keyFigures.length > 0 && <KeyFigures items={d.keyFigures} />}
      </div>

      <CategoryMap d={d} go={go} iqCount={iqCount} />

      <Tabs
        title="Insights"
        tabs={[
          ...(d.risks.length ? [{ id: "risks", label: "Risks", count: d.risks.length, content: <Risks items={d.risks} /> }] : []),
          ...(d.opportunities.length
            ? [{ id: "opps", label: "Opportunities", count: d.opportunities.length, content: <Opportunities items={d.opportunities} /> }]
            : []),
          ...(d.hireImplications.length
            ? [
                {
                  id: "hire",
                  label: "For a senior hire",
                  count: d.hireImplications.length,
                  content: (
                    <>
                      <p className="mb-3 text-[12px] text-muted">Context → candidate implications for {meta.company} (inferred from the findings)</p>
                      <ImplicationList items={d.hireImplications} />
                    </>
                  ),
                },
              ]
            : []),
          ...(d.keyPersonas.length
            ? [
                {
                  id: "people",
                  label: "Key people",
                  count: d.keyPersonas.length,
                  content: (
                    <>
                      <p className="mb-3 text-[12px] text-muted">Public professional information only</p>
                      <Personas items={d.keyPersonas} />
                    </>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

/** Every category as one dense row, grouped by layer. Summary on hover; detail one click away. */
function CategoryMap({ d, go, iqCount }: { d: ContextReportData; go: (v: View) => void; iqCount: number }) {
  return (
    <Card
      title="The company, category by category"
      subtitle="Bar = how much public sources could establish · click for answers and evidence"
      aside={
        <button
          onClick={() => go("interview")}
          className="no-print inline-flex items-center gap-1.5 rounded-full border border-accent/60 bg-accent-wash px-2.5 py-1 text-[12px] font-semibold text-accent-ink hover:bg-accent-wash/70"
        >
          <HelpCircle className="size-3.5" aria-hidden /> {iqCount} interview questions
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      }
    >
      <div className="gap-x-6 md:columns-2">
        {LAYERS.map((l) => {
          const cats = CATEGORIES.filter((c) => c.layer === l.id && d.categories[c.id]);
          if (!cats.length) return null;
          return (
            <div key={l.id} className="print-avoid-break mb-4 break-inside-avoid">
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{l.title}</p>
              <ul className="divide-y divide-line border-y border-line">
                {cats.map((c) => {
                  const r = d.categories[c.id]!;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => go(c.id)}
                        title={r.summary || undefined}
                        className="group grid w-full grid-cols-[1.25rem_minmax(0,1fr)_3.5rem_1rem] items-center gap-2 py-2 text-left hover:bg-canvas-subtle focus-visible:outline-2 focus-visible:outline-accent-ink"
                      >
                        <span className="text-right font-display text-[12.5px] font-semibold tabular-nums text-accent-ink">{c.n}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-ink">{c.title}</span>
                          <span className="block truncate text-[11.5px] text-muted print:whitespace-normal">
                            {r.summary || "Little established publicly — see interview questions."}
                          </span>
                        </span>
                        <CoverageBar c={r} tiny />
                        <ChevronRight className="size-3.5 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ImplicationList({ items }: { items: { finding: string; implication: string }[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((i, k) => (
        <li key={k} className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-2 sm:gap-4">
          <span className="text-[12.5px] leading-snug text-muted">{i.finding}</span>
          <span className="flex gap-1.5 text-[13px] font-medium leading-snug text-ink">
            <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-accent-ink" aria-hidden />
            {i.implication}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------
 * Category view
 * ---------------------------------------------------------------------- */

function CategoryView({
  def,
  c,
  d,
  go,
  prev,
  next,
}: {
  def: CategoryDef;
  c: CategoryResult;
  d: ContextReportData;
  go: (v: View) => void;
  prev?: CategoryDef;
  next?: CategoryDef;
}) {
  const cv = coverage(c);
  const questions =
    def.id === "strategy"
      ? c.answers.filter((a) => !a.id.startsWith("outcome"))
      : def.id === "ownership"
        ? c.answers.filter((a) => a.id !== "model" && a.id !== "priorities")
        : c.answers;
  const known = questions.filter((a) => a.status !== "unknown");
  const unknown = questions.filter((a) => a.status === "unknown");

  return (
    <div className="space-y-4">
      <section className="print-avoid-break rounded-card border border-line bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
              {LAYERS.find((l) => l.id === def.layer)?.title} · {def.n} of {CATEGORIES.length}
            </p>
            <h2 className="mt-0.5 font-display text-[20px] font-semibold leading-tight text-ink">{def.title}</h2>
            <p className="mt-0.5 text-[12px] text-muted">{def.intro}</p>
          </div>
          <PrevNext prev={prev} next={next} go={go} compact />
        </div>
        {c.summary && <p className="mt-3 text-[14px] leading-[1.65] text-ink">{c.summary}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
          <div className="w-full max-w-[300px]">
            <CoverageBar c={c} />
          </div>
          {cv.unknown > 0 && (
            <button onClick={() => go("interview")} className="no-print inline-flex items-center gap-1.5 text-[12px] font-medium text-accent-ink hover:underline">
              <HelpCircle className="size-3.5" aria-hidden /> {cv.unknown} open → interview questions
            </button>
          )}
        </div>
      </section>

      <CategoryVisual def={def} c={c} d={d} />

      {known.length > 0 && (
        <Card title="What we know" subtitle="Found = sourced · Inferred = reasoned from found facts" flush>
          <ul className="divide-y divide-line border-t border-line">
            {known.map((a) => (
              <AnswerRow key={a.id} a={a} />
            ))}
          </ul>
        </Card>
      )}

      {unknown.length > 0 && (
        <Disclosure label="Not established from public sources" count={unknown.length} hint="ask these in the interview" tone="unknown">
          <ul className="space-y-1.5">
            {unknown.map((a) => (
              <li key={a.id} className="flex gap-2 text-[13px] leading-snug text-ink">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full border border-line-strong" aria-hidden />
                <span>{a.question}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {c.implications.length > 0 && (
        <Disclosure label="What this means for a senior hire" count={c.implications.length} defaultOpen>
          <ImplicationList items={c.implications} />
        </Disclosure>
      )}

      <div className="no-print">
        <PrevNext prev={prev} next={next} go={go} />
      </div>
    </div>
  );
}

function PrevNext({ prev, next, go, compact }: { prev?: CategoryDef; next?: CategoryDef; go: (v: View) => void; compact?: boolean }) {
  if (compact)
    return (
      <div className="no-print flex shrink-0 gap-1">
        {([
          { cat: prev, Icon: ChevronLeft, l: "Previous" },
          { cat: next, Icon: ChevronRight, l: "Next" },
        ] as const).map(({ cat, Icon, l }) => (
          <button
            key={l}
            disabled={!cat}
            onClick={() => cat && go(cat.id)}
            title={cat ? `${l}: ${cat.title}` : undefined}
            aria-label={cat ? `${l}: ${cat.title}` : l}
            className="flex size-8 items-center justify-center rounded-lg border border-line text-ink hover:bg-canvas-subtle disabled:opacity-30"
          >
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-3">
      {prev ? (
        <button onClick={() => go(prev.id)} className="flex items-center gap-2 rounded-card border border-line bg-card px-4 py-3 text-left hover:border-line-strong">
          <ChevronLeft className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[11px] text-muted">Previous</span>
            <span className="block truncate text-[13px] font-semibold text-ink">{prev.n}. {prev.title}</span>
          </span>
        </button>
      ) : (
        <span />
      )}
      {next ? (
        <button onClick={() => go(next.id)} className="flex items-center justify-end gap-2 rounded-card border border-line bg-card px-4 py-3 text-right hover:border-line-strong">
          <span className="min-w-0">
            <span className="block text-[11px] text-muted">Next</span>
            <span className="block truncate text-[13px] font-semibold text-ink">{next.n}. {next.title}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function CategoryVisual({ def, c, d }: { def: CategoryDef; c: CategoryResult; d: ContextReportData }) {
  const by = (id: string) => c.answers.find((a) => a.id === id);
  switch (def.id) {
    case "ownership": {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <Highlight label="Ownership model" a={by("model")} />
          <Highlight label="What the owner actually cares about" a={by("priorities")} />
        </div>
      );
    }
    case "evolution":
      return (
        <Tabs
          tabs={[
            { id: "stage", label: "Where it is on its path", content: <StageTrack c={c} /> },
            ...(d.timeline.length ? [{ id: "timeline", label: "Last 12 months", count: d.timeline.length, content: <Timeline items={d.timeline} /> }] : []),
          ]}
        />
      );
    case "strategy":
      return (
        <Card title="Top 3 outcomes expected in the next 24–36 months" subtitle="This becomes the candidate's mission">
          <ol className="grid gap-3 md:grid-cols-3">
            {["outcome1", "outcome2", "outcome3"].map((id, i) => {
              const a = by(id);
              const ok = a && a.status !== "unknown";
              return (
                <li key={id} className={cn("flex gap-3 rounded-lg border p-3", ok ? "border-line" : "border-dashed border-line-strong")}>
                  <span className="font-display text-[20px] font-semibold leading-none text-accent-ink">{i + 1}</span>
                  <div className="min-w-0">
                    {ok ? (
                      <>
                        <p className="text-[13px] leading-snug text-ink">{a.answer}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <StatusBadge s={a.status} />
                          <EvidenceToggle e={a.evidence} />
                        </div>
                      </>
                    ) : (
                      <UnknownNote />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      );
    case "organisation":
      return d.groupStructure && (d.groupStructure.entities.length > 0 || d.groupStructure.parent) ? (
        <Card title="Group structure" subtitle="One level up, one level down">
          <GroupStructure g={d.groupStructure} />
        </Card>
      ) : null;
    case "centralisation":
      return (
        <Card title="Where control sits, area by area" subtitle="1 = completely local · 5 = completely Group-controlled">
          <Heatmap ratings={c.ratings} />
        </Card>
      );
    case "decisions":
      return c.rapid ? (
        <Card title="Decision-rights map (RAPID)" subtitle="Recommend · Input · Agree · Decide · Execute — where evidenced">
          <RapidTable rows={c.rapid} />
        </Card>
      ) : null;
    case "power":
      return (
        <Card title="Power map" subtitle="Confirmed-current people only · public professional information">
          {c.people?.length ? (
            <ul className="divide-y divide-line">
              {c.people.map((p) => (
                <li key={p.name} className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink">{p.name}</p>
                    <p className="text-[12px] text-muted">{p.role}</p>
                    {p.influence.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1">
                        {p.influence.map((x) => (
                          <li key={x} className="rounded-full border border-line bg-canvas-subtle px-1.5 py-px text-[10.5px] text-ink">{x}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="min-w-0">
                    {p.note && <p className="text-[13px] leading-snug text-ink">{p.note}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StatusBadge s={p.status} />
                      <EvidenceToggle e={p.evidence} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <UnknownNote text="Real influence isn't visible from public sources — it's in your interview questions." />
          )}
        </Card>
      );
    case "leadership":
    case "change":
      return (
        <Card title={def.id === "leadership" ? "How the management system behaves" : "How much change and ambiguity"} subtitle="Scale 1–5 · hollow dot = inferred">
          <ScaleList ratings={c.ratings} />
        </Card>
      );
    case "culture":
      return (
        <Tabs
          tabs={[
            { id: "map", label: "Culture map", content: (<><p className="mb-3 text-[12px] text-muted">Erin Meyer&apos;s eight scales · hollow dot = inferred</p><ScaleList ratings={c.ratings} /></>) },
            ...(d.employeeSentiment
              ? [{ id: "sentiment", label: "Employee sentiment", content: (<><p className="mb-3 text-[12px] text-muted">{sentimentSubtitle(d.employeeSentiment)}</p><Sentiment s={d.employeeSentiment} /></>) }]
              : []),
            ...(d.sayVsDo.length
              ? [{ id: "sayvsdo", label: "Say vs. do", count: d.sayVsDo.length, content: <SayVsDo items={d.sayVsDo} /> }]
              : []),
          ]}
        />
      );
    case "ecosystem":
      return (
        <Card title="External stakeholders" subtitle="Which relationships shape success">
          {c.stakeholders?.length ? <StakeholderGrid c={c} /> : <UnknownNote />}
        </Card>
      );
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------
 * Building blocks
 * ---------------------------------------------------------------------- */

function StatusBadge({ s }: { s: Status }) {
  if (s === "found")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-1.5 py-px text-[10.5px] font-semibold text-white">
        <Check className="size-3" aria-hidden /> Found
      </span>
    );
  if (s === "inferred")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-draft bg-draft-wash px-1.5 py-px text-[10.5px] font-semibold text-draft">
        ≈ Inferred
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line-strong px-1.5 py-px text-[10.5px] font-semibold text-muted">
      <CircleDashed className="size-3" aria-hidden /> Unknown
    </span>
  );
}

function UnknownNote({ text }: { text?: string }) {
  return (
    <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
      <CircleDashed className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {text ?? "Not found in public sources → added to your interview questions."}
    </p>
  );
}

function EvidenceChips({ e }: { e: Evidence[] }) {
  if (!e.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {e.slice(0, 4).map((x, i) => (
        <li key={i}>
          {x.url ? (
            <a href={x.url} target="_blank" rel="noreferrer" className="inline-flex max-w-[320px] items-center gap-1 rounded-md border border-line bg-canvas-subtle px-1.5 py-0.5 text-[11px] text-muted hover:text-ink">
              <span className="min-w-0 truncate">{x.source}</span>
              <span className="shrink-0 whitespace-nowrap">· {x.date.split(",")[0]}</span>
              <ExternalLink className="size-3 shrink-0" aria-hidden />
            </a>
          ) : (
            <span className="inline-flex max-w-[320px] items-center gap-1 rounded-md border border-line bg-canvas-subtle px-1.5 py-0.5 text-[11px] text-muted">
              <span className="min-w-0 truncate">{x.source}</span>
              <span className="shrink-0 whitespace-nowrap">· {x.date.split(",")[0]}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** "2 sources ▾" — evidence one click away on screen, always printed. */
function EvidenceToggle({ e, basedOn }: { e: Evidence[]; basedOn?: string[] }) {
  const [open, setOpen] = useState(false);
  const hasBasis = Boolean(basedOn && basedOn.length);
  if (!e.length && !hasBasis) return null;
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="no-print inline-flex items-center gap-0.5 text-[11.5px] font-medium text-muted hover:text-ink"
      >
        {e.length ? `${e.length} source${e.length === 1 ? "" : "s"}` : "basis"}
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div className={cn("basis-full space-y-1.5", open ? "block" : "hidden", "print:block")}>
        {hasBasis && <p className="text-[12px] leading-snug text-draft">Based on: {basedOn!.join(" · ")}</p>}
        <EvidenceChips e={e} />
      </div>
    </>
  );
}

function AnswerRow({ a }: { a: Answer }) {
  return (
    <li className="grid gap-1 px-4 py-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4 sm:px-5">
      <p className="text-[12px] font-medium leading-snug text-muted">{a.question}</p>
      <div className="min-w-0">
        <p className="text-[13.5px] leading-snug text-ink">{a.answer}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <StatusBadge s={a.status} />
          <EvidenceToggle e={a.evidence} basedOn={a.status === "inferred" ? a.basedOn : undefined} />
        </div>
      </div>
    </li>
  );
}

function Highlight({ label, a }: { label: string; a?: Answer }) {
  return (
    <section className="rounded-card border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
        {a && <StatusBadge s={a.status} />}
      </div>
      {a && a.status !== "unknown" ? (
        <>
          <p className="mt-1.5 font-display text-[16px] font-semibold leading-snug text-ink">{a.answer}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <EvidenceToggle e={a.evidence} basedOn={a.status === "inferred" ? a.basedOn : undefined} />
          </div>
        </>
      ) : (
        <div className="mt-1.5"><UnknownNote /></div>
      )}
    </section>
  );
}

function StageTrack({ c }: { c: CategoryResult }) {
  const s = c.stage;
  if (!s || s.status === "unknown") return <UnknownNote />;
  return (
    <div>
      <ol className="flex flex-wrap gap-1.5">
        {STAGES.map((st, i) => {
          const cur = st === s.current;
          const nxt = st === s.next && !cur;
          return (
            <li
              key={st}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]",
                cur ? "border-chart-mark bg-chart-mark font-semibold text-white" : nxt ? "border-accent bg-accent-wash font-semibold text-accent-ink" : "border-line text-muted"
              )}
            >
              <span className="tabular-nums opacity-70">{i + 1}</span> {st}
              {cur && <span className="text-[10px] uppercase tracking-wide">· now</span>}
              {nxt && <span className="text-[10px] uppercase tracking-wide">· next</span>}
            </li>
          );
        })}
      </ol>
      {s.note && <p className="mt-3 text-[13px] leading-snug text-ink">{s.note}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge s={s.status} />
        <EvidenceToggle e={s.evidence} />
      </div>
    </div>
  );
}

/** Unknown items aren't drawn as empty rows — they're listed once, compactly. */
function UnknownLine({ items }: { items: Rating[] }) {
  if (!items.length) return null;
  return (
    <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-dashed border-line-strong px-3 py-2 text-[12px] leading-snug text-muted">
      <CircleDashed className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold text-ink">Not established ({items.length}):</span> {items.map((r) => r.label).join(" · ")}
        <span className="block">→ in your interview questions</span>
      </span>
    </p>
  );
}

/** Spectrum rows (Meyer, leadership, change). Unknown = no dot, listed below — never a default midpoint. */
function ScaleList({ ratings }: { ratings: Rating[] }) {
  const known = ratings.filter((r) => r.position !== null);
  const unknown = ratings.filter((r) => r.position === null);
  return (
    <>
      <ul className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        {known.map((r) => {
          const pct = ((r.position! - 1) / 4) * 100;
          return (
            <li key={r.id} title={r.note ?? undefined}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-ink">{r.label}</span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span><span className="font-semibold tabular-nums text-ink">{r.position}</span>/5</span>
                  {r.status === "inferred" && <span className="text-draft">≈</span>}
                </span>
              </div>
              <div className="relative mt-2 h-3.5" aria-hidden>
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
                {[0, 25, 50, 75, 100].map((t) => (
                  <span key={t} className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-line-strong" style={{ left: `${t}%` }} />
                ))}
                <span
                  className={cn(
                    "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                    r.status === "inferred" ? "border-2 border-chart-mark bg-card" : "bg-chart-mark"
                  )}
                  style={{ left: `${pct}%` }}
                />
              </div>
              <div className="mt-0.5 flex justify-between gap-2 text-[10.5px] text-muted">
                <span>{r.left}</span>
                <span className="text-right">{r.right}</span>
              </div>
              {r.note && <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted print:line-clamp-none">{r.note}</p>}
            </li>
          );
        })}
      </ul>
      <UnknownLine items={unknown} />
      <table className="sr-only">
        <caption>Scale positions</caption>
        <tbody>
          {ratings.map((r) => (
            <tr key={r.id}>
              <td>{`${r.label}: ${r.left} (1) to ${r.right} (5)`}</td>
              <td>{r.position ?? "unknown"}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Known areas sorted from most Group-controlled to most local, with their note inline. */
function Heatmap({ ratings }: { ratings: Rating[] }) {
  const known = ratings.filter((r) => r.position !== null).sort((a, b) => b.position! - a.position!);
  const unknown = ratings.filter((r) => r.position === null);
  return (
    <div>
      {known.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-separate border-spacing-x-[3px] border-spacing-y-[3px] text-[12.5px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[0.06em] text-muted">
                <th className="w-[120px] text-left font-semibold">Area</th>
                {[1, 2, 3, 4, 5].map((n) => (
                  <th key={n} className="w-10 font-semibold">
                    {n === 1 ? "Local" : n === 5 ? "Group" : n}
                  </th>
                ))}
                <th className="text-left font-semibold">
                  <span className="sr-only">Note</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {known.map((r) => (
                <tr key={r.id} className="align-middle">
                  <td className="whitespace-nowrap pr-2 font-medium text-ink">
                    {r.label}
                    {r.status === "inferred" && <span className="ml-1 text-draft" title="Inferred">≈</span>}
                  </td>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const on = Math.round(r.position!) === n;
                    return (
                      <td
                        key={n}
                        className={cn("h-6 w-10 rounded-[4px]", on ? (r.status === "inferred" ? "bg-chart-mark/50" : "bg-chart-mark") : "bg-chart-track")}
                      >
                        {on && <span className="sr-only">{n}</span>}
                      </td>
                    );
                  })}
                  <td className="py-1 pl-3 text-[12px] leading-snug text-muted">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">Solid = found · lighter / ≈ = inferred · sorted from most Group-controlled to most local</p>
        </div>
      ) : (
        <UnknownNote />
      )}
      <UnknownLine items={unknown} />
    </div>
  );
}

function RapidTable({ rows }: { rows: NonNullable<CategoryResult["rapid"]> }) {
  const cols = [
    ["recommend", "R"],
    ["input", "I"],
    ["agree", "A"],
    ["decide", "D"],
    ["execute", "E"],
  ] as const;
  const known = rows.filter((r) => r.status !== "unknown");
  const unknown = rows.filter((r) => r.status === "unknown");
  return (
    <div>
      {known.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-muted">
                <th className="py-2 pr-2 font-semibold">Decision</th>
                {cols.map(([k, l]) => (
                  <th key={k} className="py-2 pr-2 font-semibold" title={k}>
                    {l}<span className="hidden lg:inline">{k.slice(1)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {known.map((r) => (
                <tr key={r.decision} className="align-top">
                  <td className="py-2 pr-2 font-semibold text-ink">
                    {r.decision}
                    {r.status === "inferred" && <span className="ml-1 font-normal text-draft" title="Inferred">≈</span>}
                  </td>
                  {cols.map(([k]) => (
                    <td key={k} className="py-2 pr-2 text-ink">{r[k] ?? <span className="text-muted">?</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {known.some((r) => r.formalVsActual) && (
        <ul className="mt-3 space-y-1 text-[12.5px] text-ink">
          {known.filter((r) => r.formalVsActual).map((r) => (
            <li key={r.decision}><span className="font-semibold">{r.decision}:</span> {r.formalVsActual}</li>
          ))}
        </ul>
      )}
      {unknown.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-dashed border-line-strong px-3 py-2 text-[12px] leading-snug text-muted">
          <CircleDashed className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold text-ink">Not public ({unknown.length}):</span> {unknown.map((r) => r.decision).join(" · ")} → interview
          </span>
        </p>
      )}
    </div>
  );
}

function StakeholderGrid({ c }: { c: CategoryResult }) {
  const order = { high: 0, medium: 1, low: 2 } as const;
  const rows = [...(c.stakeholders ?? [])].sort((a, b) => (a.importance ? order[a.importance] : 3) - (b.importance ? order[b.importance] : 3));
  return (
    <ul className="divide-y divide-line">
      {rows.map((s) => (
        <li key={s.group} className="grid gap-1 py-2 first:pt-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
          <p className="text-[13px] font-semibold text-ink">
            {s.group}
            {s.importance === "high" && <span className="ml-1.5 rounded-full bg-accent-wash px-1.5 text-[10.5px] font-semibold text-accent-ink">high</span>}
            {s.importance && s.importance !== "high" && <span className="ml-1.5 text-[10.5px] font-normal text-muted">{s.importance}</span>}
          </p>
          <p className="text-[12.5px] leading-snug text-ink">{s.note ?? <span className="text-muted">—</span>}</p>
          <StatusBadge s={s.status} />
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------
 * Interview questions & sources
 * ---------------------------------------------------------------------- */

function InterviewView({ groups, company }: { groups: { category: string; questions: string[] }[]; company: string }) {
  const [copied, setCopied] = useState(false);
  const md = [`# Include these questions in your interview — ${company}`, "", ...groups.flatMap((g) => [`## ${g.category}`, ...g.questions.map((q, i) => `${i + 1}. ${q}`), ""])].join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the download still works */
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${company.replace(/[^\p{L}\p{N}]+/gu, "")}_InterviewQuestions.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  let n = 0;
  return (
    <Card
      title="Include these questions in your interview"
      subtitle="Everything public sources could not establish — no guesses were made in their place"
      aside={
        <div className="no-print flex gap-2">
          <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-canvas-subtle">
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copied ? "Copied" : "Copy all"}
          </button>
          <button onClick={download} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1 text-[12px] font-medium text-ink hover:bg-canvas-subtle">
            <Download className="size-3.5" aria-hidden /> .md
          </button>
        </div>
      }
    >
      {groups.length === 0 ? (
        <p className="text-[13px] text-muted">Everything in scope was established from sources.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.category} className="print-avoid-break">
              <h3 className="mb-1 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-ink">
                {g.category}
                <span className="font-normal tabular-nums text-muted">{g.questions.length}</span>
              </h3>
              <ol className="divide-y divide-line border-y border-line">
                {g.questions.map((q) => (
                  <li key={q} className="flex gap-3 py-2 text-[13px] leading-snug text-ink">
                    <span className="w-5 shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-muted">{++n}</span>
                    {q}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const MODULE_TITLES: Record<string, string> = {
  "01-identity-ownership": "Identity & ownership",
  "02-financial-health": "Financial health",
  "03-recent-activity": "Recent activity",
  "04-people-structure": "People & structure",
  "05-culture-voice": "Culture & employee voice",
  "06-group-structure": "Group & portfolio",
  "07-business-strategy": "Business model & strategy",
  "08-performance-talent-ecosystem": "Performance, talent & ecosystem",
};

function SourcesView({ d }: { d: ContextReportData }) {
  const v = d.validation;
  return (
    <Card title="Sources & validation" subtitle="How far to trust this report">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {[
          ["Found (sourced)", v.found],
          ["Inferred (labelled)", v.inferred],
          ["Unknown → interview", v.unknown],
          ["Downgraded (no evidence)", v.downgraded],
        ].map(([l, n]) => (
          <div key={l as string} className="bg-card p-3">
            <dt className="text-[11px] text-muted">{l}</dt>
            <dd className="text-[20px] font-semibold tabular-nums text-ink">{n}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
        Every Found or Inferred answer cites a source that was checked against the research files. Answers whose citation couldn&apos;t be
        verified were downgraded to Unknown automatically and moved to the interview questions. Confidence: <span className="font-semibold capitalize text-ink">{d.overallConfidence}</span>
        {d.sourcesCount ? ` · ${d.sourcesCount} sources across the research` : ""}.
      </p>
      {v.untraced.length > 0 && (
        <div className="mt-3 rounded-lg border border-warn/40 bg-warn-wash p-3 text-[12.5px] text-warn">
          <p className="font-semibold">Removed or flagged: numbers that couldn&apos;t be traced to a source</p>
          <ul className="mt-1 list-disc pl-5">
            {v.untraced.slice(0, 12).map((u) => <li key={u}>{u}</li>)}
          </ul>
        </div>
      )}
      <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Research behind this report</h3>
      <ul className="mt-1 divide-y divide-line text-[13px]">
        {d.sources.map((s) => (
          <li key={s.module} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-ink">{MODULE_TITLES[s.module] ?? s.module}</span>
            <span className="text-[12px] text-muted">
              researched {s.researchedOn}
              {s.briefOutdated && <span className="ml-2 rounded-full border border-line-strong px-1.5 py-px text-[10.5px]">earlier brief</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
