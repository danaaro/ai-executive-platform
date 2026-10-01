"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CircleDashed, Copy, Download, ExternalLink, HelpCircle } from "lucide-react";
import {
  BottomLine,
  GroupStructure,
  Hero,
  KeyFigures,
  Opportunities,
  Personas,
  PrintCover,
  Risks,
  SayVsDo,
  Sentiment,
  Timeline,
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
 * Screen: a category navigation (desktop sidebar / mobile chips) with a
 * coverage bar per category; one view at a time, deep-linkable by #hash.
 * Print/PDF: every view, in order, one category per page.
 *
 * Every answer shows its status — Found (sourced), Inferred (labelled, with
 * what it rests on) or Unknown (→ "Include these questions in your
 * interview"). Unknown never shows a value: no default scores, no guesses.
 */

export type View = "overview" | CategoryId | "interview" | "sources";

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
  const go = (v: View) => {
    window.location.hash = v;
    setView(v);
    document.getElementById("ctx-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toc = ["Overview", ...present.map((c) => c.title), "Include these questions in your interview", "Sources & validation"];
  const r1 = d as unknown as ReportData; // shared hero/cover fields

  return (
    <div className="space-y-6 print:space-y-5">
      <PrintCover r={r1} meta={meta} toc={toc} />
      <Hero r={r1} meta={meta} />

      <div id="ctx-top" className="scroll-mt-20 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <Nav d={d} view={view} go={go} iqCount={iqCount} />

        <div className="min-w-0 space-y-6">
          <Pane show={view === "overview"}>
            <Overview d={d} go={go} meta={meta} iqCount={iqCount} />
          </Pane>
          {present.map((def) => (
            <Pane key={def.id} show={view === def.id} printBreak>
              <CategoryView def={def} c={d.categories[def.id]!} d={d} go={go} />
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

/* -------------------------------------------------------------------------
 * Navigation
 * ---------------------------------------------------------------------- */

function Nav({ d, view, go, iqCount }: { d: ContextReportData; view: View; go: (v: View) => void; iqCount: number }) {
  const item = (v: View, label: string, extra?: React.ReactNode) => (
    <button
      key={v}
      onClick={() => go(v)}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
        view === v ? "bg-ink-soft font-semibold text-canvas" : "text-ink hover:bg-canvas-subtle"
      )}
    >
      <span className="min-w-0 leading-snug">{label}</span>
      {extra}
    </button>
  );

  return (
    <nav className="no-print mb-5 lg:sticky lg:top-20 lg:mb-0" aria-label="Report categories">
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

      {/* Desktop: grouped sidebar */}
      <div className="hidden rounded-card border border-line bg-card p-2 lg:block">
        {item("overview", "Overview")}
        {LAYERS.map((l) => {
          const cats = CATEGORIES.filter((c) => c.layer === l.id && d.categories[c.id]);
          if (!cats.length) return null;
          return (
            <div key={l.id} className="mt-2">
              <p className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{l.title}</p>
              {cats.map((c) => item(c.id, `${c.n}. ${c.title}`, <CoverageBar c={d.categories[c.id]!} tiny inverted={view === c.id} />))}
            </div>
          );
        })}
        <div className="mt-2 border-t border-line pt-2">
          {item(
            "interview",
            "Include these questions in your interview",
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
      className={cn("flex shrink-0 items-center gap-1.5", tiny ? "w-14" : "w-full")}
      title={`${cv.found} found · ${cv.inferred} inferred · ${cv.unknown} unknown`}
    >
      <span className={cn("flex h-1.5 flex-1 gap-[2px] overflow-hidden rounded-full", inverted ? "bg-canvas/20" : "bg-line")} aria-hidden>
        {cv.found > 0 && <span className="h-full bg-chart-mark" style={{ width: pct(cv.found) }} />}
        {cv.inferred > 0 && <span className="h-full bg-chart-mark/45" style={{ width: pct(cv.inferred) }} />}
      </span>
      {!tiny && (
        <span className="whitespace-nowrap text-[11px] text-muted">
          {cv.found} found · {cv.inferred} inferred · {cv.unknown} unknown
        </span>
      )}
      <span className="sr-only">{`${cv.found} found, ${cv.inferred} inferred, ${cv.unknown} unknown`}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------
 * Overview
 * ---------------------------------------------------------------------- */

function Card({ title, subtitle, children, className }: { title?: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("print-avoid-break rounded-card border border-line bg-card p-5 shadow-[0_1px_2px_rgba(10,17,25,0.04)] sm:p-6 print:shadow-none", className)}>
      {title && (
        <header className="print-keep-with-next mb-4 border-b border-line pb-3">
          <h2 className="font-display text-[16px] font-semibold leading-snug text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

function Overview({ d, go, meta, iqCount }: { d: ContextReportData; go: (v: View) => void; meta: ReportMeta; iqCount: number }) {
  return (
    <div className="space-y-6">
      <BottomLine items={d.bottomLine} />
      {d.keyFigures.length > 0 && <KeyFigures items={d.keyFigures} />}

      <Card title="The company, category by category" subtitle="Click a category to see every question, its answer, and where it comes from">
        <div className="space-y-5">
          {LAYERS.map((l) => {
            const cats = CATEGORIES.filter((c) => c.layer === l.id && d.categories[c.id]);
            if (!cats.length) return null;
            return (
              <div key={l.id}>
                <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{l.title}</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {cats.map((c) => {
                    const r = d.categories[c.id]!;
                    return (
                      <button
                        key={c.id}
                        onClick={() => go(c.id)}
                        className="group flex flex-col rounded-lg border border-line p-3.5 text-left transition-all hover:border-line-strong hover:shadow-[0_2px_10px_rgba(10,17,25,0.07)] focus-visible:outline-2 focus-visible:outline-accent-ink"
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-[14px] font-semibold leading-snug text-ink">
                            <span className="mr-1 font-display text-accent-ink">{c.n}.</span>
                            {c.title}
                          </span>
                          <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </span>
                        <span className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-muted">
                          {r.summary || "Little could be established from public sources — see the interview questions."}
                        </span>
                        <span className="mt-3">
                          <CoverageBar c={r} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <button
            onClick={() => go("interview")}
            className="flex w-full items-center justify-between rounded-lg border border-accent/50 bg-accent-wash/60 p-3.5 text-left"
          >
            <span>
              <span className="block text-[14px] font-semibold text-ink">Include these questions in your interview</span>
              <span className="text-[12.5px] text-muted">Everything public sources couldn't answer, phrased for the client conversation</span>
            </span>
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[13px] font-semibold text-white tabular-nums">{iqCount}</span>
          </button>
        </div>
      </Card>

      {d.keyPersonas.length > 0 && (
        <Card title="Key personas" subtitle="Public professional information only">
          <Personas items={d.keyPersonas} />
        </Card>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card title="Risks and watch-outs">
          <Risks items={d.risks} />
        </Card>
        <Card title="Opportunities and conversation angles">
          <Opportunities items={d.opportunities} />
        </Card>
      </div>

      {d.hireImplications.length > 0 && (
        <Card title="What this means for any senior hire" subtitle={`Context → candidate implications for ${meta.company} (inferred from the findings)`}>
          <ImplicationList items={d.hireImplications} />
        </Card>
      )}
    </div>
  );
}

function ImplicationList({ items }: { items: { finding: string; implication: string }[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((i, k) => (
        <li key={k} className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-2 sm:gap-4">
          <span className="text-[13px] leading-snug text-muted">{i.finding}</span>
          <span className="flex gap-1.5 text-[13.5px] font-medium leading-snug text-ink">
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

function CategoryView({ def, c, d, go }: { def: CategoryDef; c: CategoryResult; d: ContextReportData; go: (v: View) => void }) {
  const unknown = coverage(c).unknown;
  const questions = def.id === "strategy" ? c.answers.filter((a) => !a.id.startsWith("outcome")) : def.id === "ownership" ? c.answers.filter((a) => a.id !== "model" && a.id !== "priorities") : c.answers;
  return (
    <div className="space-y-6">
      <section className="print-avoid-break rounded-card border border-line bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
              {LAYERS.find((l) => l.id === def.layer)?.title}
            </p>
            <h2 className="mt-1 font-display text-[22px] font-semibold leading-tight text-ink">
              <span className="mr-1.5 text-accent-ink">{def.n}.</span>
              {def.title}
            </h2>
            <p className="mt-1 text-[12.5px] text-muted">{def.intro}</p>
          </div>
          <div className="w-full max-w-[280px]">
            <CoverageBar c={c} />
          </div>
        </div>
        {c.summary && <p className="mt-4 text-[14.5px] leading-[1.7] text-ink">{c.summary}</p>}
        {unknown > 0 && (
          <button onClick={() => go("interview")} className="no-print mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent-ink hover:underline">
            <HelpCircle className="size-3.5" aria-hidden /> {unknown} item{unknown === 1 ? "" : "s"} couldn&apos;t be established → in your interview questions
          </button>
        )}
      </section>

      <CategoryVisual def={def} c={c} d={d} />

      <Card title="Questions & answers" subtitle="Found = sourced · Inferred = reasoned from found facts · Unknown = ask in the interview">
        <ul className="divide-y divide-line">
          {questions.map((a) => (
            <AnswerRow key={a.id} a={a} />
          ))}
        </ul>
      </Card>

      {c.implications.length > 0 && (
        <Card title="What this means for a senior hire">
          <ImplicationList items={c.implications} />
        </Card>
      )}
    </div>
  );
}

function CategoryVisual({ def, c, d }: { def: CategoryDef; c: CategoryResult; d: ContextReportData }) {
  const by = (id: string) => c.answers.find((a) => a.id === id);
  switch (def.id) {
    case "ownership": {
      const model = by("model");
      const prio = by("priorities");
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <Highlight label="Ownership model" a={model} />
          <Highlight label="What the owner actually cares about" a={prio} />
        </div>
      );
    }
    case "evolution":
      return (
        <>
          <Card title="Where the company is on its path" subtitle="Current chapter and the next 2–3 years">
            <StageTrack c={c} />
          </Card>
          {d.timeline.length > 0 && (
            <Card title="Last 12 months: what matters">
              <Timeline items={d.timeline} />
            </Card>
          )}
        </>
      );
    case "strategy":
      return (
        <Card title="Top 3 outcomes expected in the next 24–36 months" subtitle="This becomes the candidate's mission">
          <div className="grid gap-3 md:grid-cols-3">
            {["outcome1", "outcome2", "outcome3"].map((id, i) => {
              const a = by(id);
              return (
                <div key={id} className={cn("rounded-lg border p-3.5", a?.status === "unknown" || !a ? "border-dashed border-line-strong" : "border-line")}>
                  <p className="font-display text-[22px] font-semibold text-accent-ink">{i + 1}</p>
                  {a && a.status !== "unknown" ? (
                    <>
                      <p className="mt-1 text-[13.5px] leading-snug text-ink">{a.answer}</p>
                      <div className="mt-2"><StatusBadge s={a.status} /></div>
                    </>
                  ) : (
                    <UnknownNote />
                  )}
                </div>
              );
            })}
          </div>
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
            <div className="grid gap-3 md:grid-cols-2">
              {c.people.map((p) => (
                <div key={p.name} className="rounded-lg border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14px] font-semibold text-ink">{p.name}</p>
                    <StatusBadge s={p.status} />
                  </div>
                  <p className="text-[12.5px] text-muted">{p.role}</p>
                  {p.influence.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {p.influence.map((x) => (
                        <li key={x} className="rounded-full border border-line bg-canvas-subtle px-2 py-0.5 text-[11px] text-ink">{x}</li>
                      ))}
                    </ul>
                  )}
                  {p.note && <p className="mt-2 text-[12.5px] leading-snug text-ink">{p.note}</p>}
                  <EvidenceChips e={p.evidence} />
                </div>
              ))}
            </div>
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
        <>
          <Card title="Culture map (Erin Meyer)" subtitle="Company culture on eight scales · hollow dot = inferred">
            <ScaleList ratings={c.ratings} />
          </Card>
          {d.employeeSentiment && (
            <Card title="Employee sentiment" subtitle={sentimentSubtitle(d.employeeSentiment)}>
              <Sentiment s={d.employeeSentiment} />
            </Card>
          )}
          {d.sayVsDo.length > 0 && (
            <Card title="Say vs. do" subtitle="Where the story and the evidence part ways">
              <SayVsDo items={d.sayVsDo} />
            </Card>
          )}
        </>
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
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-px text-[10.5px] font-semibold text-white">
        <Check className="size-3" aria-hidden /> Found
      </span>
    );
  if (s === "inferred")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-draft bg-draft-wash px-2 py-px text-[10.5px] font-semibold text-draft">
        ≈ Inferred
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line-strong px-2 py-px text-[10.5px] font-semibold text-muted">
      <CircleDashed className="size-3" aria-hidden /> Unknown
    </span>
  );
}

function UnknownNote({ text }: { text?: string }) {
  return (
    <p className="mt-1 flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
      <CircleDashed className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {text ?? "Not found in public sources → added to your interview questions."}
    </p>
  );
}

function EvidenceChips({ e }: { e: Evidence[] }) {
  if (!e.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
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

function AnswerRow({ a }: { a: Answer }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-muted">{a.question}</p>
        <StatusBadge s={a.status} />
      </div>
      {a.status === "unknown" ? (
        <UnknownNote />
      ) : (
        <>
          <p className="mt-1 text-[14px] leading-snug text-ink">{a.answer}</p>
          {a.status === "inferred" && a.basedOn.length > 0 && (
            <p className="mt-1 text-[12px] leading-snug text-draft">Based on: {a.basedOn.join(" · ")}</p>
          )}
          <EvidenceChips e={a.evidence} />
        </>
      )}
    </li>
  );
}

function Highlight({ label, a }: { label: string; a?: Answer }) {
  return (
    <section className="rounded-card border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
        {a && <StatusBadge s={a.status} />}
      </div>
      {a && a.status !== "unknown" ? (
        <>
          <p className="mt-2 font-display text-[18px] font-semibold leading-snug text-ink">{a.answer}</p>
          {a.status === "inferred" && a.basedOn.length > 0 && <p className="mt-1 text-[12px] text-draft">Based on: {a.basedOn.join(" · ")}</p>}
          <EvidenceChips e={a.evidence} />
        </>
      ) : (
        <UnknownNote />
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
      <div className="mt-3 flex items-center gap-2">
        <StatusBadge s={s.status} />
        {s.note && <p className="text-[13px] leading-snug text-ink">{s.note}</p>}
      </div>
      <EvidenceChips e={s.evidence} />
    </div>
  );
}

/** Spectrum rows (Meyer, leadership, change). Unknown = no dot, labelled — never a default midpoint. */
function ScaleList({ ratings }: { ratings: Rating[] }) {
  return (
    <>
      <ul className="space-y-5">
        {ratings.map((r) => {
          const pct = r.position === null ? null : ((r.position - 1) / 4) * 100;
          return (
            <li key={r.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink">{r.label}</span>
                <span className="flex items-center gap-2 text-[11.5px] text-muted">
                  {r.position !== null && <span><span className="font-semibold tabular-nums text-ink">{r.position}</span>/5</span>}
                  <StatusBadge s={r.status} />
                </span>
              </div>
              <div className="relative mt-2.5 h-4" aria-hidden>
                <div className={cn("absolute inset-x-0 top-1/2 h-px -translate-y-1/2", pct === null ? "border-t border-dashed border-line-strong" : "bg-line-strong")} />
                {[0, 25, 50, 75, 100].map((t) => (
                  <span key={t} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-strong" style={{ left: `${t}%` }} />
                ))}
                {pct !== null && (
                  <span
                    className={cn(
                      "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                      r.status === "inferred" ? "border-2 border-chart-mark bg-card" : "bg-chart-mark"
                    )}
                    style={{ left: `${pct}%` }}
                  />
                )}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted">
                <span>{r.left}</span>
                <span>{r.right}</span>
              </div>
              {r.position === null ? <UnknownNote /> : r.note && <p className="mt-1 text-[12.5px] leading-snug text-muted">{r.note}</p>}
            </li>
          );
        })}
      </ul>
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

function Heatmap({ ratings }: { ratings: Rating[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-separate border-spacing-[3px] text-[12.5px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-[0.06em] text-muted">
            <th className="text-left font-semibold">Area</th>
            {[1, 2, 3, 4, 5].map((n) => (
              <th key={n} className="w-[13%] font-semibold">
                {n === 1 ? "1 Local" : n === 5 ? "5 Group" : n}
              </th>
            ))}
            <th className="w-[80px] text-left font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {ratings.map((r) => (
            <tr key={r.id} title={r.note ?? undefined}>
              <td className="pr-2 font-medium text-ink">{r.label}</td>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = r.position !== null && Math.round(r.position) === n;
                return (
                  <td
                    key={n}
                    className={cn(
                      "h-7 rounded-[4px]",
                      r.position === null
                        ? "bg-[repeating-linear-gradient(45deg,var(--line)_0_4px,transparent_4px_8px)]"
                        : on
                          ? r.status === "inferred"
                            ? "bg-chart-mark/50"
                            : "bg-chart-mark"
                          : "bg-chart-track"
                    )}
                  >
                    {on && <span className="sr-only">{n}</span>}
                  </td>
                );
              })}
              <td className="pl-1">{r.position === null ? <span className="text-[11px] text-muted">ask</span> : <StatusBadge s={r.status} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted">Solid = found · lighter = inferred · hatched = unknown (in your interview questions)</p>
    </div>
  );
}

function RapidTable({ rows }: { rows: NonNullable<CategoryResult["rapid"]> }) {
  const cols = [
    ["recommend", "Recommend"],
    ["input", "Input"],
    ["agree", "Agree"],
    ["decide", "Decide"],
    ["execute", "Execute"],
  ] as const;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-[12.5px]">
        <thead>
          <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-muted">
            <th className="py-2 pr-2 font-semibold">Decision</th>
            {cols.map(([, l]) => (
              <th key={l} className="py-2 pr-2 font-semibold">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.decision} className="align-top">
              <td className="py-2 pr-2 font-semibold text-ink">
                {r.decision}
                <div className="mt-1"><StatusBadge s={r.status} /></div>
              </td>
              {r.status === "unknown" ? (
                <td colSpan={5} className="py-2 text-muted">
                  <span className="inline-flex items-center gap-1.5"><CircleDashed className="size-3.5" aria-hidden /> Not public → interview question</span>
                </td>
              ) : (
                cols.map(([k]) => (
                  <td key={k} className="py-2 pr-2 text-ink">{r[k] ?? <span className="text-muted">?</span>}</td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some((r) => r.formalVsActual) && (
        <ul className="mt-3 space-y-1 text-[12.5px] text-ink">
          {rows.filter((r) => r.formalVsActual).map((r) => (
            <li key={r.decision}><span className="font-semibold">{r.decision}:</span> {r.formalVsActual}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StakeholderGrid({ c }: { c: CategoryResult }) {
  const order = { high: 0, medium: 1, low: 2 } as const;
  const rows = [...(c.stakeholders ?? [])].sort((a, b) => (a.importance ? order[a.importance] : 3) - (b.importance ? order[b.importance] : 3));
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((s) => (
        <div key={s.group} className={cn("rounded-lg border p-3", s.importance === "high" ? "border-accent/60 bg-accent-wash/40" : "border-line")}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13.5px] font-semibold text-ink">{s.group}</p>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{s.importance ? `${s.importance} importance` : "importance unknown"}</span>
          </div>
          {s.note && <p className="mt-1 text-[12.5px] leading-snug text-ink">{s.note}</p>}
          <div className="mt-1.5"><StatusBadge s={s.status} /></div>
        </div>
      ))}
    </div>
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
    <Card title="Include these questions in your interview" subtitle="Everything public sources could not establish — no guesses were made in their place">
      <div className="no-print mb-4 flex gap-2">
        <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-canvas-subtle">
          {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copied ? "Copied" : "Copy all"}
        </button>
        <button onClick={download} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-canvas-subtle">
          <Download className="size-3.5" aria-hidden /> Download .md
        </button>
      </div>
      {groups.length === 0 ? (
        <p className="text-[13px] text-muted">Everything in scope was established from sources.</p>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.category} className="print-avoid-break">
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-accent-ink">{g.category}</h3>
              <ol className="space-y-1.5">
                {g.questions.map((q) => (
                  <li key={q} className="flex gap-3 rounded-lg border border-line p-2.5 text-[13.5px] leading-snug text-ink">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-canvas-subtle text-[11.5px] font-semibold tabular-nums text-muted">{++n}</span>
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
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Found (sourced)", v.found],
          ["Inferred (labelled)", v.inferred],
          ["Unknown → interview", v.unknown],
          ["Downgraded for missing evidence", v.downgraded],
        ].map(([l, n]) => (
          <div key={l as string} className="rounded-lg bg-canvas-subtle p-3">
            <dt className="text-[11.5px] text-muted">{l}</dt>
            <dd className="text-[22px] font-semibold text-ink">{n}</dd>
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
      <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Research behind this report</h3>
      <ul className="mt-2 divide-y divide-line text-[13px]">
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
