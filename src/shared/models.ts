/**
 * Which Claude model each feature uses — the single place to look and change.
 * Rationale and costs: docs/models.md (Dana, 2026-10-29: "the right model for
 * every part, never the heaviest where it isn't needed").
 *
 * List prices per million tokens (input / output), 2026-10:
 *   Haiku 5.5 $0.10 / $0.50 · Sonnet 5 and Sonnet 5.5 $2 / $10 ·
 *   Opus 5.5 $4 / $20 · Fable 5.1 $10 / $50 (not used: no task here needs it).
 *
 * Sonnet 5.5 rejects `thinking: {type: "disabled"}`; its "thinking off" is
 * `{type: "between_tools"}` (effort high or below, no other field) — use
 * THINKING_OFF below, never a literal. Opus 5.5 cannot turn thinking off at all.
 */
export const MODELS = {
  /** JD briefing turns, text and voice. Fast, warm, cached; one prompt cache for both channels. */
  INTERVIEW: "claude-sonnet-5-5", // Dana 2026-10-30: prefer Sonnet 5.5 (same price as 5)
  /** The other step agents (competencies, panel, kit…) — same tier as the interview. */
  STEP_AGENTS: "claude-sonnet-5-5",
  /** Writing the candidate-facing JD from the answers + company context. Once per role (+ revisions): quality matters most here. */
  JD_WRITER: "claude-opus-5-5",
  /** Progress meter fallback (section coverage from a transcript). High volume, simple judgment. */
  METER: "claude-haiku-5-5",
  /** Reserved: a model check for security flags, if keyword rules + the agent's own replies ever miss too much (today: no model). */
  GUARD: "claude-haiku-5-5",
  /** Company Intel research modules (web search). High volume reading. */
  INTEL_RESEARCH: "claude-sonnet-5",
  /** Company Intel v3 cockpit writers (Dana 2026-10-10: Opus was too slow for the 300s limit). */
  INTEL_WRITER: "claude-sonnet-5-5",
  /** Company Intel v1/v2 synthesis (legacy path, kept for old reports). */
  INTEL_SYNTHESIS: "claude-opus-5-5",
  /** Matching executive photos and logos on official sites. */
  INTEL_PHOTOS: "claude-sonnet-5",
} as const;

export type ModelRole = keyof typeof MODELS;

/**
 * Fast replies with no extended thinking on Sonnet 5.5 (INTERVIEW, STEP_AGENTS).
 * The pinned SDK (0.111) predates `between_tools` in its types, so it is cast;
 * the API accepts it. Never send it to another model — it is a 400 there.
 */
export const THINKING_OFF = { type: "between_tools" } as unknown as { type: "disabled" };
