import fs from "node:fs";
import path from "node:path";

/**
 * Guards the voice channel's ONE-QUESTION-PER-TURN rule (Dana 2026-08-13).
 *
 * The operative JD prompt tells the agent to bundle 2–4 questions per turn —
 * right for typing, wrong for speech. The voice channel note revokes that, but
 * a prompt-level override is only as good as its last edit: re-tuning either
 * file can silently restore bundling, and the symptom (Susan being asked three
 * things at once by a voice that has already moved on) only shows up in a live
 * call. So this drives REAL turns through the deployed handler contract and
 * counts question marks in what the agent actually says.
 *
 * Run against a local dev server: npm run test:voice-questions
 * Or against prod:  BASE_URL=https://susies-brain.vercel.app npm run test:voice-questions
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3010";
const ENDPOINT = "/api/job-description/voice-llm/chat/completions";

/**
 * Answers a spoken turn the way a hiring manager would — each reply is
 * deliberately partial, which is exactly when the agent is tempted to fire off
 * several catch-up questions at once.
 */
const USER_TURNS = [
  "Hi, I need to hire a Head of DevOps for our platform team.",
  "It's a new role. We're a fintech, about four hundred people, based in Tel Aviv.",
  "They'd own the whole delivery pipeline and manage twelve engineers.",
  "Reporting to me, the CTO. Budget is around two million dollars.",
  "The main reason it's open is our release cadence is too slow.",
];

function secret(): string {
  if (process.env.ELEVENLABS_CUSTOM_LLM_SECRET) return process.env.ELEVENLABS_CUSTOM_LLM_SECRET;
  const envPath = path.join(process.cwd(), ".env.local");
  const match = fs.readFileSync(envPath, "utf-8").match(/^ELEVENLABS_CUSTOM_LLM_SECRET=(.+)$/m);
  if (!match) throw new Error("ELEVENLABS_CUSTOM_LLM_SECRET not found");
  return match[1].trim();
}

/** Question marks inside a spoken turn — the metric the rule is about. */
function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

/** Markdown must never reach TTS — it gets read aloud character by character. */
function hasMarkdown(text: string): boolean {
  return /^\s*[-*•]\s|^#{1,6}\s|\*\*/m.test(text);
}

async function speak(
  history: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const res = await fetch(`${BASE_URL}${ENDPOINT}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret()}`,
    },
    body: JSON.stringify({ model: "job-description-agent", messages: history, stream: false }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function main() {
  console.log(`Voice one-question-per-turn check → ${BASE_URL}\n`);
  const history: { role: "user" | "assistant"; content: string }[] = [];
  let failures = 0;

  for (const [i, turn] of USER_TURNS.entries()) {
    history.push({ role: "user", content: turn });
    const reply = await speak(history);
    history.push({ role: "assistant", content: reply });

    const questions = countQuestions(reply);
    const markdown = hasMarkdown(reply);
    const ok = questions <= 1 && !markdown;
    if (!ok) failures++;

    console.log(`${ok ? "✓" : "✗"} turn ${i + 1}: ${questions} question(s)${markdown ? ", CONTAINS MARKDOWN" : ""}`);
    console.log(`    HM:    "${turn}"`);
    console.log(`    agent: "${reply.replace(/\n+/g, " ").slice(0, 260)}${reply.length > 260 ? "…" : ""}"\n`);
  }

  if (failures) {
    console.log(`FAILED — ${failures}/${USER_TURNS.length} turns broke the voice rules.`);
    process.exit(1);
  }
  console.log(`PASSED — all ${USER_TURNS.length} turns asked at most one question, no markdown.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
