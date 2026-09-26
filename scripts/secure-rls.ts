import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

/**
 * Closes the PostgREST hole the Supabase Security Advisor flagged (7 × "RLS
 * Disabled in Public", 2026-08-13).
 *
 * What the advisor was actually reporting: Supabase exposes every table in
 * `public` through PostgREST, and Supabase's default grants hand `anon` and
 * `authenticated` full CRUD on them. With RLS off, anyone holding the
 * project's *publishable* anon key could read every conversation, message and
 * artifact over https://<ref>.supabase.co/rest/v1/… — and DELETE them. That is
 * a live data-exposure path, not a cosmetic lint finding.
 *
 * Why enabling RLS does not break the app (ADR-006): the runtime never uses
 * PostgREST or supabase-js. `src/db/index.ts` connects over the transaction
 * pooler as the `postgres` role, which is both the table owner and carries
 * `rolbypassrls`, so RLS is invisible to it. Authorization stays exactly where
 * ADR-008 put it — per-project membership enforced in the API layer.
 *
 * Two layers, deliberately:
 *  1. ENABLE ROW LEVEL SECURITY with ZERO policies → default-deny for
 *     anon/authenticated. This is what clears the advisor.
 *  2. REVOKE the table grants from anon/authenticated outright, and revoke
 *     them from DEFAULT PRIVILEGES too, so the next `drizzle-kit push` doesn't
 *     silently re-open the same hole on a new table.
 *
 * `service_role` is intentionally left alone: it bypasses RLS by design and
 * its key is server-secret (and unused here).
 *
 * Idempotent — safe to re-run. Run: npm run secure:rls
 */

const TABLES = [
  "users",
  "projects",
  "project_members",
  "conversations",
  "messages",
  "intake_answers",
  "artifacts",
  "artifact_approvals",
  "companies",
  "company_inputs",
  "company_research",
  "company_outputs",
] as const;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) throw new Error("DATABASE_URL is not set and .env.local is missing");
  const match = fs.readFileSync(envPath, "utf-8").match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error("DATABASE_URL not found in .env.local");
  return match[1].trim();
}

async function main() {
  const sql = postgres(databaseUrl(), { prepare: false, max: 1 });

  const [{ current_user: role }] = await sql<{ current_user: string }[]>`select current_user`;
  const [{ rolbypassrls: bypass }] = await sql<{ rolbypassrls: boolean }[]>`
    select rolbypassrls from pg_roles where rolname = current_user
  `;
  console.log(`Connected as "${role}" (bypassrls: ${bypass})`);
  if (!bypass) {
    // Without BYPASSRLS the runtime would start reading zero rows the moment
    // RLS is on — refuse rather than take the app down.
    throw new Error(
      `Refusing to enable RLS: the connecting role "${role}" does not have BYPASSRLS, ` +
        `so enabling RLS with no policies would break every query.`
    );
  }

  for (const table of TABLES) {
    await sql`ALTER TABLE ${sql(table)} ENABLE ROW LEVEL SECURITY`;
    await sql`REVOKE ALL ON TABLE ${sql(table)} FROM anon, authenticated`;
    console.log(`  ✓ ${table} — RLS enabled, anon/authenticated revoked`);
  }

  // Stop future tables from inheriting the permissive default grants.
  await sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated`;
  await sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated`;
  await sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated`;
  console.log("  ✓ default privileges revoked for anon/authenticated in schema public");

  // Verify rather than assume.
  const state = await sql<{ relname: string; rls: boolean }[]>`
    select c.relname, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1
  `;
  const leftOpen = state.filter((t) => !t.rls).map((t) => t.relname);
  const stillGranted = await sql<{ grantee: string; table_name: string }[]>`
    select distinct grantee, table_name from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
  `;

  console.log(
    `\nRLS enabled on ${state.filter((t) => t.rls).length}/${state.length} public tables.`
  );
  if (leftOpen.length) console.log(`  ⚠ still without RLS: ${leftOpen.join(", ")}`);
  if (stillGranted.length) {
    console.log(`  ⚠ anon/authenticated still granted on: ${stillGranted.map((g) => `${g.grantee}→${g.table_name}`).join(", ")}`);
  } else {
    console.log("  ✓ no anon/authenticated grants remain in schema public");
  }

  // Sanity check: the app's own access path must still work.
  const [{ count }] = await sql<{ count: string }[]>`select count(*)::text from projects`;
  console.log(`  ✓ app role still reads data (projects: ${count})`);

  await sql.end();
  const clean = leftOpen.length === 0 && stillGranted.length === 0;
  console.log(clean ? "\nDone — Security Advisor should now report 0 errors." : "\nIncomplete — see warnings above.");
  process.exit(clean ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
