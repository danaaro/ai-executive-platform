import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

/**
 * End-to-end verification of the ADR-008 governance chain against the real
 * database, without spending model credits or needing a browser session.
 *
 * It creates a throwaway project, walks it through the exact sequence the
 * board performs — save draft → derive stage state → approve → re-derive →
 * load inherited context — asserting the state transitions at each step, then
 * deletes everything it made.
 *
 *   npx tsx scripts/verify-approval-chain.ts
 */

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

async function main() {
  const { deriveStages } = await import("../src/orchestrator/stages");
  const { loadInheritedArtifacts, applyInheritance } = await import(
    "../src/orchestrator/inheritance"
  );

  const [owner] = await sql<{ id: string }[]>`SELECT id FROM users LIMIT 1`;
  if (!owner) throw new Error("No users in the database — sign in once first.");

  const [project] = await sql<{ id: string }[]>`
    INSERT INTO projects (title, created_by) VALUES ('__verify_approval_chain', ${owner.id})
    RETURNING id
  `;
  const projectId = project.id;
  console.log(`\nthrowaway project ${projectId}\n`);

  try {
    await sql`
      INSERT INTO project_members (project_id, user_id, role, accepted_at)
      VALUES (${projectId}, ${owner.id}, 'owner', now())
    `;

    const load = async () => {
      const artifacts = await sql<
        {
          id: string;
          agentSlug: string;
          version: number;
          label: string;
          status: "draft" | "approved";
          createdAt: Date;
        }[]
      >`
        SELECT id, agent_slug AS "agentSlug", version, label, status, created_at AS "createdAt"
        FROM artifacts WHERE project_id = ${projectId}
      `;
      const conversations = await sql<
        { id: string; agentSlug: string; title: string | null; updatedAt: Date }[]
      >`
        SELECT id, agent_slug AS "agentSlug", title, updated_at AS "updatedAt"
        FROM conversations WHERE project_id = ${projectId}
      `;
      return deriveStages({ artifacts, conversations });
    };

    // --- 1. Empty board -------------------------------------------------
    let stages = await load();
    const jd = () => stages.find((s) => s.slug === "job-description")!;
    const comp = () => stages.find((s) => s.slug === "competency-builder")!;

    check("empty board: JD is not-started", jd().status === "not-started", jd().status);
    check(
      "empty board: Competency Builder warns (JD unapproved)",
      comp().status === "warning",
      comp().status
    );
    check(
      "empty board: warning names the blocking stage",
      comp().blockedBy.some((b) => b.slug === "job-description")
    );
    check("empty board: nothing to inherit yet", comp().inheritedFrom.length === 0);

    // --- 2. Save a JD draft ---------------------------------------------
    const [draft] = await sql<{ id: string }[]>`
      INSERT INTO artifacts (project_id, agent_slug, version, label, content, created_by)
      VALUES (${projectId}, 'job-description', 1, 'Job Description',
              '# Head of DevOps\n\nA verification-only artifact.', ${owner.id})
      RETURNING id
    `;
    stages = await load();
    check("after save: JD is active (draft exists)", jd().status === "active", jd().status);
    check("after save: JD latest is v1 draft", jd().latest?.version === 1 && jd().latest?.status === "draft");
    check("after save: JD has no approved version", jd().approved === null);
    check(
      "a DRAFT upstream does not satisfy the dependency",
      comp().status === "warning" && comp().inheritedFrom.length === 0
    );
    check(
      "a draft upstream is NOT inheritable",
      (await loadInheritedArtifacts(projectId, "competency-builder")).length === 0
    );

    // --- 3. Approve it ---------------------------------------------------
    await sql`UPDATE artifacts SET status = 'approved' WHERE id = ${draft.id}`;
    await sql`
      INSERT INTO artifact_approvals (artifact_id, action, actor_id, note)
      VALUES (${draft.id}, 'approved', ${owner.id}, null)
    `;
    stages = await load();
    check("after approve: JD is done", jd().status === "done", jd().status);
    check("after approve: JD approved version is v1", jd().approved?.version === 1);
    check(
      "after approve: Competency Builder no longer blocked",
      comp().blockedBy.length === 0 && comp().status !== "warning",
      comp().status
    );
    check(
      "after approve: Competency Builder shows what it inherits",
      comp().inheritedFrom.some((i) => i.agentSlug === "job-description" && i.version === 1)
    );

    // --- 4. Inheritance payload -----------------------------------------
    const inherited = await loadInheritedArtifacts(projectId, "competency-builder");
    check("inheritance loads the approved JD", inherited.length === 1 && inherited[0].version === 1);
    const injected = applyInheritance("Please begin.", inherited);
    check("injected prompt carries the artifact content", injected.includes("Head of DevOps"));
    check("injected prompt labels the source version", injected.includes("version 1"));
    check("injected prompt keeps the user's own message", injected.includes("Please begin."));
    check(
      "JD itself inherits nothing (no dependencies)",
      (await loadInheritedArtifacts(projectId, "job-description")).length === 0
    );

    // --- 5. Revision supersedes -----------------------------------------
    const [v2] = await sql<{ id: string }[]>`
      INSERT INTO artifacts (project_id, agent_slug, version, label, content, created_by)
      VALUES (${projectId}, 'job-description', 2, 'Job Description',
              '# Head of DevOps (revised)\n\nv2.', ${owner.id})
      RETURNING id
    `;
    stages = await load();
    check(
      "new draft over an approved version: stage stays done (v1 still feeds)",
      jd().status === "done" && jd().approved?.version === 1
    );
    check("latest is v2 while approved is v1", jd().latest?.version === 2);
    check(
      "still inherits v1, not the unapproved v2",
      (await loadInheritedArtifacts(projectId, "competency-builder"))[0].version === 1
    );

    await sql`UPDATE artifacts SET status = 'approved' WHERE id = ${v2.id}`;
    check(
      "approving v2 makes it the inherited version",
      (await loadInheritedArtifacts(projectId, "competency-builder"))[0].version === 2
    );

    // --- 6. Oversight trail ---------------------------------------------
    const trail = await sql<{ action: string }[]>`
      SELECT a.action FROM artifact_approvals a
      JOIN artifacts f ON f.id = a.artifact_id
      WHERE f.project_id = ${projectId}
    `;
    check("oversight trail recorded the approval", trail.length === 1 && trail[0].action === "approved");
  } finally {
    // Clean up in FK order.
    await sql`
      DELETE FROM artifact_approvals
      WHERE artifact_id IN (SELECT id FROM artifacts WHERE project_id = ${projectId})
    `;
    await sql`DELETE FROM artifacts WHERE project_id = ${projectId}`;
    await sql`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE project_id = ${projectId})`;
    await sql`DELETE FROM conversations WHERE project_id = ${projectId}`;
    await sql`DELETE FROM project_members WHERE project_id = ${projectId}`;
    await sql`DELETE FROM projects WHERE id = ${projectId}`;
    const [{ count }] = await sql<{ count: string }[]>`
      SELECT count(*) FROM projects WHERE id = ${projectId}
    `;
    console.log(`\ncleanup: throwaway project removed (${count === "0" ? "confirmed" : "STILL PRESENT"})`);
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) throw new Error(`${fail} check(s) failed`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
