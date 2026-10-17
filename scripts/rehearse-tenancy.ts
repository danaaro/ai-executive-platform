import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

/**
 * Dress rehearsal of the ADR-010 switch, on a throwaway in-memory Postgres
 * (PGlite) — nothing here can reach the live database.
 *
 *   npm run rehearse:tenancy [-- <backup dir>]
 *
 *  1. Recreates the backup's database structure (schema.ts at BASE_REF).
 *  2. Loads the backup taken before the switch (default:
 *     ../_archive/db-backup-2026-10-17) — real research, real test roles.
 *  3. Runs the three switch scripts with --apply, timed, exactly as in production.
 *  4. Checks the result: research intact, JD test data gone, SusanDana in place,
 *     and a re-run can never delete customer data.
 *  5. Runs the isolation test (scripts/test-tenant-isolation.ts) on top.
 *
 * Exits non-zero on any failure.
 */

const PORT = 54329;
const URL = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
const ROOT = process.cwd();
const BACKUP = path.resolve(process.argv[2] ?? path.join(ROOT, "../_archive/db-backup-2026-10-17"));
const WORK = path.join(ROOT, "node_modules/.cache/rehearsal");
const HOME_ORG = "org_rehearsal_home";
// The database structure the backup was taken from: `main` just before the
// ADR-010 switch (2026-10-17). Override with REHEARSAL_BASE_REF if a newer
// backup is used.
const BASE_REF = process.env.REHEARSAL_BASE_REF ?? "28f6a35";

// Live-structure load order: parents before children.
const LOAD_ORDER = [
  "users",
  "companies", // still the RESEARCH table on main
  "company_inputs",
  "company_research",
  "company_outputs",
  "projects",
  "project_members",
  "conversations",
  "messages",
  "intake_answers",
  "artifacts",
  "artifact_approvals",
];

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

// Asynchronous on purpose: the database server lives in THIS process, so a
// blocking wait on the child would freeze the server the child is talking to.
async function run(label: string, args: string[]): Promise<number> {
  const t0 = Date.now();
  const status = await new Promise<number | null>((resolve) => {
    const child = spawn("npx", args, {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: URL },
      stdio: "inherit",
    });
    child.on("close", resolve);
  });
  const secs = (Date.now() - t0) / 1000;
  check(`${label} (${secs.toFixed(1)}s)`, status === 0, status === 0 ? "" : `exit ${status}`);
  return secs;
}

