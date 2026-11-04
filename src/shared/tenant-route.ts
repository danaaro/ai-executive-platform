import { withTenant } from "@/db";
import { dbEnabled, requireUser } from "@/shared/current-user";
import { logActingWrite } from "@/shared/acting-audit";

/**
 * Runs a whole (short, non-streaming) route handler inside the signed-in
 * user's tenant scope (ADR-010), so every `db()` call in it is filtered by
 * row-level security to that user's company. Signed out or no company → the
 * scope is empty and the database returns nothing; the handler's own
 * `requireUser()` check still answers 401.
 *
 * Not for streaming routes: a transaction must never stay open across a model
 * call. Those scope each persistence step themselves.
 */
export function tenantRoute<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    if (!dbEnabled()) return handler(...args);
    const user = await requireUser();
    if (args[0] instanceof Request) await logActingWrite(user, args[0]);
    return withTenant(user?.companyId ?? null, () => handler(...args));
  };
}
