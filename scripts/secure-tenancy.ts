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
 * ADR-010 §7 — the database's own wall between customer companies.
 *
 *   npm run secure:tenancy            # dry run: prints the plan, changes nothing
 *   npm run secure:tenancy -- --apply # does it, in one transaction
 *
 * Creates the restricted role `app_user` (no login, cannot bypass row-level
 * security) and a policy on every customer table: a row is visible and
 * writable only when its company_id equals the request's `app.company_id`.
 * The app enters that role per request inside `withTenant()` (src/db/index.ts)
 * with `SET LOCAL ROLE app_user`, so no new connection string or secret is
 * needed. The owner role keeps full access for migrations, scripts and the
 * admin-only Company Intel tool (no grants to app_user on intel_* tables).
 *
 * Run AFTER migrate:customer-accounts and BEFORE deploying the code that uses
 * withTenant() — that code needs the role to exist. Idempotent.
 */

const CUSTOMER_TABLES = [
  "projects",
  "project_members",
  "conversations",
  "messages",
  "intake_answers",
  "artifacts",
  "artifact_approvals",
] as const;

const apply = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  console.log(apply ? "APPLYING (one transaction)\n" : "DRY RUN — nothing will change. Re-run with --apply.\n");

  await sql.begin(async (tx) => {
    const run = async (stmt: string) => {
      console.log("  " + stmt.replace(/\s+/g, " ").trim());
      if (apply) await tx.unsafe(stmt);
    };

    const missing = await tx`select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'projects' and column_name = 'company_id'`;
    if (missing.length === 0) {
      const msg = "projects.company_id does not exist — run migrate:customer-accounts first.";
      if (apply) throw new Error(msg);
      console.log(`! ${msg}\n  (Dry run continues to show the plan.)\n`);
    }

    console.log("1. Restricted role");
    await run(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
      END IF; END $$`);
    // Lets the app's connection enter the role with SET LOCAL ROLE.
    await run(`GRANT app_user TO CURRENT_USER`);
    await run(`GRANT USAGE ON SCHEMA public TO app_user`);

    console.log("2. The request's company");
    await run(`CREATE OR REPLACE FUNCTION public.app_company() RETURNS uuid
      LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.company_id', true), '')::uuid $$`);
    await run(`REVOKE ALL ON FUNCTION public.app_company() FROM PUBLIC, anon, authenticated`);
    await run(`GRANT EXECUTE ON FUNCTION public.app_company() TO app_user`);

    console.log("3. Customer tables: own company only");
    for (const t of CUSTOMER_TABLES) {
      await run(`GRANT SELECT, INSERT, UPDATE, DELETE ON "${t}" TO app_user`);
      await run(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`);
      await run(`DROP POLICY IF EXISTS tenant_isolation ON "${t}"`);
      await run(`CREATE POLICY tenant_isolation ON "${t}" FOR ALL TO app_user
        USING (company_id = public.app_company())
        WITH CHECK (company_id = public.app_company())`);
    }

    console.log("4. Read-only: own company row, own company's users");
    await run(`GRANT SELECT ON companies TO app_user`);
    await run(`ALTER TABLE companies ENABLE ROW LEVEL SECURITY`);
    await run(`DROP POLICY IF EXISTS tenant_self ON companies`);
    await run(`CREATE POLICY tenant_self ON companies FOR SELECT TO app_user USING (id = public.app_company())`);
    await run(`GRANT SELECT ON users TO app_user`);
    await run(`ALTER TABLE users ENABLE ROW LEVEL SECURITY`);
    await run(`DROP POLICY IF EXISTS tenant_users ON users`);
    await run(`CREATE POLICY tenant_users ON users FOR SELECT TO app_user USING (company_id = public.app_company())`);

    console.log("5. Credit ledger: read own company; insert only a -1 spend (ADR-011)");
    const ledger = await tx`select 1 from pg_tables where schemaname = 'public' and tablename = 'credit_ledger'`;
    if (ledger.length === 0) {
      console.log("  (credit_ledger not created yet — run migrate:credits, then re-run this script)");
    } else {
      // SELECT + INSERT only: never UPDATE or DELETE, so history is append-only
      // for customers. Grants and adjustments are written by admins only.
      await run(`GRANT SELECT, INSERT ON credit_ledger TO app_user`);
      await run(`ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY`);
      await run(`DROP POLICY IF EXISTS ledger_read ON credit_ledger`);
      await run(`CREATE POLICY ledger_read ON credit_ledger FOR SELECT TO app_user
        USING (company_id = public.app_company())`);
      await run(`DROP POLICY IF EXISTS ledger_spend ON credit_ledger`);
      await run(`CREATE POLICY ledger_spend ON credit_ledger FOR INSERT TO app_user
        WITH CHECK (company_id = public.app_company() AND kind = 'spend' AND delta = -1)`);
    }

    console.log("6. Company documents: own company, customer-visible only (D9)");
    const docs = await tx`select 1 from pg_tables where schemaname = 'public' and tablename = 'company_documents'`;
    if (docs.length === 0) {
      console.log("  (company_documents not created yet — run migrate:company-documents, then re-run this script)");
    } else {
      await run(`GRANT SELECT, INSERT, DELETE ON company_documents TO app_user`);
      await run(`ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY`);
      await run(`DROP POLICY IF EXISTS docs_tenant ON company_documents`);
      await run(`CREATE POLICY docs_tenant ON company_documents FOR ALL TO app_user
        USING (company_id = public.app_company() AND visible_to_customer)
        WITH CHECK (company_id = public.app_company() AND visible_to_customer)`);
    }

    console.log("7. Admin activity log stays out of reach of app_user");
    const audit = await tx`select 1 from pg_tables where schemaname = 'public' and tablename = 'admin_audit'`;
    if (audit.length) await run(`REVOKE ALL ON admin_audit FROM app_user`);

    console.log("8. Company Intel stays out of reach of app_user");
    for (const t of ["intel_companies", "intel_company_inputs", "intel_company_research", "intel_company_outputs"]) {
      await run(`REVOKE ALL ON "${t}" FROM app_user`);
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
