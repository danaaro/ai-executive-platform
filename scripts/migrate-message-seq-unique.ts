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
 * Adds UNIQUE (conversation_id, seq) to `messages`. Idempotent — safe to re-run.
 *
 * Why: voice turns are now persisted server-side in the ElevenLabs custom-LLM
 * callback, and ElevenLabs retries a callback on timeout. The unique index is
 * what turns a retried insert into a no-op under `onConflictDoNothing()`
 * instead of a duplicated turn in the transcript.
 *
 * Live data DID contain collisions when this first ran (6 pairs across two
 * conversations, 2026-08-09 and 2026-09-04). All of them were the old
 * client-side writer racing itself: the user turn and the assistant turn were
 * POSTed within ~100ms of each other, both read `max(seq)+1` before either had
 * inserted, and both wrote the same seq. That read-then-write race is exactly
 * what the single-writer design removes — but the rows it already produced are
 * real conversation content and are NOT deleted here. Step 2 renumbers the
 * affected conversations in `created_at` order, preserving every message.
 *
 * Renumbering is safe against the rest of the schema: message COUNT is
 * unchanged, so the `conversations.coverage_seq` cache stays valid, artifacts
 * never reference seq, and voice grants that embed a baseSeq expire after 2h.
 */

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  console.log("1. Checking for duplicate (conversation_id, seq) pairs…");
  const dupes = await sql<{ conversation_id: string; seq: number; n: number }[]>`
    SELECT conversation_id, seq, COUNT(*)::int AS n
    FROM messages
    GROUP BY conversation_id, seq
    HAVING COUNT(*) > 1
    ORDER BY conversation_id, seq
  `;

  if (dupes.length === 0) {
    console.log("   ✓ none");
  } else {
    console.log(`   Found ${dupes.length} collided pair(s):`);
    for (const d of dupes) {
      console.log(`     conversation ${d.conversation_id} seq ${d.seq} — ${d.n} rows`);
    }

    const affected = [...new Set(dupes.map((d) => d.conversation_id))];
    console.log(`\n2. Renumbering ${affected.length} affected conversation(s) — no rows deleted…`);
    for (const conversationId of affected) {
      const [{ before }] = await sql<{ before: number }[]>`
        SELECT COUNT(*)::int AS before FROM messages WHERE conversation_id = ${conversationId}
      `;
      // Two passes: park the rows above the existing range first, so the
      // renumber cannot collide with a seq that is still occupied.
      await sql.begin(async (tx) => {
        await tx`
          UPDATE messages SET seq = seq + 100000 WHERE conversation_id = ${conversationId}
        `;
        await tx`
          UPDATE messages m
          SET seq = ordered.rn - 1
          FROM (
            SELECT id, ROW_NUMBER() OVER (ORDER BY seq, created_at, id) AS rn
            FROM messages WHERE conversation_id = ${conversationId}
          ) AS ordered
          WHERE m.id = ordered.id
        `;
      });
      const [{ after }] = await sql<{ after: number }[]>`
        SELECT COUNT(*)::int AS after FROM messages WHERE conversation_id = ${conversationId}
      `;
      console.log(
        `     ${conversationId} — ${before} message(s) renumbered 0..${after - 1}` +
          (before === after ? " ✓" : ` ✗ COUNT CHANGED (${before} → ${after})`)
      );
      if (before !== after) {
        console.error("     Aborting: renumbering must never change the message count.");
        await sql.end();
        process.exit(1);
      }
    }

    const [{ remaining }] = await sql<{ remaining: number }[]>`
      SELECT COUNT(*)::int AS remaining FROM (
        SELECT 1 FROM messages GROUP BY conversation_id, seq HAVING COUNT(*) > 1
      ) AS d
    `;
    if (remaining > 0) {
      console.error(`\n   ✗ ${remaining} collision(s) still present — index NOT created.`);
      await sql.end();
      process.exit(1);
    }
    console.log("   ✓ all collisions resolved, every message preserved");
  }

  console.log("3. Creating unique index messages_conversation_seq_uniq…");
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_seq_uniq
    ON messages (conversation_id, seq)
  `;
  console.log("   ✓ done");

  console.log("4. Report…");
  const [counts] = await sql<{ conversations: number; messages: number }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM conversations) AS conversations,
      (SELECT COUNT(*)::int FROM messages) AS messages
  `;
  console.log(
    `   ${counts.messages} message(s) across ${counts.conversations} conversation(s), all uniquely sequenced`
  );

  await sql.end();
  console.log("\nMigration complete.");
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
