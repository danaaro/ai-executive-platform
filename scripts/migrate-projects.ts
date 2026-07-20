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
 * One-off migration for ADR-007 (Project as primary entity). Idempotent —
 * safe to re-run. Steps:
 *   1. Create `projects` table if missing.
 *   2. Add nullable `project_id` to conversations/artifacts (drop the old
 *      reserved `role_id` column on artifacts — never used, no data).
 *   3. Backfill: one "Legacy imports" project per distinct owner that has
 *      pre-existing conversations/artifacts; point their rows at it.
 *   4. Enforce NOT NULL + add project-scoped indexes.
 */

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  console.log("1. projects table…");
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      status text NOT NULL DEFAULT 'open',
      created_by text NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  console.log("2. nullable project_id columns…");
  await sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id)`;
  await sql`ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id)`;
  await sql`ALTER TABLE artifacts DROP COLUMN IF EXISTS role_id`;

  console.log("3. backfilling Legacy imports projects…");
  const owners = await sql<{ created_by: string }[]>`
    SELECT DISTINCT created_by FROM (
      SELECT created_by FROM conversations WHERE project_id IS NULL
      UNION
      SELECT created_by FROM artifacts WHERE project_id IS NULL
    ) x
  `;
  for (const { created_by } of owners) {
    const [{ name, email }] = await sql<{ name: string | null; email: string | null }[]>`
      SELECT name, email FROM users WHERE id = ${created_by}
    `;
    const label = name || email || created_by;
    const [{ id: projectId }] = await sql<{ id: string }[]>`
      INSERT INTO projects (title, created_by)
      VALUES (${"Legacy imports (" + label + ")"}, ${created_by})
      RETURNING id
    `;
    const c = await sql`UPDATE conversations SET project_id = ${projectId} WHERE created_by = ${created_by} AND project_id IS NULL`;
    const a = await sql`UPDATE artifacts SET project_id = ${projectId} WHERE created_by = ${created_by} AND project_id IS NULL`;
    console.log(`   ${label}: project ${projectId} — ${c.count} conversations, ${a.count} artifacts`);
  }

  console.log("4. enforcing NOT NULL + indexes…");
  await sql`ALTER TABLE conversations ALTER COLUMN project_id SET NOT NULL`;
  await sql`ALTER TABLE artifacts ALTER COLUMN project_id SET NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS conversations_project_idx ON conversations (project_id, agent_slug)`;
  // artifacts_slot_idx existed on (created_by, agent_slug, version); versioning
  // moves to per-project (ADR-007), so drop and recreate on the new columns.
  await sql`DROP INDEX IF EXISTS artifacts_slot_idx`;
  await sql`CREATE INDEX artifacts_slot_idx ON artifacts (project_id, agent_slug, version)`;

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
