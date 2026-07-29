import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { findDeliverable } from "../src/components/review/deliverable";
import { mergeCoverage, type SectionStatus } from "../src/shared/coverage";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

/**
 * Regression guard for two bugs Dana found while testing the board on
 * 2026-07-26/27:
 *
 *  1. "Save draft" stored the agent's last CHAT MESSAGE (a follow-up question)
 *     as v1 of the job description, instead of the generated document.
 *  2. The intake progress meter went BACKWARDS (7.5 → 6.5) when the
 *     conversation simply continued, because the scorer re-judges all 20
 *     sections from scratch each turn and a fast model wobbles.
 *
 * Part A runs the detector over every artifact and every assistant turn in the
 * REAL database — synthetic fixtures would not have caught either bug, since
 * both hinge on what Susan's prompts actually emit.
 *
 *   npm run test:drawer
 */

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

const S = (id: number, status: SectionStatus["status"]): SectionStatus => ({
  id,
  name: `s${id}`,
  status,
});

async function main() {
  /* ---------------- A. deliverable detection, against live data ---------- */
  console.log("A. Deliverable detection (real database)\n");

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  try {
    const artifacts = await sql<{ agent_slug: string; version: number; content: string }[]>`
      SELECT agent_slug, version, content FROM artifacts
    `;
    // Real artifacts are multi-section documents; the short ones in the table
    // are the accidental question-saves this fix exists to prevent.
    const realDocs = artifacts.filter((a) => a.content.length > 2000);
    const junk = artifacts.filter((a) => a.content.length <= 2000);

    check(
      `every real artifact is detected (${realDocs.length} found)`,
      realDocs.length > 0 && realDocs.every((a) => findDeliverable([{ role: "assistant", content: a.content }])),
      realDocs
        .filter((a) => !findDeliverable([{ role: "assistant", content: a.content }]))
        .map((a) => `${a.agent_slug} v${a.version}`)
        .join(", ")
    );
    check(
      `short accidental saves are rejected (${junk.length} found)`,
      junk.every((a) => !findDeliverable([{ role: "assistant", content: a.content }]))
    );

    const turns = await sql<{ content: string }[]>`
      SELECT m.content FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.agent_slug = 'job-description' AND m.role = 'assistant'
    `;
    const flagged = turns.filter((t) => findDeliverable([{ role: "assistant", content: t.content }]));

    // Susan's prompt mandates a 500-700 word job description, i.e. roughly
    // 3,000-5,000 characters — so nothing shorter can be a compliant
    // deliverable. That floor comes from the spec and stays valid as the data
    // grows. (An earlier version of this check asserted >20,000 chars, which
    // was over-fitted to the single 24k artifact that happened to exist when
    // it was written, and broke the moment real testing produced normal-sized
    // job descriptions.)
    const MIN_COMPLIANT_DOC = 3000;
    check(
      `every flagged turn is a compliant-length document (${flagged.length} of ${turns.length} turns)`,
      flagged.length > 0 && flagged.every((f) => f.content.length >= MIN_COMPLIANT_DOC),
      `smallest ${Math.min(...flagged.map((f) => f.content.length))} chars`
    );
    // Deliverables are rare: most of what the agent says is interview.
    check(
      "deliverables remain a small minority of turns",
      flagged.length / turns.length < 0.25,
      `${((flagged.length / turns.length) * 100).toFixed(0)}% flagged`
    );
  } finally {
    await sql.end();
  }

  /* ---------------- B. deliverable detection, shape rules --------------- */
  console.log("\nB. Deliverable detection (shape rules)\n");

  const question =
    "Sure, let's continue. I had just asked about the team and stakeholders — let me bundle those together:\n\n" +
    "1. **Team**: Can you describe the current team this CEO will inherit — size, structure, seniority?\n" +
    "2. **Stakeholders**: Beyond the Group CEO and the board, who else will they manage closely?\n" +
    "3. **Environment**: Is the role based on-site in Brussels, and are there travel requirements?\n";
  check("the exact turn Dana saw is NOT a deliverable", findDeliverable([{ role: "assistant", content: question }]) === null);

  const summary =
    "Thanks for sharing this — it's a strong, well-organized draft. Here's my intake summary.\n\n" +
    "## What's already well covered\n" +
    "- **Business context & purpose** (why the role exists)\n".repeat(20) +
    "## What's still open\n" +
    "- Compensation band\n".repeat(10);
  check("a prose-led intake summary is NOT a deliverable", findDeliverable([{ role: "assistant", content: summary }]) === null);

  const jd =
    "# Head of DevOps — Job Description\n\n" +
    "**Location:** Tel Aviv · Hybrid\n\n" +
    "## Our Team and You\n" +
    "Long-form prose describing the team mission and impact. ".repeat(20) +
    "\n\n## The Scope of the Role and Why It's Open\n" +
    "More substantive prose about scope and context. ".repeat(20);
  check("a generated job description IS a deliverable", findDeliverable([{ role: "assistant", content: jd }]) !== null);

  const withPreamble = `Here is the final version:\n\n${jd}`;
  check("a short lead-in before the title still counts", findDeliverable([{ role: "assistant", content: withPreamble }]) !== null);

  // The core of bug 1: the document is NOT the most recent assistant turn.
  const thread = [
    { role: "user" as const, content: "Start the NEW JOB intake session." },
    { role: "assistant" as const, content: jd },
    { role: "user" as const, content: "let's continue here, resume your questions" },
    { role: "assistant" as const, content: question },
  ];
  const found = findDeliverable(thread);
  check("picks the document, not the newer chat message", found?.content === jd);
  check("and reports that it is not the latest turn", found?.isLatest === false);
  check(
    "a thread with no document yields nothing to save",
    findDeliverable([
      { role: "user", content: "hi" },
      { role: "assistant", content: question },
    ]) === null
  );

  /* ---------------- C. coverage ratchet --------------------------------- */
  console.log("\nC. Coverage meter never goes backwards\n");

  const before = [S(1, "covered"), S(2, "partial"), S(3, "missing")];
  const wobbled = [S(1, "partial"), S(2, "missing"), S(3, "missing")];
  const merged = mergeCoverage(before, wobbled);
  check("a covered section stays covered when the model wobbles", merged[0].status === "covered");
  check("a partial section does not fall back to missing", merged[1].status === "partial");

  const improved = mergeCoverage(before, [S(1, "covered"), S(2, "covered"), S(3, "partial")]);
  check("genuine progress still moves the meter forward", improved[1].status === "covered" && improved[2].status === "partial");

  const score = (secs: SectionStatus[]) =>
    secs.filter((s) => s.status === "covered").length + secs.filter((s) => s.status === "partial").length * 0.5;
  check(
    "Dana's 7.5 → 6.5 drop cannot happen (score is monotonic)",
    score(mergeCoverage(before, wobbled)) >= score(before),
    `${score(before)} -> ${score(mergeCoverage(before, wobbled))}`
  );

  check("first run with no previous result is unchanged", mergeCoverage([], wobbled).every((s, i) => s.status === wobbled[i].status));

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) throw new Error(`${fail} check(s) failed`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
