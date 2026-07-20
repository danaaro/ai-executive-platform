/**
 * Voice-continuity regression test (2026-07-19): proves a dropped voice
 * session can NEVER restart the interview from zero again.
 *
 *   npx tsx scripts/test-voice-continuity.ts
 *
 * Covers: voice-grant signing/verification (incl. forgery + expiry), DB
 * prefix hydration through the real handler code against the real database,
 * and the dropped-session scenario end-to-end at the message-assembly level.
 * Exits non-zero on any failure. Cleans up after itself.
 */
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { eq } from "drizzle-orm";
import { signVoiceGrant, verifyVoiceGrant, extractVoiceGrant } from "../src/shared/voice-grant";
import { toAnthropicMessages, loadVoicePrefix } from "../src/app/api/job-description/voice-llm/handler";
import { db, tables } from "../src/db";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const INTAKE_START = "Start the NEW JOB intake session.";

async function main() {
  // --- 1. Grant crypto ---
  const grant = signVoiceGrant("11111111-2222-3333-4444-555555555555", 7);
  check("grant roundtrip verifies", verifyVoiceGrant(grant)?.baseSeq === 7);
  check("tampered sig rejected", verifyVoiceGrant({ ...grant, sig: grant.sig.replace(/^./, "0") }) === null);
  check("tampered conversation rejected", verifyVoiceGrant({ ...grant, conversation_id: "66666666-2222-3333-4444-555555555555" }) === null);
  check("tampered base_seq rejected", verifyVoiceGrant({ ...grant, base_seq: 0 }) === null);
  check("expired grant rejected", verifyVoiceGrant({ ...signVoiceGrant("11111111-2222-3333-4444-555555555555", 7, -10) }) === null);
  check("extract: top-level merge shape", extractVoiceGrant({ ...grant, messages: [] }) !== null);
  check("extract: nested elevenlabs_extra_body", extractVoiceGrant({ elevenlabs_extra_body: grant }) !== null);
  check("extract: nested custom_llm_extra_body", extractVoiceGrant({ custom_llm_extra_body: grant }) !== null);
  check("extract: absent grant → null", extractVoiceGrant({ messages: [] }) === null);

  // --- 2. DB hydration through the real handler path ---
  const d = db();
  const testUserId = "test-voice-continuity-user";
  await d.insert(tables.users).values({ id: testUserId, role: "member" }).onConflictDoNothing();
  const [project] = await d
    .insert(tables.projects)
    .values({ title: "voice-continuity test project", createdBy: testUserId })
    .returning({ id: tables.projects.id });
  const [conv] = await d
    .insert(tables.conversations)
    .values({ projectId: project.id, agentSlug: "job-description", createdBy: testUserId, title: "continuity test" })
    .returning({ id: tables.conversations.id });
  try {
    const priorTurns = [
      { role: "user" as const, content: INTAKE_START },
      { role: "assistant" as const, content: "Hi! Tell me about the role you're hiring for." },
      { role: "user" as const, content: "Head of DevOps for our logistics SaaS, 140 people, remote EU." },
      { role: "assistant" as const, content: "Great — why is the role open, and what does success look like in year one?" },
      { role: "user" as const, content: "SOC 2 audit in five months, deploys weekly to daily, team grows 3 to 6." },
    ];
    await d.insert(tables.messages).values(
      priorTurns.map((m, i) => ({ conversationId: conv.id, seq: i, role: m.role, content: m.content }))
    );

    const validGrant = signVoiceGrant(conv.id, priorTurns.length);
    const prefix = await loadVoicePrefix({ ...validGrant });
    check("hydration returns all pre-session turns", prefix.length === priorTurns.length, `got ${prefix.length}`);
    check("hydration preserves content", prefix[4]?.content.includes("SOC 2 audit"));

    const forged = { ...signVoiceGrant(conv.id, priorTurns.length), sig: "0".repeat(64) };
    const forgedPrefix = await loadVoicePrefix({ ...forged });
    check("forged grant hydrates nothing", forgedPrefix.length === 0);

    // --- 3. Dropped-session scenario: new ElevenLabs session, empty history ---
    // BEFORE the fix, this produced a bare intake-start and the agent restarted
    // the interview from zero. Now the assembled context carries everything.
    const assembled = toAnthropicMessages([], prefix);
    check("dropped session does NOT restart from zero",
      !(assembled.length === 1 && assembled[0].content === INTAKE_START));
    check("dropped session keeps the full story",
      assembled.some((t) => t.content.includes("SOC 2 audit")) &&
      assembled.some((t) => t.content.includes("Head of DevOps")));
    check("assembled context starts with a user turn", assembled[0].role === "user");

    // Mid-session turn: prefix + ElevenLabs' own in-session history, no dupes.
    const midSession = toAnthropicMessages(
      [
        { role: "assistant", content: "Welcome back — we got to your year-one goals." },
        { role: "user", content: "Right. Budget is 95 to 115k euro plus equity." },
      ],
      prefix
    );
    const joined = midSession.map((t) => t.content).join("\n");
    check("mid-session merge keeps both sources",
      joined.includes("SOC 2 audit") && joined.includes("95 to 115k"));
    check("mid-session merge alternates roles",
      midSession.every((t, i) => i === 0 || t.role !== midSession[i - 1].role));

    // No grant (e.g. legacy session) → behaves like before, no crash.
    const bare = toAnthropicMessages([], []);
    check("no-grant fresh session opens the intake", bare[0].content === INTAKE_START);
  } finally {
    await d.delete(tables.conversations).where(eq(tables.conversations.id, conv.id));
    await d.delete(tables.projects).where(eq(tables.projects.id, project.id));
    await d.delete(tables.users).where(eq(tables.users.id, testUserId));
  }

  console.log(failures === 0 ? "\nAll voice-continuity checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
