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

  return (
    <div className="border-b border-line bg-canvas-subtle px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
          Intake progress · shared across methods
        </span>
        <span className="font-display text-[13px] font-semibold text-ink">
          {total ? `${formatCount(answered)} / ${total}` : "—"}
        </span>
      </div>

      <div
        className="mt-2 flex gap-[3px]"
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
              (!section || section.status === "missing") && "bg-line-strong/60"
            )}
          />
        ))}
      </div>

      <p className="mt-2 text-[11.5px] leading-snug text-muted">
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
