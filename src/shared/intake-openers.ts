/**
 * The opening user turns that start an agent thread.
 *
 * These strings are a CONTRACT, not copy. `INTAKE_START` in particular is the
 * documented trigger phrase the JD agent's prompt responds to, it is the first
 * turn the voice adapter unshifts so a spoken session opens identically to a
 * typed one, it is filtered out of the rendered transcript so the user never
 * sees the platform talking to itself, and it is the first turn of the golden
 * eval case. Four places, and they only work while all four agree.
 *
 * Until now each of those places had its own literal (agents/page.tsx,
 * StageDrawer.tsx, voice-llm/handler.ts, evals/cases/cases.json). Nothing
 * enforced the agreement, and the intake resequencing is about to change how a
 * session opens — which is exactly the change that would have silently broken
 * one copy and left the meter, the transcript filter or the eval reading a turn
 * nobody else sends.
 *
 * The eval fixture necessarily keeps its own copy (JSON cannot import), so it
 * is asserted against this module by `npm run test:intake`.
 */

/** Opens a Job Description intake. The JD prompt keys its Phase-1 opening to this. */
export const INTAKE_START = "Start the NEW JOB intake session.";

/** Opens a downstream stage that inherits approved upstream artifacts. */
export const STAGE_START_INHERITED =
  "Here are the approved upstream artifacts for this role. Please begin.";

/** Opens a downstream stage with nothing upstream to inherit. */
export const STAGE_START_BARE = "Please begin. Ask me for whatever input you need.";

/** Every synthetic opener, for transcript filtering — the user typed none of them. */
export const SYNTHETIC_OPENERS: readonly string[] = [
  INTAKE_START,
  STAGE_START_INHERITED,
  STAGE_START_BARE,
];

export function isSyntheticOpener(text: string): boolean {
  return SYNTHETIC_OPENERS.includes(text.trim());
}
