"use client";

import { coverageSummary, type CoverageSection } from "./use-intake-session";
import { cn } from "@/lib/utils";

/**
 * The shared progress panel (#3a) — the load-bearing idea of the intake
 * screen: one meter, fed by all four methods, never reset by switching.
 *
 * Two deliberate deviations from the wireframe:
 *  - it renders 20 segments, not the mocked 9: that is the real section count
 *    of Susan's Job Discovery Questionnaire.
 *  - the caption states the shared-progress guarantee instead of attributing
 *    sections to methods ("2 from upload, 3 from voice"). Per-method
 *    provenance is deferred — `messages` carries no source column — and a
 *    caption we can't compute honestly is worse than one that explains the
 *    rule.
 */
export function IntakeProgressPanel({
  coverage,
  loading,
}: {
  coverage: CoverageSection[] | null;
  loading?: boolean;
}) {
  const { covered, partial, total, fraction } = coverageSummary(coverage);
  const answered = covered + (partial > 0 ? partial * 0.5 : 0);
  // Completeness ring (Exec10X mockup): gold while filling, green when done.
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const R = 22;
  const C = 2 * Math.PI * R;
  void fraction;

  return (
    <div className="border-b border-line bg-canvas-subtle px-5 py-4">
      <div className="flex items-center gap-4">
        <div className="relative size-14 shrink-0">
          <svg viewBox="0 0 56 56" className="size-full -rotate-90" aria-hidden>
            <circle cx="28" cy="28" r={R} fill="none" stroke="var(--elevated)" strokeWidth="4" />
            <circle
              cx="28"
              cy="28"
              r={R}
              fill="none"
              stroke={pct >= 100 ? "var(--success)" : "var(--accent)"}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct / 100)}
              style={{ transition: "stroke-dashoffset .6s ease" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-base text-ink">
            {pct}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="label-mono">Brief progress</p>
          <p className="mt-1 font-display text-lg text-ink">
            {total ? `${formatCount(answered)} of ${total} sections` : "Getting started"}
          </p>
        </div>
      </div>

      <div
        className="mt-3 flex gap-[3px]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total || 20}
        aria-valuenow={Math.round(answered)}
        aria-label="Questionnaire sections answered"
      >
        {(coverage ?? Array.from({ length: 20 }, () => null)).map((section, i) => (
          <span
            key={section?.id ?? i}
            title={section ? `${section.id}. ${section.name} — ${section.status}` : undefined}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              section?.status === "covered" && "bg-accent",
              section?.status === "partial" && "bg-accent/45",
              (!section || section.status === "missing") && "bg-elevated"
            )}
          />
        ))}
      </div>

      <p className="mt-2 text-xs leading-snug text-muted">
        {loading && !coverage
          ? "Scoring the conversation…"
          : total === 0
            ? "Answer by voice, dictation, typing or document upload — every method fills the same questionnaire."
            : `${covered} covered${partial ? `, ${partial} partial` : ""}, ${
                total - covered - partial
              } still open. Any method can fill the rest; switching never resets your progress.`}
      </p>
    </div>
  );
}

function formatCount(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
