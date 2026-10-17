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
 * Admin activity log (guardrails.md: "log every admin action").
 *
 *   npm run migrate:admin-audit            # dry run
 *   npm run migrate:admin-audit -- --apply # one transaction
 *
 * Additive: one new table. RLS on with no policies and no grants to app_user —
 * only the admin (owner) connection reads or writes it. Idempotent.
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
    await run(`
      CREATE TABLE IF NOT EXISTS admin_audit (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_user_id text NOT NULL REFERENCES users(id),
        action        text NOT NULL,
        company_id    uuid REFERENCES companies(id),
        details       jsonb,
        created_at    timestamptz NOT NULL DEFAULT now()
      )`);
    await run(`CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit (created_at)`);
    await run(`ALTER TABLE admin_audit ENABLE ROW LEVEL SECURITY`);
    await run(`REVOKE ALL ON TABLE admin_audit FROM anon, authenticated`);
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
