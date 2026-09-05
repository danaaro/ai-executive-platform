import fs from "node:fs";
import path from "node:path";

// --- env: load .env.local the way Next.js would (KEY=VALUE lines) ---
const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

import { runJobDescriptionTurn } from "../src/orchestrator/job-description-orchestrator";
import { splitIntakeBlock } from "../src/shared/intake-answers";

/**
 * Guards ONE QUESTION PER TURN on the TEXT channel (Dana 2026-09-05).
 *
 * The rule used to be voice-only, enforced by a channel note that named and
 * revoked Phase 1's bundling rule, and guarded by test-voice-one-question.ts.
 * Phase 1 now requires one question per turn everywhere — which means text
 * chat, the channel that previously mandated the opposite, is the one most
 * likely to drift back. Bundling is also the failure mode nobody notices in
 * review: four numbered questions read as thorough, and only the transcript
 * shows that questions three and four went unanswered.
 *
 * This drives the real orchestrator rather than an HTTP endpoint, so it needs
 * no dev server — same approach as run-evals.ts. The voice sibling stays as it
 * is: it tests the deployed handler contract, which is a different thing.
 *
 *   npm run test:one-question
 */

/**
 * Deliberately partial answers. A hiring manager who under-answers is exactly
 * when the agent is tempted to fire off several catch-up questions at once.
 */
const USER_TURNS = [
  "Start the NEW JOB intake session.",
  "I need to hire a Head of DevOps for our platform team.",
  "It's a new role. We're a fintech, about four hundred people, based in Tel Aviv.",
  "They'd own the whole delivery pipeline and manage twelve engineers.",
  "Reporting to me, the CTO.",
  "Mainly because our release cadence is too slow.",
];

/** Question marks in what the user actually reads — the metric the rule is about. */
function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

/**
 * A numbered or bulleted list whose items are questions is bundling wearing a
 * different hat — it can slip past a question-mark count when only the last
 * item ends in "?".
 */
function listedQuestions(text: string): number {
  return text
    .split("\n")
    .filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l) && /\?/.test(l)).length;
}

/**
 * A menu of candidate answers appended to the question — "…what prompted it,
 * was it growth, a new initiative, restructuring, or something else?"
 *
 * Counting question marks does not catch this: written with an em-dash it is
 * one sentence and one "?". It matters because the question bank itself carries
 * parenthetical examples ("(e.g., business growth, new initiative,
 * restructuring)") that are guidance for the interviewer, and the agent's
 * failure mode is reading them out — which leads the hiring manager to pick
 * from a list instead of describing their own situation.
 */
function menuOfOptions(text: string): string | null {
  const patterns: [RegExp, string][] = [
    [/\bor something else\b/i, '"or something else"'],
    [/\be\.g\.[^?]*\?/i, 'read out an "e.g." list'],
    [/\b(?:is|was) it\s+[^.?!]*,[^.?!]*,[^.?!]*\?/i, '"is it A, B, C?" menu'],
  ];
  for (const [re, label] of patterns) if (re.test(text)) return label;
  return null;
}

async function main() {
  console.log("Text-channel one-question-per-turn check\n");
  const history: { role: "user" | "assistant"; content: string }[] = [];
  let failures = 0;

  for (const [i, turn] of USER_TURNS.entries()) {
    history.push({ role: "user", content: turn });
    const raw = await runJobDescriptionTurn(history);
    // Score what the USER sees. The [INTAKE ANSWERS] block can legitimately
    // quote a question, and counting it would fail an innocent turn.
    const { visibleText } = splitIntakeBlock(raw);
    history.push({ role: "assistant", content: visibleText });

    const questions = countQuestions(visibleText);
    const listed = listedQuestions(visibleText);
    const menu = menuOfOptions(visibleText);
    const ok = questions <= 1 && listed <= 1 && menu === null;
    if (!ok) failures++;

    console.log(
      `${ok ? "✓" : "✗"} turn ${i + 1}: ${questions} question mark(s)` +
        (listed > 1 ? `, ${listed} listed questions` : "") +
        (menu ? `, MENU: ${menu}` : "")
    );
    console.log(`    HM:    "${turn}"`);
    console.log(
      `    agent: "${visibleText.replace(/\n+/g, " ").slice(0, 280)}${visibleText.length > 280 ? "…" : ""}"\n`
    );
  }

  if (failures) {
    console.log(`FAILED — ${failures}/${USER_TURNS.length} turns asked more than one question.`);
    process.exit(1);
  }
  console.log(`PASSED — all ${USER_TURNS.length} turns asked at most one question.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
