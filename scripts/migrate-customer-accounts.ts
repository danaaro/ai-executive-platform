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
 * ADR-010 §1, §5, §8 — the customer `companies` table and a `company_id` on
 * every customer table.
 *
 *   npm run migrate:customer-accounts                                   # dry run
 *   npm run migrate:customer-accounts -- --apply --home-org=org_…       # does it
 *
 * `--home-org` is the Clerk Organization id of SusanDana in the environment
 * being migrated (Development and Production have different ids). Every
 * existing user is placed in that company.
 *
 * Order matters and is enforced:
 *  - The Company Intel tables must already be renamed (migrate-intel-rename),
 *    because this creates the new `companies`.
 *  - The old JD test data is DELETED (Dana, 2026-10-17; backup in
 *    _archive/db-backup-2026-10-17). This happens ONLY on the first run — if
 *    `projects.company_id` already exists the delete is skipped, so a re-run
 *    can never wipe real customer data. Company Intel is not touched.
 *  - `company_id` is added NOT NULL to tables that are empty at that moment.
 *
 * One transaction: either everything happens or nothing does.
 */

const CUSTOMER_TABLES = [
  // Deletion order = children before parents.
  "artifact_approvals",
  "artifacts",
  "intake_answers",
  "messages",
  "conversations",
  "project_members",
  "projects",
] as const;

const apply = process.argv.includes("--apply");
const homeOrg = process.argv.find((a) => a.startsWith("--home-org="))?.split("=")[1] ?? null;
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function exists(tx: postgres.TransactionSql, table: string, column?: string) {
  const rows = column
    ? await tx`select 1 from information_schema.columns
               where table_schema = 'public' and table_name = ${table} and column_name = ${column}`
    : await tx`select 1 from pg_tables where schemaname = 'public' and tablename = ${table}`;
  return rows.length > 0;
}

async function main() {
  if (apply && !homeOrg?.startsWith("org_")) {
    throw new Error("--apply needs --home-org=<SusanDana's Clerk organization id, starting org_>");
  }
  console.log(apply ? "APPLYING (one transaction)\n" : "DRY RUN — nothing will change.\n");

  await sql.begin(async (tx) => {
    const run = async (stmt: string, params: (string | null)[] = []) => {
      console.log("  " + stmt.replace(/\s+/g, " ").trim() + (params.length ? `   -- ${JSON.stringify(params)}` : ""));
      if (apply) await tx.unsafe(stmt, params);
    };

    // 0. Preconditions
    const intelRenamed = await exists(tx, "intel_companies");
    const oldIntelName = (await exists(tx, "companies")) && !(await exists(tx, "companies", "clerk_org_id"));
    if (!intelRenamed || oldIntelName) {
      const msg = "Company Intel tables are not renamed yet — run `npm run migrate:intel-rename -- --apply` first.";
      if (apply) throw new Error(msg);
      console.log(`! ${msg}\n  (Dry run continues to show the rest of the plan.)\n`);
    }
    const firstRun = !(await exists(tx, "projects", "company_id"));

    // 1. Remove the JD test data — first run only.
    console.log("1. Old JD test data");
    if (firstRun) {
      for (const t of CUSTOMER_TABLES) {
        const [{ n }] = await tx`select count(*)::int as n from ${tx(t)}`;
        await run(`DELETE FROM "${t}"`);
        console.log(`     (${n} rows)`);
      }
    } else {
      console.log("  skipped — company_id already exists, so this database has already been migrated");
    }

    // 2. Customer companies
    console.log("2. Customer companies table");
    await run(`
      CREATE TABLE IF NOT EXISTS companies (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        clerk_org_id     text NOT NULL UNIQUE,
        name             text NOT NULL,
        intel_company_id uuid REFERENCES intel_companies(id) ON DELETE SET NULL,
        about            text,
        "values"         text,
        culture_notes    text,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now()
      )`);
    // Never exists, even briefly, with Supabase's default public grants.
    await run(`ALTER TABLE companies ENABLE ROW LEVEL SECURITY`);
    await run(`REVOKE ALL ON TABLE companies FROM anon, authenticated`);
    await run(
      `INSERT INTO companies (clerk_org_id, name) VALUES ($1, 'SusanDana') ON CONFLICT (clerk_org_id) DO NOTHING`,
      [homeOrg ?? "org_<home-org>"]
    );

    // 3. Users get a home company (nullable: a brand-new sign-in is synced
    //    before it is known which organization they belong to).
    console.log("3. Users → home company");
    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id)`);
    await run(
      `UPDATE users SET company_id = (SELECT id FROM companies WHERE clerk_org_id = $1) WHERE company_id IS NULL`,
      [homeOrg ?? "org_<home-org>"]
    );
    await run(`CREATE INDEX IF NOT EXISTS users_company_idx ON users (company_id)`);

    // 4. company_id on every customer table (empty now, so NOT NULL is safe)
    console.log("4. company_id on customer tables");
    for (const t of [...CUSTOMER_TABLES].reverse()) {
      await run(`ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS company_id uuid NOT NULL REFERENCES companies(id)`);
      await run(`CREATE INDEX IF NOT EXISTS "${t}_company_idx" ON "${t}" (company_id)`);
    }

    if (!apply) throw new DryRunDone();
  }).catch((err) => {
    if (!(err instanceof DryRunDone)) throw err;
  });

  console.log(apply ? "\nDone." : "\nDry run complete. No changes were made.");
}

class DryRunDone extends Error {}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
