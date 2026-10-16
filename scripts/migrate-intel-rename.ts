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
 * ADR-010 §4 — gives the Company Intelligence tables an `intel_` prefix so
 * `companies` / `company_id` can mean the paying customer everywhere.
 *
 *   npm run migrate:intel-rename            # dry run: prints the plan, changes nothing
 *   npm run migrate:intel-rename -- --apply # does it, in one transaction
 *
 * Renames only — no row is copied, changed or deleted. Per table: the table,
 * its `company_id` column (→ `intel_company_id`), and every constraint and
 * index whose name starts with the old table name. Constraints go first
 * because renaming a primary-key or unique constraint renames its index too.
 *
 * Idempotent: a table already renamed is skipped. Run it in the same window as
 * the deploy of the code that reads the new names (src/db/schema.ts) — the
 * live Company Intel tool breaks between the two otherwise.
 */

const RENAMES = [
  ["companies", "intel_companies"],
  ["company_inputs", "intel_company_inputs"],
  ["company_research", "intel_company_research"],
  ["company_outputs", "intel_company_outputs"],
] as const;

const apply = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function tableExists(tx: postgres.TransactionSql | postgres.Sql, name: string) {
  const rows = await tx`select 1 from pg_tables where schemaname = 'public' and tablename = ${name}`;
  return rows.length > 0;
}

async function main() {
  console.log(apply ? "APPLYING (one transaction)\n" : "DRY RUN — nothing will change. Re-run with --apply.\n");

  await sql.begin(async (tx) => {
    const run = async (stmt: string) => {
      console.log("  " + stmt);
      if (apply) await tx.unsafe(stmt);
    };

    for (const [from, to] of RENAMES) {
      const hasOld = await tableExists(tx, from);
      const hasNew = await tableExists(tx, to);
      if (!hasOld && hasNew) {
        console.log(`✓ ${to} — already renamed, skipped`);
        continue;
      }
      if (!hasOld) throw new Error(`Neither ${from} nor ${to} exists — refusing to guess.`);
      if (hasNew) throw new Error(`Both ${from} and ${to} exist — resolve by hand before running.`);

      const [{ count }] = await tx`select count(*)::int as count from ${tx(from)}`;
      console.log(`• ${from} → ${to} (${count} rows, kept as they are)`);

      // Names are read from the catalog BEFORE the table is renamed.
      const constraints = await tx<{ conname: string }[]>`
        select conname from pg_constraint
        where conrelid = ${"public." + from}::regclass and conname like ${from + "\\_%"}
        order by conname`;
      const hasCompanyId = await tx`
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = ${from} and column_name = 'company_id'`;

      await run(`ALTER TABLE "${from}" RENAME TO "${to}"`);
      if (hasCompanyId.length > 0) {
        await run(`ALTER TABLE "${to}" RENAME COLUMN "company_id" TO "intel_company_id"`);
      }
      for (const { conname } of constraints) {
        await run(`ALTER TABLE "${to}" RENAME CONSTRAINT "${conname}" TO "intel_${conname}"`);
      }

      // Indexes left over (not backed by a constraint). In a dry run the table
      // still has its old name and the constraint-backed ones are still listed,
      // so filter those out by name.
      const renamedByConstraint = new Set(constraints.map((c) => c.conname));
      const indexes = await tx<{ indexname: string }[]>`
        select indexname from pg_indexes
        where schemaname = 'public' and tablename = ${apply ? to : from} and indexname like ${from + "\\_%"}
        order by indexname`;
      for (const { indexname } of indexes) {
        if (renamedByConstraint.has(indexname)) continue;
        await run(`ALTER INDEX "${indexname}" RENAME TO "intel_${indexname}"`);
      }
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
