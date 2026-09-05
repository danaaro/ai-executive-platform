import { and, eq, inArray, sql as raw } from "drizzle-orm";
import { db, tables } from "@/db";
import { dbEnabled } from "@/shared/current-user";

/**
 * The structured intake record: parsing it out of an agent turn, keeping it
 * off the user's screen, writing it down, and reading coverage back.
 *
 * Before this, the only machine-readable intake state was an LLM re-judgement
 * of the entire transcript on every turn — expensive, non-deterministic (it
 * could score a section DOWN, which is why `mergeCoverage` had to ratchet), and
 * carrying no provenance at all. The agent already knows which question it just
 * got an answer to and where that answer came from; this is it saying so.
 *
 * The agent appends a block at the very END of each turn:
 *
 *   [INTAKE ANSWERS]
 *   {"answers":[{"id":"1.3","status":"answered","source":"typed","answer":"…"}]}
 *
 * It is never shown to the user — see `createIntakeBlockFilter` for the stream
 * side and `splitIntakeBlock` for anything holding the whole turn.
 */

export const INTAKE_ANSWERS_MARKER = "[INTAKE ANSWERS]";

const STATUSES = ["answered", "inferred", "unknown", "not_yet_decided", "skipped"] as const;
const SOURCES = ["document", "voice", "dictation", "typed"] as const;

export type IntakeStatus = (typeof STATUSES)[number];
export type IntakeSource = (typeof SOURCES)[number];

export type IntakeAnswer = {
  questionId: string;
  sectionId: number;
  status: IntakeStatus;
  source: IntakeSource;
  answer: string | null;
};

