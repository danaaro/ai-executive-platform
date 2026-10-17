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
 * Speed (2026-10-17): `users.synced_at` lets requireUser() trust our copy of a
 * user for a few minutes instead of calling Clerk (~0.4 s) on most requests.
 *
 *   npm run migrate:user-sync            # dry run
 *   npm run migrate:user-sync -- --apply
 *
 * Additive: one nullable column. Null = never synced = the next request syncs
 * with Clerk as before. Idempotent.
 */
const apply = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const stmt = `ALTER TABLE users ADD COLUMN IF NOT EXISTS synced_at timestamptz`;
console.log(apply ? "APPLYING" : "DRY RUN — nothing will change.");
console.log("  " + stmt);
(apply ? sql.unsafe(stmt) : Promise.resolve())
  .then(() => console.log(apply ? "Done." : "Dry run complete."))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
