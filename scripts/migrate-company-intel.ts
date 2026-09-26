import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

// --- env: load .env.local the way Next.js would (KEY=VALUE lines) ---
const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

/**
 * Creates the Company Intelligence tables (ADR-009). Idempotent, additive —
 * touches no existing table.
 *
 *   npm run migrate:company-intel
 *
 * Hand-written for the same reason as migrate-intake-answers.ts: drizzle-kit
 * push would diff the whole schema against a live DB carrying RLS state it
 * doesn't know about. RLS is applied here so the tables never exist, even
 * briefly, with Supabase's default anon/authenticated grants — they will hold
 * client-confidential documents.
 */

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const TABLES = ["companies", "company_inputs", "company_research", "company_outputs"];

async function main() {
  console.log("1. Tables…");
  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug        text NOT NULL UNIQUE,
      name        text NOT NULL,
      website     text,
      created_by  text NOT NULL REFERENCES users(id),
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS company_inputs (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      filename    text NOT NULL,
      content     text NOT NULL,
      created_by  text NOT NULL REFERENCES users(id),
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS company_research (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      module           text NOT NULL,
      content          text NOT NULL,
      researched_on    date NOT NULL,
      shelf_life_days  integer NOT NULL,
      coverage         text,
      sources_count    integer,
      usage            jsonb,
      created_by       text NOT NULL REFERENCES users(id),
      created_at       timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS company_outputs (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      kind         text NOT NULL,
      version      integer NOT NULL,
      mode         text NOT NULL,
      content      text NOT NULL,
      reviewed     boolean NOT NULL DEFAULT false,
      reviewed_by  text REFERENCES users(id),
      reviewed_at  timestamptz,
      usage        jsonb,
      created_by   text NOT NULL REFERENCES users(id),
      created_at   timestamptz NOT NULL DEFAULT now()
    )
  `;
  // Structured report data for the visual page (2026-09-26).
  await sql`ALTER TABLE company_outputs ADD COLUMN IF NOT EXISTS data jsonb`;
  // Company logo for the report header (2026-09-26).
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url text`;
  console.log("   ✓ " + TABLES.join(", "));

  console.log("2. Constraints + indexes…");
  // Re-created every run so widening the vocabulary ('report', 2026-09-26)
  // applies to databases created with the older constraint.
  await sql`ALTER TABLE company_outputs DROP CONSTRAINT IF EXISTS company_outputs_kind_chk`;
  await sql`
    ALTER TABLE company_outputs ADD CONSTRAINT company_outputs_kind_chk
      CHECK (kind IN ('report','brief','culture'))
  `;
  await sql`
    DO $$ BEGIN
      ALTER TABLE company_outputs ADD CONSTRAINT company_outputs_mode_chk
        CHECK (mode IN ('full','culture-only'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `;
  await sql`CREATE INDEX IF NOT EXISTS company_inputs_company_idx ON company_inputs (company_id)`;
  await sql`
    CREATE INDEX IF NOT EXISTS company_research_company_module_idx
    ON company_research (company_id, module, created_at)
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS company_outputs_company_kind_version_uq
    ON company_outputs (company_id, kind, version)
  `;
  console.log("   ✓ checks, indexes");

  console.log("3. RLS…");
  const [{ rolbypassrls: bypass }] = await sql<{ rolbypassrls: boolean }[]>`
    select rolbypassrls from pg_roles where rolname = current_user
  `;
  if (!bypass) {
    console.error(
      "   ✗ connecting role lacks BYPASSRLS — enabling RLS with no policies would " +
        "make the tables unreadable to the app. Not enabling. Run npm run secure:rls " +
        "from a role that has it."
    );
    await sql.end();
    process.exit(1);
  }
  for (const t of TABLES) {
    await sql.unsafe(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    await sql.unsafe(`REVOKE ALL ON TABLE ${t} FROM anon, authenticated`);
  }
  console.log("   ✓ RLS enabled, anon/authenticated revoked on all four");

  await sql.end();
  console.log("\nMigration complete.");
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
