/**
 * Approximate AI cost of Company Intel runs (2026-09-26).
 *
 * Anthropic LIST prices, per million tokens, as of 2026-09. Update this table
 * if pricing changes; every cost shown in the app flows from here. Since
 * 2026-10-18 runs record their cache reads/writes and are priced with them
 * (reads ~0.1x, 5-minute writes 1.25x); older rows have no split and are
 * priced at the full input rate, so their figures read ~40% high.
 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
const CACHE_WRITE_MULTIPLIER = 1.25;
const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches; web fetch is not metered

/** The usage shape every Company Intel step records. */
export type RunUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearches?: number;
  webFetches?: number;
  ms?: number;
  /** Part of inputTokens served from / written to the prompt cache. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export function usageCost(u: RunUsage | null | undefined): number {
  if (!u || typeof u.inputTokens !== "number") return 0;
  const p = PRICES[u.model] ?? PRICES["claude-sonnet-5"];
  const read = u.cacheReadTokens ?? 0;
  const write = u.cacheWriteTokens ?? 0;
  const uncached = u.inputTokens - read - write;
  const input = uncached * p.input + write * p.input * CACHE_WRITE_MULTIPLIER + read * p.cacheRead;
  return (input + u.outputTokens * p.output) / 1e6 + (u.webSearches ?? 0) * WEB_SEARCH_USD;
}

export function formatUsd(n: number): string {
  return n < 0.995 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 10 ? 2 : 0)}`;
}

/**
 * Pre-run estimate, from measured averages (Aviv Group / VLU, 2026-09-26):
 * a research module ≈ $0.34–0.97 (mean ≈ $0.70), writing the report ≈ $0.37,
 * the photo step $0–0.53 (free when the official team page has everyone; web search only
 * for people it misses). Reused (fresh) modules cost nothing.
 */
export function estimateRunCost(modulesToRun: number, writers: number, findPhotos: boolean): number {
  // v2 (ADR-009 §17): each category writer ≈ $0.40, the overview ≈ $0.15.
  return modulesToRun * 0.7 + (writers > 0 ? writers * 0.4 + 0.15 : 0) + (findPhotos ? 0.25 : 0);
}

/**
 * v3 (ADR-009 §18): research areas the user ticked (or never researched) at
 * ≈ $0.70 each, plus the writers still to run. Writers are Sonnet 5.5 (Dana,
 * 2026-10-10: Opus was too slow for the 300s limit). Provisional per-writer
 * figure: ~70k tokens in ($0.14) + ~15k out ($0.15). Re-measure after live runs.
 */
export const COCKPIT_WRITER_USD = 0.3;
export function estimateCockpitCost(modulesToRun: number, writersToRun = 4): number {
  return modulesToRun * 0.7 + writersToRun * COCKPIT_WRITER_USD;
}
