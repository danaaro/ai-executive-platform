import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Server-only Drizzle client over Supabase's transaction pooler (ADR-006).
 * `prepare: false` is required with transaction-mode pooling (PgBouncer).
 * Lazy singleton so builds without DATABASE_URL don't crash at import time.
 */

let _db: ReturnType<typeof make> | null = null;

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

export function db() {
  if (!_db) _db = make();
  return _db;
}

export * as tables from "./schema";
