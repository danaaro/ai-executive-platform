/**
 * What an error log line may contain (CLAUDE.md: never log prompts, keys or
 * personal data).
 *
 * Logging a raw error object is not safe here: database errors carry the
 * statement's parameters — a failed write of a hiring manager's answer prints
 * the answer — and SDK errors can carry request bodies. This keeps the error's
 * type, code and message (trimmed), which is enough to diagnose, and drops the
 * rest.
 */
export function errorSummary(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & { code?: unknown; status?: unknown };
    const code = typeof e.code === "string" || typeof e.code === "number" ? ` ${e.code}` : "";
    const status = typeof e.status === "number" ? ` (status ${e.status})` : "";
    return `${e.name}${code}${status}: ${e.message}`.slice(0, 300);
  }
  return `non-Error thrown: ${typeof err}`;
}
