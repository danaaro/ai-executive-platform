export type SectionStatus = {
  id: number;
  name: string;
  status: "covered" | "partial" | "missing";
};

const RANK: Record<SectionStatus["status"], number> = {
  missing: 0,
  partial: 1,
  covered: 2,
};

/**
 * Keeps the strongest status ever observed for each questionnaire section.
 *
 * The coverage scorer re-judges all 20 sections from scratch on every turn
 * with a fast model, so a section the hiring manager already answered can flip
 * covered → partial purely from model variance. Without this the meter appears
 * to LOSE progress mid-session (observed live: 7.5 → 6.5 after the user simply
 * asked the agent to continue).
 *
 * Monotonicity is the honest semantics here, not cosmetic smoothing: the
 * transcript only ever grows, so information cannot be un-said. It is also
 * exactly what the progress panel promises in words — "switching never resets
 * your progress".
 */
export function mergeCoverage(
  previous: SectionStatus[],
  scored: SectionStatus[]
): SectionStatus[] {
  const before = new Map(previous.map((s) => [s.id, s.status]));
  return scored.map((s) => {
    const old = before.get(s.id);
    if (old && RANK[old] > RANK[s.status]) return { ...s, status: old };
    return s;
  });
}
