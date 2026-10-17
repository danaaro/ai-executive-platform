import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Server-only Drizzle client over Supabase's transaction pooler (ADR-006).
 * `prepare: false` is required with transaction-mode pooling (PgBouncer).
 * Lazy singleton so builds without DATABASE_URL don't crash at import time.
 *
 * Three entry points (ADR-010 §6–7):
 *
 *  - `withTenant(companyId, fn)` — the ONLY way to reach customer data. Runs
 *    `fn` in a short transaction that switches to the restricted `app_user`
 *    role and records the session's company in `app.company_id`. Postgres
 *    row-level security then hides every row of any other company, whatever
 *    the code inside asks for. `companyId = null` sees nothing.
 *  - `db()` — the current tenant transaction. Called outside `withTenant` it
 *    THROWS: a customer query that forgot its scope fails loudly instead of
 *    silently reading across companies.
 *  - `adminDb()` — the unrestricted owner connection, for the admin-only
 *    Company Intel tool and for the few system lookups that must run before a
 *    company is known (session → company, signed voice grant → company). Every
 *    use is a deliberate, greppable exception.
 *
 * Keep transactions short: never hold one across a model call or a stream —
 * each persistence step opens its own.
 */

type Db = ReturnType<typeof make>;

let _db: Db | null = null;

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

function connection(): Db {
  if (!_db) _db = make();
  return _db;
}

/** Unrestricted owner connection. Admin tools and pre-tenant system lookups only. */
export function adminDb(): Db {
  return connection();
}

type Scope = { tx: Db; companyId: string | null };
const scope = new AsyncLocalStorage<Scope>();

/** The current tenant transaction. Throws outside `withTenant` (fail closed). */
export function db(): Db {
  const s = scope.getStore();
  if (!s) {
    throw new Error(
      "Customer data accessed outside withTenant() — wrap the call in withTenant(user.companyId, …) (ADR-010)."
    );
  }
  return s.tx;
}

/** The company of the current tenant scope, if any. */
export function currentTenant(): string | null | undefined {
  return scope.getStore()?.companyId;
}

/**
 * Runs `fn` as `app_user` with `app.company_id` set, in one transaction.
 * Nested calls for the same company reuse the open transaction; a nested call
 * for a DIFFERENT company is a bug and throws.
 */
export async function withTenant<T>(companyId: string | null, fn: () => Promise<T>): Promise<T> {
  const outer = scope.getStore();
  if (outer) {
    if (outer.companyId !== companyId) {
      throw new Error("withTenant() nested across two companies (ADR-010).");
    }
    return fn();
  }
  return connection().transaction(async (tx) => {
    // One round trip for both settings (each trip to the database costs tens
    // of milliseconds). set_config('role', …, true) is SET LOCAL ROLE.
    await tx.execute(
      sql`SELECT set_config('role', 'app_user', true), set_config('app.company_id', ${companyId ?? ""}, true)`
    );
    return scope.run({ tx: tx as unknown as Db, companyId }, fn);
  });
}

export * as tables from "./schema";
