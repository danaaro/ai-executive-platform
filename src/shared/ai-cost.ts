/**
 * Approximate AI cost of Company Intel runs (2026-09-26).
 *
 * Anthropic LIST prices, per million tokens, as of 2026-09. Update this table
 * if pricing changes; every cost shown in the app flows from here. Input is
 * priced at the full rate (cache reads are cheaper), so figures lean slightly
 * high — deliberately: this is a budgeting signal, not an invoice.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};
const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches; web fetch is not metered

/** The usage shape every Company Intel step records. */
export type RunUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearches?: number;
  webFetches?: number;
  ms?: number;
};

export function usageCost(u: RunUsage | null | undefined): number {
  if (!u || typeof u.inputTokens !== "number") return 0;
  const p = PRICES[u.model] ?? PRICES["claude-sonnet-5"];
  return (u.inputTokens * p.input + u.outputTokens * p.output) / 1e6 + (u.webSearches ?? 0) * WEB_SEARCH_USD;
}

export function formatUsd(n: number): string {
  return n < 0.995 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 10 ? 2 : 0)}`;
}

/**
 * Pre-run estimate, from measured averages (Aviv Group / VLU, 2026-09-26):
 * a research module ≈ $0.58–0.97 (mean ≈ $0.70), writing the report ≈ $0.35,
 * the photo step ≈ $0.15. Reused (fresh) modules cost nothing.
 */
export function estimateRunCost(modulesToRun: number, writeReport: boolean, findPhotos: boolean): number {
  return modulesToRun * 0.7 + (writeReport ? 0.35 : 0) + (findPhotos ? 0.15 : 0);
}
