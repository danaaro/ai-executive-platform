import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (client) return client;

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local, add your key, and restart `npm run dev`."
    );
  }

  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const DEFAULT_MODEL = "claude-sonnet-5";

/**
 * Prompt-cache marker for the interview agents. 1-hour TTL, not the 5-minute
 * default: hiring managers often take longer than 5 minutes to answer, and an
 * expired entry means re-paying for the whole prompt + conversation. Used on
 * the system-prompt breakpoint AND as the request-level (automatic) marker
 * that caches the growing conversation — both must share this TTL, because
 * a longer-TTL entry may not follow a shorter one.
 */
export const INTERVIEW_CACHE = { type: "ephemeral", ttl: "1h" } as const;

/**
 * One log line per model call with token counts only — never prompt text —
 * so the cache hit rate is visible in Vercel logs.
 */
export function logCacheUsage(
  label: string,
  usage: {
    input_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  }
): void {
  const read = usage.cache_read_input_tokens ?? 0;
  const written = usage.cache_creation_input_tokens ?? 0;
  const total = usage.input_tokens + read + written;
  const hit = total ? Math.round((read / total) * 100) : 0;
  console.info(
    `[cache] ${label} input=${total} read=${read} written=${written} uncached=${usage.input_tokens} hit=${hit}%`
  );
}
