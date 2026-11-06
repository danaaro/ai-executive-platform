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
  // Drizzle wraps database errors as "Failed query: <sql>\nparams: <values>":
  // the values are the user's content. Log the database's own error (its
  // `cause`) with quoted values masked, never the query or its params
  // (security review M1, 2026-11-06).
  if (err instanceof Error && (err.name === "DrizzleQueryError" || err.message.startsWith("Failed query:"))) {
    const cause = (err as Error & { cause?: unknown }).cause;
    const inner = cause instanceof Error ? errorSummary(cause) : "no cause";
    // Postgres puts offending values after ": " (and may not escape quotes in
    // them), so everything after the first ": " of the database's message goes.
    return `${err.name} → ${inner.replace(/^([^:]*:[^:]*?): [\s\S]*$/, "$1: …")}`.slice(0, 300);
  }
  if (err instanceof Error) {
    const e = err as Error & { code?: unknown; status?: unknown };
    const code = typeof e.code === "string" || typeof e.code === "number" ? ` ${e.code}` : "";
    const status = typeof e.status === "number" ? ` (status ${e.status})` : "";
    return `${e.name}${code}${status}: ${e.message}`.slice(0, 300);
  }
  return `non-Error thrown: ${typeof err}`;
}