/** "1.3" → 1. Returns null for anything that isn't a question-bank id. */
export function sectionOf(questionId: string): number | null {
  const m = /^(\d+)\.\d+$/.exec(questionId.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Splits a completed turn into what the user sees and what gets recorded.
 *
 * Tolerant by design: a malformed or absent block costs the bookkeeping for one
 * turn, never the turn itself. The transcript remains the record of last
 * resort, so losing a row here is recoverable; throwing would lose the reply.
 */
export function splitIntakeBlock(text: string): {
  visibleText: string;
  answers: IntakeAnswer[];
} {
  const at = text.lastIndexOf(INTAKE_ANSWERS_MARKER);
  if (at === -1) return { visibleText: text, answers: [] };

  const visibleText = text.slice(0, at).trimEnd();
  const tail = text.slice(at + INTAKE_ANSWERS_MARKER.length);
  // The block may arrive fenced; the first balanced-looking object is the payload.
  const json = tail.match(/\{[\s\S]*\}/);
  if (!json) return { visibleText, answers: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json[0]);
  } catch {
    return { visibleText, answers: [] };
  }

  const rows = (parsed as { answers?: unknown })?.answers;
  if (!Array.isArray(rows)) return { visibleText, answers: [] };

  const answers: IntakeAnswer[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const questionId = typeof r.id === "string" ? r.id.trim() : "";
    const sectionId = sectionOf(questionId);
    if (!sectionId) continue;
    const status = r.status as IntakeStatus;
    const source = r.source as IntakeSource;
    if (!STATUSES.includes(status) || !SOURCES.includes(source)) continue;
    // Last mention of a question in one block wins, same as across turns.
    if (seen.has(questionId)) {
      const idx = answers.findIndex((a) => a.questionId === questionId);
      if (idx >= 0) answers.splice(idx, 1);
    }
    seen.add(questionId);
    answers.push({
      questionId,
      sectionId,
      status,
      source,
      answer: typeof r.answer === "string" && r.answer.trim() ? r.answer.trim() : null,
    });
  }
  return { visibleText, answers };
}

/**
 * Streaming counterpart. Deltas go straight to the browser, so the block would
 * be typed out on screen unless it is withheld as it arrives.
 *
 * Holds back the last few characters of every chunk — enough that a marker
 * split across a chunk boundary ("…[INTAKE AN" + "SWERS]…") is still caught —
 * and emits nothing at all once the marker has been seen. `flush()` releases
 * the held tail when the turn ends without one.
 */
export function createIntakeBlockFilter(): {
  push: (chunk: string) => string;
  flush: () => string;
} {
  let held = "";
  let suppressing = false;

  return {
    push(chunk: string): string {
      if (suppressing) return "";
      held += chunk;
      const at = held.indexOf(INTAKE_ANSWERS_MARKER);
      if (at !== -1) {
        suppressing = true;
        const out = held.slice(0, at);
        held = "";
        return out;
      }
      // Keep back a possible partial marker; release the rest.
      const keep = INTAKE_ANSWERS_MARKER.length - 1;
      if (held.length <= keep) return "";
      const out = held.slice(0, held.length - keep);
      held = held.slice(held.length - keep);
      return out;
    },
    flush(): string {
      if (suppressing) return "";
      const out = held;
      held = "";
      return out;
    },
  };
}

/**
 * Upserts a turn's answers.
 *
 * A later turn REPLACES an earlier answer to the same question — the hiring
 * manager corrects themselves, or an answer credited from a document gets
 * refined in conversation — so this is an upsert on (conversation, question),
 * never an append. `channel` reflects how the turn physically arrived and
 * overrides the agent on the one thing the agent cannot know: it has no way to
 * tell speech from typing, but it does know when it mined an answer out of an
 * uploaded document, and that attribution is preserved.
 */
export async function recordIntakeAnswers(
  conversationId: string,
  answers: IntakeAnswer[],
  channel: "text" | "voice"
): Promise<number> {
  if (!dbEnabled() || answers.length === 0) return 0;

  const now = new Date();
  const rows = answers.map((a) => ({
    conversationId,
    questionId: a.questionId,
    sectionId: a.sectionId,
    answer: a.answer,
    status: a.status,
    source: a.source === "document" ? a.source : channel === "voice" ? "voice" : a.source,
    sourceRef: null,
    updatedAt: now,
  }));

  try {
    await db()
      .insert(tables.intakeAnswers)
      .values(rows)
      .onConflictDoUpdate({
        target: [tables.intakeAnswers.conversationId, tables.intakeAnswers.questionId],
        set: {
          answer: raw`excluded.answer`,
          status: raw`excluded.status`,
          source: raw`excluded.source`,
          sourceRef: raw`excluded.source_ref`,
          updatedAt: now,
        },
      });
    return rows.length;
  } catch (err) {
    // Bookkeeping must never cost a turn that already generated successfully.
    console.error("[intake-answers] write failed:", err);
    return 0;
  }
}

/** Marks answers mined from an uploaded document, so provenance names the file. */
export async function recordDocumentAnswers(
  conversationId: string,
  answers: IntakeAnswer[],
  fileName: string
): Promise<number> {
  const n = await recordIntakeAnswers(
    conversationId,
    answers.map((a) => ({ ...a, source: "document" as const })),
    "text"
  );
  if (n > 0) {
    await db()
      .update(tables.intakeAnswers)
      .set({ sourceRef: fileName })
      .where(
        and(
          eq(tables.intakeAnswers.conversationId, conversationId),
          inArray(
            tables.intakeAnswers.questionId,
            answers.map((a) => a.questionId)
          )
        )
      );
  }
  return n;
}

export type SectionRollup = {
  sectionId: number;
  resolved: number;
  substantive: number;
};

/**
 * Per-section counts — the whole coverage computation, as one grouped read.
 *
 * `resolved` is every question that carries any final status (including
 * skipped: a question the hiring manager declined is finished, not missing).
 * `substantive` is the subset that actually carries information.
 */
export async function sectionRollup(conversationId: string): Promise<SectionRollup[]> {
  if (!dbEnabled()) return [];
  const rows = await db()
    .select({
      sectionId: tables.intakeAnswers.sectionId,
      resolved: raw<number>`count(*)::int`,
      substantive: raw<number>`count(*) filter (where ${tables.intakeAnswers.status} in ('answered','inferred'))::int`,
    })
    .from(tables.intakeAnswers)
    .where(eq(tables.intakeAnswers.conversationId, conversationId))
    .groupBy(tables.intakeAnswers.sectionId);
  return rows;
}

/** Every recorded answer for a conversation, for the provenance table. */
export async function listIntakeAnswers(conversationId: string) {
  if (!dbEnabled()) return [];
  return db()
    .select()
    .from(tables.intakeAnswers)
    .where(eq(tables.intakeAnswers.conversationId, conversationId))
    .orderBy(tables.intakeAnswers.sectionId, tables.intakeAnswers.questionId);
}

/** True once a conversation has a structured record worth trusting. */
export async function hasIntakeAnswers(conversationId: string): Promise<boolean> {
  if (!dbEnabled()) return false;
  const rows = await db()
    .select({ n: raw<number>`count(*)::int` })
    .from(tables.intakeAnswers)
    .where(eq(tables.intakeAnswers.conversationId, conversationId));
  return (rows[0]?.n ?? 0) > 0;
}
