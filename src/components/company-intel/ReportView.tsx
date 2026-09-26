"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  CircleMinus,
  Info,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { DIMENSIONS, type Confidence, type Coverage, type ReportData } from "@/shared/company-report";
import { cn } from "@/lib/utils";

/**
 * The Company Intelligence Report as an executive page (2026-09-26).
 *
 * Built for a two-minute read: headline → bottom line → numbers → story →
 * people → culture → sentiment → risks → angles. Charts follow the dataviz
 * method: single series in the validated `chart-mark` token, thin marks,
 * values as text beside marks (never color alone), hover detail, and a
 * screen-reader table behind every chart.
 */

export type ReportMeta = {
  company: string;
  mode: "full" | "culture-only";
  version: number;
  createdAt: string;
};

export function ReportView({ data: r, meta }: { data: ReportData; meta: ReportMeta }) {
  const full = meta.mode === "full";
  return (
    <div className="space-y-6 print:space-y-4">
      <Hero r={r} meta={meta} />
      <BottomLine items={r.bottomLine} />
      {r.keyFigures.length > 0 && <KeyFigures items={r.keyFigures} />}

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <Section title="At a glance" className="lg:col-span-2">
          <AtAGlance g={r.atAGlance} />
        </Section>
        <Section title="Where the company is right now" className="lg:col-span-3">
          {r.currentSituation ? (
            <p className="text-[14px] leading-[1.75] text-ink">{r.currentSituation}</p>
          ) : (
            <NotResearched what="Company situation" />
          )}
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-canvas-subtle p-3 text-[13px] text-ink">
            <TrajectoryIcon direction={r.trajectory.direction} />
            <span>
              <strong className="font-semibold capitalize">{r.trajectory.direction}.</strong>{" "}
              {r.trajectory.explanation}
            </span>
          </p>
        </Section>
      </div>

      <Section title="Last 12 months: what matters">
        {r.timeline.length ? <Timeline items={r.timeline} /> : <NotResearched what="Recent activity" />}
      </Section>

      <Section title="Key personas" subtitle="Public professional information only">
        {r.keyPersonas.length ? (
          <Personas items={r.keyPersonas} />
        ) : (
          <NotResearched what="Leadership" hint={full ? undefined : "Run Full research to add key personas."} />
        )}
      </Section>

      <Section title="Culture: who thrives here" subtitle={`The ${meta.company}-ness`}>
        <CultureColumns c={r.culture} />
      </Section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Section title="Culture DNA" subtitle="Where they sit on six trade-offs (1–5)">
          <CultureDNA dims={r.culture.dimensions} />
          <p className="mt-4 rounded-lg border-l-2 border-accent bg-accent-wash/60 px-3 py-2 text-[13px] leading-relaxed text-ink">
            <span className="font-semibold">What actually gets rewarded: </span>
            {r.culture.whatGetsRewarded}
          </p>
        </Section>
        <Section title="Employee sentiment" subtitle={sentimentSubtitle(r.employeeSentiment)}>
          <Sentiment s={r.employeeSentiment} />
        </Section>
      </div>

      {r.sayVsDo.length > 0 && (
        <Section title="Say vs. do" subtitle="Where the story and the evidence part ways">
          <SayVsDo items={r.sayVsDo} />
        </Section>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Section title="Risks and watch-outs">
          <Risks items={r.risks} />
        </Section>
        <Section title="Opportunities and conversation angles">
          <Opportunities items={r.opportunities} />
        </Section>
      </div>

      <Section title="Questions to raise with the client">
        <ol className="grid gap-2 sm:grid-cols-2">
          {r.questions.map((q, i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-line p-3 text-[13.5px] leading-snug text-ink">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-canvas-subtle text-[12px] font-semibold text-muted">
                {i + 1}
              </span>
              {q}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Confidence and sources">
        <CoverageStrip r={r} />
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function Section({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "print-avoid-break rounded-card border border-line bg-card p-5 shadow-[0_1px_2px_rgba(10,17,25,0.04)] sm:p-6",
        className
      )}
    >
      <header className="mb-4">
        <h2 className="font-display text-[16px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function NotResearched({ what, hint }: { what: string; hint?: string }) {
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted">
      <CircleDashed className="size-4" aria-hidden />
      {what} was not researched in this run.{hint ? ` ${hint}` : ""}
    </p>
  );
}

/* ---------------------------------------------------------------------- */

const CONF_STEPS: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

function Hero({ r, meta }: { r: ReportData; meta: ReportMeta }) {
  return (
    <section className="print-avoid-break overflow-hidden rounded-card bg-ink-soft text-canvas">
      <div className="p-6 sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
          Company Intelligence Report · {meta.mode === "full" ? "Full research" : "Culture focus"}
        </p>
        <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight sm:text-[34px]">
          {meta.company}
        </h1>
        <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-canvas/90 sm:text-[18px]">{r.headline}</p>

        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 text-[12.5px]">
          <div className="flex items-center gap-2">
            <span className="text-canvas/60">Trajectory</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-canvas/25 px-2.5 py-0.5 font-semibold capitalize">
              <TrajectoryIcon direction={r.trajectory.direction} light />
              {r.trajectory.direction}
            </span>
          </div>
          <div className="flex items-center gap-2" aria-label={`Confidence: ${r.overallConfidence}`}>
            <span className="text-canvas/60">Confidence</span>
            <span className="flex gap-1" aria-hidden>
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-2 w-6 rounded-full",
                    i <= CONF_STEPS[r.overallConfidence] ? "bg-accent" : "bg-canvas/20"
                  )}
                />
              ))}
            </span>
            <span className="font-semibold capitalize">{r.overallConfidence}</span>
          </div>
          <div className="text-canvas/60">
            v{meta.version} · {new Date(meta.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            {r.sourcesCount !== null && ` · ${r.sourcesCount} sources`}
          </div>
        </div>
      </div>
    </section>
  );
}

function TrajectoryIcon({ direction, light }: { direction: ReportData["trajectory"]["direction"]; light?: boolean }) {
  const cls = cn("size-4 shrink-0", light ? "text-accent" : "text-accent-ink");
  switch (direction) {
    case "growing":
      return <TrendingUp className={cls} aria-hidden />;
    case "under pressure":
      return <TrendingDown className={cls} aria-hidden />;
    case "transforming":
      return <RefreshCw className={cls} aria-hidden />;
    case "stable":
      return <Minus className={cls} aria-hidden />;
    default:
      return <CircleHelp className={cls} aria-hidden />;
  }
}

/* ---------------------------------------------------------------------- */

function BottomLine({ items }: { items: string[] }) {
  return (
    <section className="print-avoid-break">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Bottom line</h2>
      <ol className="grid gap-3 md:grid-cols-2">
        {items.map((t, i) => (
          <li
            key={i}
            className={cn(
              "flex gap-3 rounded-card border border-line bg-card p-4 text-[14px] leading-snug text-ink",
              i === 0 && "md:col-span-2 border-accent/50 bg-accent-wash/50 text-[15px] font-medium"
            )}
          >
            <span className="font-display text-[20px] font-semibold leading-none text-accent-ink">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function KeyFigures({ items }: { items: ReportData["keyFigures"] }) {
  return (
    <section className="print-avoid-break grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {items.slice(0, 5).map((k, i) => (
        <div key={i} className="rounded-card border border-line bg-card p-4">
          <p className="text-[12px] text-muted">{k.label}</p>
          <p className="mt-1 text-[24px] font-semibold leading-tight text-ink">{k.value}</p>
          <p className="mt-1 text-[11.5px] leading-snug text-muted">
            {k.context}
            {k.asOf && <span className="whitespace-nowrap"> · {k.asOf}</span>}
          </p>
        </div>
      ))}
    </section>
  );
}

function AtAGlance({ g }: { g: ReportData["atAGlance"] }) {
  const rows: [string, string][] = [
    ["What they do", g.whatTheyDo],
    ["Ownership", g.ownership],
    ["Size & footprint", g.sizeAndFootprint],
    ["Financial direction", g.financialDirection],
    ["Leadership", g.leadership],
    ["Current moment", g.currentMoment],
  ];
  return (
    <dl className="divide-y divide-line">
      {rows.map(([k, v]) => (
        <div key={k} className="py-2.5 first:pt-0 last:pb-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{k}</dt>
          <dd className="mt-0.5 text-[13.5px] leading-snug text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------------------------------------------------------------- */

function Timeline({ items }: { items: ReportData["timeline"] }) {
  return (
    <ol className="relative ml-2 border-l border-line-strong">
      {items.map((t, i) => (
        <li key={i} className="relative pb-5 pl-6 last:pb-0">
          <span
            className="absolute -left-[6px] top-1 size-[11px] rounded-full bg-chart-mark ring-2 ring-card"
            aria-hidden
          />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <time className="text-[12px] font-semibold tabular-nums text-accent-ink">{formatDate(t.date)}</time>
            <span className="rounded-full border border-line bg-canvas-subtle px-2 py-px text-[10.5px] font-medium text-muted">
              {t.category}
            </span>
          </div>
          <p className="mt-1 text-[14px] font-semibold leading-snug text-ink">{t.title}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">{t.whyItMatters}</p>
        </li>
      ))}
    </ol>
  );
}

function formatDate(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return d;
  const month = new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleString("en-GB", { month: "short" });
  return m[3] ? `${Number(m[3])} ${month} ${m[1]}` : `${month} ${m[1]}`;
}

/* ---------------------------------------------------------------------- */

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ž]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function Personas({ items }: { items: ReportData["keyPersonas"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((p, i) => (
        <article key={i} className="print-avoid-break flex flex-col rounded-card border border-line p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-wash font-display text-[15px] font-semibold text-accent-ink">
              {initials(p.name)}
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-tight text-ink">{p.name}</h3>
              <p className="text-[12.5px] leading-snug text-muted">
                {p.role}
                {p.inRoleSince && <> · since {p.inRoleSince}</>}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-snug text-ink">{p.background}</p>
          {p.focusAreas.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {p.focusAreas.map((f) => (
                <li key={f} className="rounded-full border border-line bg-canvas-subtle px-2 py-0.5 text-[11px] text-ink">
                  {f}
                </li>
              ))}
            </ul>
          )}
          {p.publicStance && (
            <blockquote className="mt-3 border-l-2 border-accent pl-3 text-[12.5px] italic leading-snug text-muted">
              {p.publicStance}
            </blockquote>
          )}
          <div className="mt-auto space-y-2 pt-4">
            <p className="text-[12.5px] leading-snug text-ink">
              <span className="font-semibold">Why they matter: </span>
              {p.whyTheyMatter}
            </p>
            <p className="flex gap-1.5 rounded-lg bg-canvas-subtle p-2.5 text-[12.5px] leading-snug text-ink">
              <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-accent-ink" aria-hidden />
              <span>
                <span className="font-semibold">Approach: </span>
                {p.approach}
              </span>
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function CultureColumns({ c }: { c: ReportData["culture"] }) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      <div className="md:col-span-1">
        <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink">
          <CheckCircle2 className="size-4 text-accent-ink" aria-hidden /> Thrives
        </h3>
        <ul className="space-y-2.5">
          {c.thrives.map((t, i) => (
            <li key={i} className="text-[13.5px] leading-snug">
              <span className="font-semibold text-ink">{t.behavior}</span>
              <span className="mt-0.5 block text-[12.5px] text-muted">{t.evidence}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink">
          <CircleMinus className="size-4 text-warn" aria-hidden /> Struggles
        </h3>
        <ul className="space-y-2.5">
          {c.struggles.map((t, i) => (
            <li key={i} className="text-[13.5px] leading-snug text-ink">
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink">
          <Info className="size-4 text-draft" aria-hidden /> A new hire could add
        </h3>
        <ul className="space-y-2.5">
          {c.cultureAdd.map((t, i) => (
            <li key={i} className="text-[13.5px] leading-snug text-ink">
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Six spectrum rows: a hairline track, 5 ticks, one dot. Value + confidence as text. */
function CultureDNA({ dims }: { dims: ReportData["culture"]["dimensions"] }) {
  return (
    <>
      <ul className="space-y-5">
        {dims.map((d) => {
          const def = DIMENSIONS.find((x) => x.id === d.id)!;
          const pct = ((d.position - 1) / 4) * 100;
          return (
            <li key={d.id}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink">{def.label}</span>
                <span className="text-[11.5px] text-muted">
                  <span className="font-semibold tabular-nums text-ink">{d.position}</span>/5 ·{" "}
                  {d.confidence} confidence
                </span>
              </div>
              <div className="relative mt-2.5 h-4" aria-hidden>
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
                {[0, 25, 50, 75, 100].map((t) => (
                  <span
                    key={t}
                    className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-line-strong"
                    style={{ left: `${t}%` }}
                  />
                ))}
                <span
                  className={cn(
                    "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                    d.confidence === "low" ? "border-2 border-chart-mark bg-card" : "bg-chart-mark"
                  )}
                  style={{ left: `${pct}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted">
                <span>{def.left}</span>
                <span>{def.right}</span>
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-muted">{d.meaning}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 flex items-center gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-full bg-chart-mark" aria-hidden /> medium / high confidence
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-full border-2 border-chart-mark" aria-hidden /> low confidence
        </span>
      </p>
      <table className="sr-only">
        <caption>Culture dimensions</caption>
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Position (1–5)</th>
            <th>Confidence</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {dims.map((d) => {
            const def = DIMENSIONS.find((x) => x.id === d.id)!;
            return (
              <tr key={d.id}>
                <td>{`${def.label}: ${def.left} (1) to ${def.right} (5)`}</td>
                <td>{d.position}</td>
                <td>{d.confidence}</td>
                <td>{d.meaning}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/* ---------------------------------------------------------------------- */

function sentimentSubtitle(s: ReportData["employeeSentiment"]) {
  if (!s.available) return "No employee-review data found";
  return [s.source, s.period].filter(Boolean).join(" · ");
}

function Sentiment({ s }: { s: ReportData["employeeSentiment"] }) {
  if (!s.available) {
    return (
      <p className="text-[13px] leading-relaxed text-muted">
        No public employee-review data was found, so the culture read relies on how the company presents
        itself. Upload a Glassdoor export in step 2 to add employee voice.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        {s.overallRating !== null && (
          <div className="min-w-[110px] rounded-lg bg-canvas-subtle p-3">
            <p className="text-[11.5px] text-muted">Overall rating</p>
            <p className="text-[26px] font-semibold leading-tight text-ink">
              {s.overallRating}
              <span className="text-[14px] font-normal text-muted"> / 5</span>
            </p>
          </div>
        )}
        {s.ceoApprovalPct !== null && <PctMeter label="CEO approval" value={s.ceoApprovalPct} />}
        {s.recommendPct !== null && <PctMeter label="Recommend to a friend" value={s.recommendPct} />}
      </div>

      {s.categoryRatings.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-semibold text-ink">Category ratings (out of 5)</p>
          <ul className="space-y-2">
            {[...s.categoryRatings]
              .sort((a, b) => b.score - a.score)
              .map((c) => (
                <li key={c.label} className="group grid grid-cols-[minmax(0,9.5rem)_1fr] items-center gap-3">
                  <span className="truncate text-[12.5px] text-ink" title={c.label}>
                    {c.label}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="relative h-3 flex-1 rounded-r bg-chart-track" aria-hidden>
                      <span
                        className="absolute inset-y-0 left-0 rounded-r-[4px] bg-chart-mark transition-opacity group-hover:opacity-80"
                        style={{ width: `${(c.score / 5) * 100}%` }}
                      />
                    </span>
                    <span className="w-7 text-right text-[12px] font-semibold tabular-nums text-ink">{c.score}</span>
                  </span>
                </li>
              ))}
          </ul>
          <table className="sr-only">
            <caption>Employee category ratings out of 5</caption>
            <tbody>
              {s.categoryRatings.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td>{c.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {s.trend && <p className="text-[12.5px] text-muted">Trend: {s.trend}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <ThemeList title="What employees value" items={s.positiveThemes} icon="plus" />
        <ThemeList title="What employees criticize" items={s.negativeThemes} icon="minus" />
      </div>
    </div>
  );
}

function PctMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[150px] flex-1 rounded-lg bg-canvas-subtle p-3">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className="text-[26px] font-semibold leading-tight text-ink">{Math.round(value)}%</p>
      <div className="mt-1.5 h-1.5 rounded-full bg-chart-track" aria-hidden>
        <div className="h-full rounded-full bg-chart-mark" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ThemeList({ title, items, icon }: { title: string; items: string[]; icon: "plus" | "minus" }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-semibold text-ink">{title}</p>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-ink">
            <span className={cn("font-semibold", icon === "plus" ? "text-accent-ink" : "text-warn")} aria-hidden>
              {icon === "plus" ? "+" : "−"}
            </span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function SayVsDo({ items }: { items: ReportData["sayVsDo"] }) {
  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-2 gap-3 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted md:grid">
        <span>They say</span>
        <span>The evidence shows</span>
      </div>
      {items.map((x, i) => (
        <div key={i} className="print-avoid-break rounded-lg border border-line">
          <div className="grid md:grid-cols-2">
            <p className="p-3 text-[13.5px] leading-snug text-ink md:border-r md:border-line">
              <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted md:hidden">
                They say
              </span>
              “{x.says}”
            </p>
            <p className="border-t border-line p-3 text-[13.5px] leading-snug text-ink md:border-t-0">
              <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted md:hidden">
                The evidence shows
              </span>
              {x.does}
            </p>
          </div>
          <p className="flex gap-1.5 border-t border-line bg-canvas-subtle px-3 py-2 text-[12.5px] leading-snug text-muted">
            <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {x.implication}
          </p>
        </div>
      ))}
    </div>
  );
}

const SEVERITY = {
  high: { label: "High", cls: "border-danger/40 bg-danger-wash text-danger" },
  medium: { label: "Medium", cls: "border-warn/40 bg-warn-wash text-warn" },
  low: { label: "Low", cls: "border-line bg-canvas-subtle text-muted" },
} as const;

function Risks({ items }: { items: ReportData["risks"] }) {
  const order = { high: 0, medium: 1, low: 2 };
  return (
    <ul className="space-y-3">
      {[...items]
        .sort((a, b) => order[a.severity] - order[b.severity])
        .map((x, i) => (
          <li key={i} className="flex gap-3">
            <span
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold",
                SEVERITY[x.severity].cls
              )}
            >
              <AlertTriangle className="size-3" aria-hidden />
              {SEVERITY[x.severity].label}
            </span>
            <p className="text-[13.5px] leading-snug text-ink">
              <span className="font-semibold">{x.risk}.</span> <span className="text-muted">{x.detail}</span>
            </p>
          </li>
        ))}
    </ul>
  );
}

function Opportunities({ items }: { items: ReportData["opportunities"] }) {
  return (
    <ul className="space-y-3">
      {items.map((x, i) => (
        <li key={i} className="rounded-lg border border-accent/40 bg-accent-wash/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-ink">{x.area}</p>
          <p className="mt-1 text-[14px] font-semibold leading-snug text-ink">{x.angle}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{x.detail}</p>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------- */

const COVERAGE: Record<Coverage, { label: string; icon: React.ReactNode; cls: string }> = {
  full: { label: "Full", icon: <CheckCircle2 className="size-3.5" aria-hidden />, cls: "text-ink" },
  partial: { label: "Partial", icon: <CircleMinus className="size-3.5" aria-hidden />, cls: "text-ink" },
  thin: { label: "Thin", icon: <AlertTriangle className="size-3.5" aria-hidden />, cls: "text-warn" },
  "not researched": { label: "Not researched", icon: <CircleDashed className="size-3.5" aria-hidden />, cls: "text-muted" },
};

function CoverageStrip({ r }: { r: ReportData }) {
  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {r.coverage.map((c) => {
          const v = COVERAGE[c.level] ?? COVERAGE["not researched"];
          return (
            <li key={c.area} className="rounded-lg border border-line p-2.5">
              <p className="text-[12px] leading-tight text-muted">{c.area}</p>
              <p className={cn("mt-1 flex items-center gap-1 text-[12.5px] font-semibold", v.cls)}>
                {v.icon}
                {v.label}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-[13px] leading-relaxed text-muted">{r.confidenceNote}</p>
    </div>
  );
}
