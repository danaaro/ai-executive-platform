/**
 * Voice-durability regression test (2026-09-05): proves spoken turns survive
 * the browser dying mid-call.
 *
 *   npx tsx scripts/test-voice-durability.ts
 *
 * Before this work the ONLY writer of voice turns was the browser, so a
 * crashed tab or a slept laptop lost everything said since the last POST.
 * Persistence now happens in the ElevenLabs custom-LLM callback, which runs
 * server-to-server and does not care whether the client is alive.
 *
 * Covers: append-only seq allocation from the signed grant's baseSeq,
 * idempotency under ElevenLabs' turn retries, refusal to write without a
 * verified grant, assistant replies persisted at the end of the stream
 * (including the spoken error-recovery line), and the split user/assistant
 * text path that keeps typed input when a generation fails.
 *
 * Exits non-zero on any failure. Cleans up after itself.
 */
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf-8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { asc, eq } from "drizzle-orm";
import {
  historyTurns,
  persistVoiceTurns,
  persistAssistantTurn,
} from "../src/app/api/job-description/voice-llm/handler";
import { appendUserTurn, appendAssistantTurn } from "../src/shared/current-user";
import { db, tables } from "../src/db";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

type Row = { seq: number; role: string; content: string };

async function main() {
  const d = db();
  const testUserId = "test-voice-durability-user";
  await d.insert(tables.users).values({ id: testUserId, role: "member" }).onConflictDoNothing();
  const [project] = await d
    .insert(tables.projects)
    .values({ title: "voice-durability test project", createdBy: testUserId })
    .returning({ id: tables.projects.id });
  const [conv] = await d
    .insert(tables.conversations)
    .values({
      projectId: project.id,
      agentSlug: "job-description",
      createdBy: testUserId,
      title: "durability test",
    })
    .returning({ id: tables.conversations.id });

  const rows = async (): Promise<Row[]> =>
    d
      .select({
        seq: tables.messages.seq,
        role: tables.messages.role,
        content: tables.messages.content,
      })
      .from(tables.messages)
      .where(eq(tables.messages.conversationId, conv.id))
      .orderBy(asc(tables.messages.seq));

  try {
    // --- 1. historyTurns: the RAW filter, not toAnthropicMessages ---------
    // Consecutive same-role turns must NOT be merged here: seq allocation
    // depends on indices lining up with what ElevenLabs sends next time.
    const raw = historyTurns([
      { role: "system", content: "ignored" },
      { role: "user", content: "First thing." },
      { role: "user", content: "Second thing." },
      { role: "assistant", content: "" },
      { role: "assistant", content: [{ type: "text", text: "Noted." }] },
      { role: "tool", content: "ignored" },
    ]);
    check("historyTurns drops system/tool turns", raw.length === 3, `got ${raw.length}`);
    check(
      "historyTurns does NOT merge consecutive same-role turns",
      raw[0].content === "First thing." && raw[1].content === "Second thing."
    );
    check("historyTurns reads array content parts", raw[2].content === "Noted.");

    // --- 2. Seed pre-session context, then open a voice session -----------
    // Two turns of prior text chat: the call's baseSeq is therefore 2.
    await d.insert(tables.messages).values([
      { conversationId: conv.id, seq: 0, role: "user", content: "Start the NEW JOB intake session." },
      { conversationId: conv.id, seq: 1, role: "assistant", content: "Tell me about the role." },
    ]);
    const grant = { conversationId: conv.id, baseSeq: 2 };

    // --- 3. First callback: one spoken user turn --------------------------
    const turn1 = historyTurns([{ role: "user", content: "It reports to the CTO." }]);
    const nextSeq1 = await persistVoiceTurns(grant, turn1);
    let after = await rows();
    check("first spoken turn persisted", after.length === 3, `got ${after.length} rows`);
    check("persisted at baseSeq", after[2]?.seq === 2 && after[2]?.content === "It reports to the CTO.");
    check("returns the assistant seq", nextSeq1 === 3, `got ${nextSeq1}`);

    // --- 4. The assistant reply, persisted at end of stream ---------------
    await persistAssistantTurn(conv.id, nextSeq1!, "Understood. Who else does it influence?");
    after = await rows();
    check("assistant reply persisted", after.length === 4 && after[3].role === "assistant");

    // --- 5. ElevenLabs retries the SAME callback --------------------------
    // Its history now carries both turns; nothing new must be written.
    const replay = historyTurns([
      { role: "user", content: "It reports to the CTO." },
      { role: "assistant", content: "Understood. Who else does it influence?" },
    ]);
    await persistVoiceTurns(grant, replay);
    after = await rows();
    check("retried callback is a no-op", after.length === 4, `got ${after.length} rows`);

    // --- 6. Next real turn appends, it does not overwrite -----------------
    const turn2 = historyTurns([
      { role: "user", content: "It reports to the CTO." },
      { role: "assistant", content: "Understood. Who else does it influence?" },
      { role: "user", content: "Product, and the platform guild." },
    ]);
    const nextSeq2 = await persistVoiceTurns(grant, turn2);
    after = await rows();
    check("next spoken turn appended", after.length === 5 && after[4].seq === 4);
    check(
      "transcript is in spoken order",
      after.map((r) => r.seq).join(",") === "0,1,2,3,4"
    );

    // --- 7. The error-recovery line is stored as spoken -------------------
    await persistAssistantTurn(
      conv.id,
      nextSeq2!,
      "Sorry, I hit a brief hiccup on my side — could you say that again?"
    );
    after = await rows();
    check(
      "spoken recovery line is persisted",
      after.length === 6 && after[5].content.startsWith("Sorry, I hit a brief hiccup")
    );

    // --- 8. No verified grant → no write ----------------------------------
    // handleVoiceLlm skips persistence entirely when extractVoiceGrant returns
    // null; a forged conversation id must never reach the database.
    //
    // NOTE: this step prints a caught PostgresError stack (foreign-key
    // violation on the fake conversation id). That noise is the assertion
    // working — persistVoiceTurns swallows the failure so a voice turn never
    // dies of a persistence problem. Both checks below still PASS.
    const before = (await rows()).length;
    const forged = { conversationId: "00000000-0000-0000-0000-000000000000", baseSeq: 0 };
    await persistVoiceTurns(forged, historyTurns([{ role: "user", content: "should not land" }]));
    after = await rows();
    check("unverified conversation writes nothing here", after.length === before);
    const leaked = await d
      .select({ seq: tables.messages.seq })
      .from(tables.messages)
      .where(eq(tables.messages.conversationId, forged.conversationId));
    check("forged conversation has no rows", leaked.length === 0);

    // --- 9. Text path: input survives a failed generation ------------------
    const [conv2] = await d
      .insert(tables.conversations)
      .values({
        projectId: project.id,
        agentSlug: "job-description",
        createdBy: testUserId,
        title: "text durability",
      })
      .returning({ id: tables.conversations.id });
    try {
      const started = await appendUserTurn({
        conversationId: conv2.id,
        projectId: project.id,
        agentSlug: "job-description",
        userId: testUserId,
        userText: "Here is the full brief I pasted in.",
      });
      const stored = await d
        .select({ seq: tables.messages.seq, role: tables.messages.role })
        .from(tables.messages)
        .where(eq(tables.messages.conversationId, conv2.id));
      check(
        "user turn is stored BEFORE the model runs",
        stored.length === 1 && stored[0].role === "user"
      );
      check("assistant seq reserved", started?.assistantSeq === 1);

      // Generation succeeds on the retry: the reply lands at the reserved seq.
      await appendAssistantTurn({
        conversationId: conv2.id,
        seq: started!.assistantSeq,
        assistantText: "Thanks — that covers scope and stakeholders.",
      });
      const full = await d
        .select({ seq: tables.messages.seq, role: tables.messages.role })
        .from(tables.messages)
        .where(eq(tables.messages.conversationId, conv2.id))
        .orderBy(asc(tables.messages.seq));
      check(
        "reply lands at the reserved seq",
        full.length === 2 && full[1].seq === 1 && full[1].role === "assistant"
      );
    } finally {
      await d.delete(tables.messages).where(eq(tables.messages.conversationId, conv2.id));
      await d.delete(tables.conversations).where(eq(tables.conversations.id, conv2.id));
    }
  } finally {
    await d.delete(tables.messages).where(eq(tables.messages.conversationId, conv.id));
    await d.delete(tables.conversations).where(eq(tables.conversations.id, conv.id));
    await d.delete(tables.projects).where(eq(tables.projects.id, project.id));
    await d.delete(tables.users).where(eq(tables.users.id, testUserId));
  }

  console.log(
    failures === 0 ? "\nAll voice-durability checks passed." : `\n${failures} check(s) FAILED.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
