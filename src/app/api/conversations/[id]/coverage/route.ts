import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser, dbEnabled, getConversationAccess } from "@/shared/current-user";
import { getAnthropicClient } from "@/shared/anthropic-client";
import { mergeCoverage, type SectionStatus } from "@/shared/coverage";
import { hasIntakeAnswers, sectionRollup } from "@/shared/intake-answers";

export const maxDuration = 60;

/**
 * Intake-progress meter (2026-07-19): scores a JD conversation against the
 * 20 questionnaire sections — covered / partial / missing per section — so
 * the user can SEE how much information is still needed instead of guessing.
 * Cheap fast model, result cached on the conversation row and recomputed
 * only when new messages exist. Works identically for text and voice, since
 * every turn (voice included) now persists.
 */

const METER_MODEL = "claude-haiku-4-5";


type Section = { id: number; name: string; questionCount: number };

let sectionCache: Section[] | null = null;
/**
 * The questionnaire's shape, read from the bank itself — never a hardcoded
 * count. The bank is the source of truth for both the section list and how
 * many questions each section holds, so editing it re-shapes the meter with
 * no code change. (The wireframes mock 9 sections; the real bank has 20.)
 */
function questionnaireSections(): Section[] {
  if (sectionCache) return sectionCache;
  const bank = fs.readFileSync(
    path.join(process.cwd(), "products/interview-intelligence/docs/job-description-question-bank.md"),
    "utf-8"
  );
  const sections: Section[] = [];
  for (const line of bank.split("\n")) {
    const heading = /^## (\d+)\. (.+?)\s*(?:`|$)/.exec(line);
    if (heading) {
      sections.push({
        id: Number(heading[1]),
        name: heading[2].trim(),
        questionCount: 0,
      });
      continue;
    }
    // Question rows look like `| 1.3 | Is this a new position…? |`.
    const row = /^\|\s*(\d+)\.\d+\s*\|/.exec(line);
    if (row) {
      const owner = sections.find((s) => s.id === Number(row[1]));
      if (owner) owner.questionCount += 1;
    }
  }
  sectionCache = sections;
  return sections;
}

/**
 * Coverage from the structured record — a single grouped read, no model call.
 *
 * A question counts as resolved once it carries any final status, `skipped`
 * included: a question the hiring manager explicitly declined is finished, not
 * missing, and the meter has to agree with the prompt's completion rules or it
 * will never reach the end of a real session. `partial` is the honest middle:
 * some of the section is resolved and some is not.
 */
async function derivedCoverage(
  conversationId: string,
  sections: Section[]
): Promise<SectionStatus[]> {
  const rollup = await sectionRollup(conversationId);
  const byId = new Map(rollup.map((r) => [r.sectionId, r]));
  return sections.map((s) => {
    const r = byId.get(s.id);
    const resolved = r?.resolved ?? 0;
    let status: SectionStatus["status"] = "missing";
    if (resolved > 0) {
      status = s.questionCount > 0 && resolved >= s.questionCount ? "covered" : "partial";
    }
    return { id: s.id, name: s.name, status };
  });
}

