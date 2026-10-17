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
 * Company documents (D9): the customer's reusable hiring material.
 *
 *   npm run migrate:company-documents            # dry run
 *   npm run migrate:company-documents -- --apply # one transaction
 *
 * Additive: one new table. RLS on; its policies (customers see and manage
 * only their own company's visible documents) live in secure-tenancy.ts —
 * run that after this. Idempotent.
 */
const apply = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  console.log(apply ? "APPLYING (one transaction)\n" : "DRY RUN — nothing will change.\n");
  await sql.begin(async (tx) => {
    const run = async (stmt: string) => {
      console.log("  " + stmt.replace(/\s+/g, " ").trim());
      if (apply) await tx.unsafe(stmt);
    };
    await run(`
      CREATE TABLE IF NOT EXISTS company_documents (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id          uuid NOT NULL REFERENCES companies(id),
        filename            text NOT NULL,
        content             text NOT NULL,
        visible_to_customer boolean NOT NULL DEFAULT true,
        uploaded_by         text NOT NULL REFERENCES users(id),
        created_at          timestamptz NOT NULL DEFAULT now()
      )`);
    await run(`CREATE INDEX IF NOT EXISTS company_documents_company_idx ON company_documents (company_id, created_at)`);
    await run(`ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY`);
    await run(`REVOKE ALL ON TABLE company_documents FROM anon, authenticated`);
    if (!apply) throw new DryRunDone();
  }).catch((err) => {
    if (!(err instanceof DryRunDone)) throw err;
  });
  console.log(apply ? "\nDone. Now run: npm run secure:tenancy -- --apply" : "\nDry run complete.");
}
class DryRunDone extends Error {}
main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