async function main() {
  if (!fs.existsSync(path.join(BACKUP, "_summary.json"))) throw new Error(`No backup at ${BACKUP}`);
  fs.mkdirSync(WORK, { recursive: true });

  const pg = new PGlite();
  const server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1" });
  await server.start();
  console.log(`Throwaway Postgres (PGlite) on 127.0.0.1:${PORT}\n`);

  try {
    // Supabase's roles, so the scripts' REVOKE statements behave as on Supabase.
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;`);

    console.log(`1 · The backup's database structure (from ${BASE_REF})`);
    // Generated OFFLINE as SQL (drizzle-kit generate needs no database), then
    // executed here — `drizzle-kit push` cannot introspect through the socket.
    const mainSchema = path.join(WORK, "schema-main.ts");
    const sqlDir = path.join(WORK, "sql-main");
    fs.rmSync(sqlDir, { recursive: true, force: true });
    fs.writeFileSync(mainSchema, execFileSync("git", ["show", `${BASE_REF}:src/db/schema.ts`], { cwd: ROOT }));
    execFileSync("npx", ["drizzle-kit", "generate", "--dialect=postgresql", `--schema=${mainSchema}`, `--out=${sqlDir}`], {
      cwd: ROOT,
      stdio: "pipe",
    });
    const sqlFile = fs.readdirSync(sqlDir).find((f) => f.endsWith(".sql"));
    if (!sqlFile) throw new Error("drizzle-kit generate produced no SQL");
    for (const stmt of fs.readFileSync(path.join(sqlDir, sqlFile), "utf-8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
    check(`structure created from ${BASE_REF}'s schema`, true);

    console.log("\n2 · Load the backup");
    const summary = JSON.parse(fs.readFileSync(path.join(BACKUP, "_summary.json"), "utf-8")).rows as Record<string, number>;
    for (const t of LOAD_ORDER) {
      const rows = JSON.parse(fs.readFileSync(path.join(BACKUP, `${t}.json`), "utf-8"));
      if (rows.length) {
        await pg.query(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`, [JSON.stringify(rows)]);
      }
      const { rows: [{ n }] } = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}"`);
      check(`${t}: ${n} rows`, n === summary[t], n === summary[t] ? "" : `expected ${summary[t]}`);
    }

    console.log("\n3 · The switch, exactly as in production");
    const t1 = await run("migrate:intel-rename --apply", ["tsx", "scripts/migrate-intel-rename.ts", "--apply"]);
    const t2 = await run("migrate:customer-accounts --apply", ["tsx", "scripts/migrate-customer-accounts.ts", "--apply", `--home-org=${HOME_ORG}`]);
    const t3 = await run("secure:tenancy --apply", ["tsx", "scripts/secure-tenancy.ts", "--apply"]);
    // ADR-011: credits ledger, then the policies again (they include the ledger's).
    const t4 = await run("migrate:credits --apply", ["tsx", "scripts/migrate-credits.ts", "--apply"]);
    const t5 = await run("secure:tenancy --apply (with ledger)", ["tsx", "scripts/secure-tenancy.ts", "--apply"]);
    console.log(`  · database work takes ${(t1 + t2 + t3 + t4 + t5).toFixed(1)}s in total`);

    console.log("\n4 · Result");
    const count = async (t: string) => (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n;
    for (const [oldName, newName] of [
      ["companies", "intel_companies"],
      ["company_inputs", "intel_company_inputs"],
      ["company_research", "intel_company_research"],
      ["company_outputs", "intel_company_outputs"],
    ]) {
      const n = await count(newName);
      check(`research kept: ${newName} ${n} rows`, n === summary[oldName], `backup had ${summary[oldName]}`);
    }
    for (const t of ["projects", "project_members", "conversations", "messages", "intake_answers", "artifacts", "artifact_approvals"]) {
      check(`JD test data removed: ${t}`, (await count(t)) === 0);
    }
    const { rows: home } = await pg.query<{ id: string; name: string }>(`SELECT id, name FROM companies WHERE clerk_org_id = $1`, [HOME_ORG]);
    check("SusanDana is the one customer company", home.length === 1 && (await count("companies")) === 1);
    const { rows: [{ n: placed }] } = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE company_id = $1`, [home[0]?.id]);
    check(`all ${summary.users} users placed in SusanDana`, placed === summary.users);

    // A re-run must never delete customer data.
    await pg.query(
      `INSERT INTO projects (company_id, title, created_by) VALUES ($1, 'must survive a re-run', (SELECT id FROM users LIMIT 1))`,
      [home[0].id]
    );
    await run("re-run of migrate:customer-accounts", ["tsx", "scripts/migrate-customer-accounts.ts", "--apply", `--home-org=${HOME_ORG}`]);
    check("a re-run deleted nothing", (await count("projects")) === 1);
    await pg.query(`DELETE FROM projects`);

    await run("re-run of secure:tenancy (idempotent)", ["tsx", "scripts/secure-tenancy.ts", "--apply"]);

    console.log("\n5 · Isolation test (as app_user, row-level security on)");
    await run("test:tenancy", ["tsx", "scripts/test-tenant-isolation.ts"]);

    console.log("\n6 · Voice durability and continuity on the new structure");
    await run("test:voice-durability", ["tsx", "scripts/test-voice-durability.ts"]);
    await run("test:voice", ["tsx", "scripts/test-voice-continuity.ts"]);
  } finally {
    await server.stop();
    await pg.close();
  }

  console.log(failed ? `\nREHEARSAL FAILED — ${failed} problem(s).` : "\nRehearsal passed.");
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
