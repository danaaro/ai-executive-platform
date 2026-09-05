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
 * Creates `intake_answers` — the structured intake record. Idempotent.
 *
 *   npm run migrate:intake-answers
 *
 * Why a hand-written script rather than `drizzle-kit push`: same reason as
 * migrate-message-seq-unique.ts — push wants to diff the whole schema against
 * a live database that also carries RLS state it doesn't know about, and this
 * change is small enough to state exactly.
 *
 * NOTHING IS BACKFILLED and nothing is deleted. Existing conversations have no
 * rows here, which is deliberate: the coverage route keeps its LLM scorer as a
 * fallback for exactly those conversations (see the route's comment). Nulling
 * out `conversations.coverage` would have left every in-flight session showing
 * an empty meter with no data to rebuild it from.
 *
 * RLS is applied here as well as in secure-rls.ts. The table must not ship even
 * briefly with Supabase's default anon/authenticated grants, and a new table
 * created between two runs of that script is precisely the window this closes.
 */

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  console.log("1. Creating table intake_answers…");
  await sql`
    CREATE TABLE IF NOT EXISTS intake_answers (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      question_id    text NOT NULL,
      section_id     integer NOT NULL,
      answer         text,
      status         text NOT NULL,
      source         text NOT NULL,
      source_ref     text,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    )
  `;
  console.log("   ✓ table present");

  // Enum-ish columns are CHECK constraints rather than pg enums: Drizzle models
  // them as text with an enum type, and a CHECK is alterable without a type
  // rewrite when the prompt's status vocabulary changes.
  console.log("2. Constraints…");
  await sql`
    DO $$ BEGIN
      ALTER TABLE intake_answers ADD CONSTRAINT intake_answers_status_chk
        CHECK (status IN ('answered','inferred','unknown','not_yet_decided','skipped'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `;
  await sql`
    DO $$ BEGIN
      ALTER TABLE intake_answers ADD CONSTRAINT intake_answers_source_chk
        CHECK (source IN ('document','voice','dictation','typed'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$
  `;
  console.log("   ✓ status / source checks");

  console.log("3. Indexes…");
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS intake_answers_conversation_question_uniq
    ON intake_answers (conversation_id, question_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS intake_answers_conversation_section_idx
    ON intake_answers (conversation_id, section_id)
  `;
  console.log("   ✓ unique (conversation_id, question_id) + section index");

  console.log("4. RLS…");
  const [{ rolbypassrls: bypass }] = await sql<{ rolbypassrls: boolean }[]>`
    select rolbypassrls from pg_roles where rolname = current_user
  `;
  if (!bypass) {
    console.error(
      "   ✗ connecting role lacks BYPASSRLS — enabling RLS with no policies would " +
        "make the table unreadable to the app. Not enabling. Run npm run secure:rls " +
        "from a role that has it."
    );
    await sql.end();
    process.exit(1);
  }
  await sql`ALTER TABLE intake_answers ENABLE ROW LEVEL SECURITY`;
  await sql`REVOKE ALL ON TABLE intake_answers FROM anon, authenticated`;
  console.log("   ✓ RLS enabled, anon/authenticated revoked");

  console.log("5. Report…");
  const [counts] = await sql<{ answers: number; conversations: number }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM intake_answers) AS answers,
      (SELECT COUNT(*)::int FROM conversations)  AS conversations
  `;
  console.log(
    `   ${counts.answers} answer row(s) across ${counts.conversations} conversation(s) — ` +
      `existing conversations keep the LLM coverage fallback until they record answers.`
  );

  await sql.end();
  console.log("\nMigration complete.");
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