async function scoreCoverage(
  transcript: { role: string; content: string }[]
): Promise<SectionStatus[]> {
  const sections = questionnaireSections();
  const sectionList = sections.map((s) => `${s.id}. ${s.name}`).join("\n");
  // Bounding the prompt must never cost us an ANSWER. A plain tail-slice
  // dropped the oldest turns first — i.e. the earliest answered sections —
  // so on a long session the meter would start forgetting the beginning.
  // The hiring manager's turns are the evidence being scored and are kept
  // whole; the agent's turns are questions and generated documents, so those
  // are what get trimmed when a session runs long.
  const MAX_CHARS = 120_000;
  const rendered = transcript.map((m) => ({
    isUser: m.role === "user",
    text: `${m.role === "user" ? "HIRING MANAGER" : "AGENT"}: ${m.content}`,
  }));
  let budget = MAX_CHARS - rendered.reduce((n, r) => n + (r.isUser ? r.text.length : 0), 0);
  const convo = rendered
    .map((r) => {
      if (r.isUser) return r.text;
      if (budget <= 0) return "AGENT: […]";
      if (r.text.length <= budget) {
        budget -= r.text.length;
        return r.text;
      }
      const clipped = r.text.slice(0, Math.max(0, budget));
      budget = 0;
      return `${clipped} […]`;
    })
    .join("\n\n");

  const res = await getAnthropicClient().messages.create({
    model: METER_MODEL,
    max_tokens: 1500,
    system:
      "You audit a hiring-intake conversation against a questionnaire. For each numbered section, decide whether the hiring manager's side of the conversation (including any pasted/uploaded documents) provides its information: " +
      '"covered" (substantially answered), "partial" (some real information, clear gaps), or "missing" (nothing substantive). Being asked a question does not count — only answers do. ' +
      'Reply with JSON only: {"sections":[{"id":<number>,"status":"covered"|"partial"|"missing"}]} with exactly one entry per section.',
    messages: [
      { role: "user", content: `Questionnaire sections:\n${sectionList}\n\nConversation:\n${convo}` },
    ],
  });
  const text = res.content.find((b) => b.type === "text");
  const raw = text && text.type === "text" ? text.text : "{}";
  const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
    sections?: { id: number; status: string }[];
  };
  const byId = new Map((parsed.sections ?? []).map((s) => [s.id, s.status]));
  return sections.map((s) => {
    const st = byId.get(s.id);
    return {
      ...s,
      status: st === "covered" || st === "partial" ? (st as "covered" | "partial") : "missing",
    };
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // Project membership, not ownership (ADR-008) — a collaborator watching
  // the intake meter climb is exactly the shared-board case.
  const access = await getConversationAccess(id, user);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = db();
  const [conv] = await d
    .select()
    .from(tables.conversations)
    .where(eq(tables.conversations.id, id))
    .limit(1);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (conv.agentSlug !== "job-description") {
    return NextResponse.json({ error: "Coverage meter is JD-only for now" }, { status: 400 });
  }

  const sectionList = questionnaireSections();

  // Preferred path: the agent's own record of what it has been told. It is
  // deterministic, free, needs no cache, and cannot score a section DOWN —
  // which is the whole reason mergeCoverage's ratchet existed.
  if (await hasIntakeAnswers(id)) {
    const sections = await derivedCoverage(id, sectionList);
    return NextResponse.json({ sections, cached: false, source: "answers" });
  }

  // Fallback for conversations that started before the answers store existed
  // and have no rows to derive from. Nothing is backfilled, so this stays
  // until those sessions end; new sessions never reach it.
  const msgs = await d
    .select({ role: tables.messages.role, content: tables.messages.content })
    .from(tables.messages)
    .where(eq(tables.messages.conversationId, id))
    .orderBy(asc(tables.messages.seq));

  if (conv.coverage && conv.coverageSeq === msgs.length) {
    return NextResponse.json({ sections: conv.coverage, cached: true, source: "scorer" });
  }
  if (msgs.filter((m) => m.role === "user").length === 0) {
    const empty = sectionList.map((s) => ({
      id: s.id,
      name: s.name,
      status: "missing" as const,
    }));
    return NextResponse.json({ sections: empty, cached: false, source: "empty" });
  }

  try {
    const scored = await scoreCoverage(msgs);
    // Ratchet against the previous result — see mergeCoverage for why.
    const previous = (conv.coverage as SectionStatus[] | null) ?? [];
    const sections = mergeCoverage(previous, scored);
    await d
      .update(tables.conversations)
      .set({ coverage: sections, coverageSeq: msgs.length })
      .where(eq(tables.conversations.id, id));
    return NextResponse.json({ sections, cached: false, source: "scorer" });
  } catch (err) {
    console.error("[coverage]", err);
    return NextResponse.json({ error: "Coverage scoring failed" }, { status: 500 });
  }
}
