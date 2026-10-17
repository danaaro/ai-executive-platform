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
 * ADR-011 — role credits ledger + locked role facts.
 *
 *   npm run migrate:credits            # dry run: prints the plan, changes nothing
 *   npm run migrate:credits -- --apply # does it, in one transaction
 *
 * Additive only: one new table, new nullable/defaulted columns on `projects`.
 * No row is changed or deleted. Run `npm run secure:tenancy -- --apply` after
 * it — that script holds every row-level-security policy, including the
 * ledger's. Idempotent.
 */

const apply = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  console.log(apply ? "APPLYING (one transaction)\n" : "DRY RUN — nothing will change. Re-run with --apply.\n");

  await sql.begin(async (tx) => {
    const run = async (stmt: string) => {
      console.log("  " + stmt.replace(/\s+/g, " ").trim());
      if (apply) await tx.unsafe(stmt);
    };

    const ready = await tx`select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'projects' and column_name = 'company_id'`;
    if (ready.length === 0) {
      const msg = "projects.company_id does not exist — run migrate:customer-accounts first (ADR-010).";
      if (apply) throw new Error(msg);
      console.log(`! ${msg}\n`);
    }

    console.log("1. Credit ledger");
    await run(`
      CREATE TABLE IF NOT EXISTS credit_ledger (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id     uuid NOT NULL REFERENCES companies(id),
        kind           text NOT NULL CHECK (kind IN ('grant', 'spend', 'adjustment')),
        delta          integer NOT NULL,
        price_amount   integer,
        price_currency text,
        contract_ref   text,
        note           text,
        project_id     uuid REFERENCES projects(id),
        created_by     text NOT NULL REFERENCES users(id),
        created_at     timestamptz NOT NULL DEFAULT now(),
        CHECK (kind <> 'spend' OR delta = -1),
        CHECK (kind <> 'grant' OR delta > 0)
      )`);
    await run(`CREATE INDEX IF NOT EXISTS credit_ledger_company_idx ON credit_ledger (company_id, created_at)`);
    // Never exists, even briefly, with Supabase's default public grants.
    await run(`ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY`);
    await run(`REVOKE ALL ON TABLE credit_ledger FROM anon, authenticated`);

    console.log("2. Locked role facts on projects");
    await run(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS salary_min integer`);
    await run(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS salary_max integer`);
    await run(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS salary_currency text`);
    await run(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS show_salary_on_jd boolean NOT NULL DEFAULT false`);
    await run(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS hiring_manager_user_id text REFERENCES users(id)`);
    await run(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS hiring_manager_email text`);

    if (!apply) throw new DryRunDone();
  }).catch((err) => {
    if (!(err instanceof DryRunDone)) throw err;
  });

  console.log(apply ? "\nDone. Now run: npm run secure:tenancy -- --apply" : "\nDry run complete. No changes were made.");
}

class DryRunDone extends Error {}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
