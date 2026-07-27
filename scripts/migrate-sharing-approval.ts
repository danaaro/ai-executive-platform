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
 * Migration for ADR-008 (Project sharing + the approval trail). Idempotent —
 * safe to re-run. Steps:
 *   1. Create `project_members` (the authorization unit) + its indexes.
 *   2. Backfill one `owner` row per existing project for its `created_by`.
 *      This MUST land before the access refactor ships, or every existing
 *      project becomes invisible to its owner — which is exactly why the
 *      DDL and the backfill live in one script rather than two.
 *   3. Create `artifact_approvals` (append-only human-oversight trail).
 *   4. Report: member coverage + any artifact already marked approved.
 *
 * `projects.status` gaining 'draft' needs no DDL — it is a plain text column
 * with a TypeScript-level enum.
 */

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  console.log("1. project_members table…");
  await sql`
    CREATE TABLE IF NOT EXISTS project_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id text REFERENCES users(id),
      invited_email text,
      role text NOT NULL DEFAULT 'viewer',
      invited_by text REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      accepted_at timestamptz
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS project_members_project_idx ON project_members (project_id)`;
  await sql`CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members (user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS project_members_email_idx ON project_members (invited_email)`;
  // Partial uniques: a row is identified by user_id OR invited_email, never
  // both — a plain composite unique would let NULLs duplicate freely.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_user_uq
      ON project_members (project_id, user_id) WHERE user_id IS NOT NULL
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_email_uq
      ON project_members (project_id, invited_email) WHERE invited_email IS NOT NULL
  `;

  console.log("2. backfilling owner rows for existing projects…");
  const inserted = await sql`
    INSERT INTO project_members (project_id, user_id, role, accepted_at)
    SELECT p.id, p.created_by, 'owner', now()
    FROM projects p
    WHERE NOT EXISTS (
      SELECT 1 FROM project_members m
      WHERE m.project_id = p.id AND m.user_id = p.created_by
    )
  `;
  console.log(`   ${inserted.count} owner rows created`);

  console.log("3. artifact_approvals table…");
  await sql`
    CREATE TABLE IF NOT EXISTS artifact_approvals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
      action text NOT NULL,
      note text,
      actor_id text NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS artifact_approvals_artifact_idx
      ON artifact_approvals (artifact_id, created_at)
  `;

  console.log("4. verification…");
  const [{ projects: projectCount }] = await sql<{ projects: string }[]>`
    SELECT count(*) AS projects FROM projects
  `;
  const [{ owned }] = await sql<{ owned: string }[]>`
    SELECT count(DISTINCT project_id) AS owned FROM project_members WHERE role = 'owner'
  `;
  console.log(`   projects: ${projectCount} · projects with an owner: ${owned}`);
  if (projectCount !== owned) {
    throw new Error(
      `Backfill incomplete — ${projectCount} projects but only ${owned} have an owner row. ` +
        `Do NOT deploy the access refactor until these match.`
    );
  }

  // Pre-existing 'approved' artifacts would have no approval-trail row, which
  // would be a hole in the audit record. Nothing has ever written 'approved'
  // (ADR-008 context), so this should be zero — but assert it rather than
  // assume it.
  const [{ orphans }] = await sql<{ orphans: string }[]>`
    SELECT count(*) AS orphans FROM artifacts a
    WHERE a.status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM artifact_approvals x WHERE x.artifact_id = a.id)
  `;
  if (Number(orphans) > 0) {
    console.warn(
      `   ⚠ ${orphans} artifact(s) are marked approved with no approval-trail row. ` +
        `Investigate before relying on the trail for compliance.`
    );
  } else {
    console.log("   approval trail consistent (no approved artifacts without a log row)");
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
