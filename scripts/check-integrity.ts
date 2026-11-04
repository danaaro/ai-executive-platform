import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";

/**
 * Data integrity check (Select spec v1.0 §5 test 8).
 *
 *   npm run check:integrity
 *
 * READ ONLY: SELECTs only, safe on any database. Checks that every row points
 * at a parent that exists AND belongs to the same company, so a role, JD or
 * kit can never show up under the wrong company. Exit code 1 if anything is off.
 *
 * Today's model: role = projects, JD and kit = artifacts. When the spec's own
 * tables land (stage 1b: job_descriptions, kits, competencies, questions,
 * rubric levels), their checks are added here.
 */

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/** Each check is a query returning the offending rows (id + detail); empty = pass. */
const CHECKS: { name: string; query: string }[] = [
  {
    name: "every role has a valid company",
    query: `select p.id, p.title as detail from projects p left join companies c on c.id = p.company_id where c.id is null`,
  },
  {
    name: "every JD and kit has a valid role",
    query: `select a.id, a.agent_slug as detail from artifacts a left join projects p on p.id = a.project_id where p.id is null`,
  },
  {
    name: "every JD and kit is in its role's company",
    query: `select a.id, a.agent_slug as detail from artifacts a join projects p on p.id = a.project_id where a.company_id <> p.company_id`,
  },
  {
    name: "JD and kit versions are unique per role",
    query: `select min(a.id::text) as id, a.project_id || ' ' || a.agent_slug || ' v' || a.version as detail
            from artifacts a group by a.project_id, a.agent_slug, a.version having count(*) > 1`,
  },
  {
    name: "every kit was built from a JD of the same role",
    query: `select k.id, k.envelope->'inputs'->>'jdArtifactId' as detail
            from artifacts k
            left join artifacts j on j.id::text = k.envelope->'inputs'->>'jdArtifactId'
              and j.project_id = k.project_id and j.agent_slug = 'job-description'
            where k.agent_slug = 'interview-kit' and j.id is null`,
  },
  {
    name: "every competency in a kit has an id, unique within the kit",
    query: `select k.id, coalesce(area->>'id', '(no id)') as detail
            from artifacts k,
              jsonb_array_elements(coalesce(k.envelope->'parts'->'interviews'->'data'->'attributes', '[]'::jsonb)) att,
              jsonb_array_elements(coalesce(att->'areas', '[]'::jsonb)) area
            where k.agent_slug = 'interview-kit'
            group by k.id, area->>'id'
            having area->>'id' is null or area->>'id' = '' or count(*) > 1`,
  },
  {
    name: "every approval belongs to a JD or kit in the same company",
    query: `select ap.id, ap.action as detail from artifact_approvals ap left join artifacts a on a.id = ap.artifact_id
            where a.id is null or ap.company_id <> a.company_id`,
  },
  {
    name: "every conversation is in its role's company",
    query: `select cv.id, cv.agent_slug as detail from conversations cv left join projects p on p.id = cv.project_id
            where p.id is null or cv.company_id <> p.company_id`,
  },
  {
    name: "every message is in its conversation's company",
    query: `select m.id, m.seq::text as detail from messages m left join conversations cv on cv.id = m.conversation_id
            where cv.id is null or m.company_id <> cv.company_id`,
  },
  {
    name: "every intake answer is in its conversation's company",
    query: `select ia.id, ia.question_id as detail from intake_answers ia left join conversations cv on cv.id = ia.conversation_id
            where cv.id is null or ia.company_id <> cv.company_id`,
  },
  {
    name: "every role member is in the role's company",
    query: `select pm.id, coalesce(pm.user_id, pm.invited_email) as detail from project_members pm left join projects p on p.id = pm.project_id
            where p.id is null or pm.company_id <> p.company_id`,
  },
];

async function main() {
  loadEnv();
  const { adminDb } = await import("../src/db");
  const db = adminDb();
  // What was covered, so an all-green run on an empty database is obvious.
  const [n] = (await db.execute(
    sql.raw(`select (select count(*) from companies) companies, (select count(*) from projects) roles,
      (select count(*) from artifacts where agent_slug = 'job-description') jd_versions,
      (select count(*) from artifacts where agent_slug = 'interview-kit') kit_versions`)
  )) as unknown as Record<string, string>[];
  console.log(`Checking ${n.companies} companies, ${n.roles} roles, ${n.jd_versions} JD versions, ${n.kit_versions} kit versions\n`);
  let failed = 0;
  for (const c of CHECKS) {
    const rows = (await db.execute(sql.raw(c.query))) as unknown as { id: string; detail: string | null }[];
    console.log(`${rows.length ? "  ✗" : "  ✓"} ${c.name}${rows.length ? ` — ${rows.length} row(s)` : ""}`);
    for (const r of rows.slice(0, 10)) console.log(`      ${r.id}  ${r.detail ?? ""}`);
    if (rows.length) failed++;
  }
  console.log(failed ? `\n${failed} integrity check(s) FAILED` : "\nAll integrity checks passed.");
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
