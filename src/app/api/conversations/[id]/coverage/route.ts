import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser, dbEnabled } from "@/shared/current-user";
import { getAnthropicClient } from "@/shared/anthropic-client";

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

type SectionStatus = { id: number; name: string; status: "covered" | "partial" | "missing" };

let sectionCache: { id: number; name: string }[] | null = null;
function questionnaireSections(): { id: number; name: string }[] {
  if (sectionCache) return sectionCache;
  const bank = fs.readFileSync(
    path.join(process.cwd(), "products/interview-intelligence/docs/job-description-question-bank.md"),
    "utf-8"
  );
  const sections: { id: number; name: string }[] = [];
  for (const m of bank.matchAll(/^## (\d+)\. (.+?)\s*(?:`|$)/gm)) {
    sections.push({ id: Number(m[1]), name: m[2].trim() });
  }
  sectionCache = sections;
  return sections;
}

async function scoreCoverage(
  transcript: { role: string; content: string }[]
): Promise<SectionStatus[]> {
  const sections = questionnaireSections();
  const sectionList = sections.map((s) => `${s.id}. ${s.name}`).join("\n");
  const convo = transcript
    .map((m) => `${m.role === "user" ? "HIRING MANAGER" : "AGENT"}: ${m.content}`)
    .join("\n\n")
    .slice(-120_000); // generous cap; keeps very long sessions bounded

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
  const d = db();
  const [conv] = await d
    .select()
    .from(tables.conversations)
    .where(eq(tables.conversations.id, id))
    .limit(1);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (conv.createdBy !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (conv.agentSlug !== "job-description") {
    return NextResponse.json({ error: "Coverage meter is JD-only for now" }, { status: 400 });
  }

  const msgs = await d
    .select({ role: tables.messages.role, content: tables.messages.content })
    .from(tables.messages)
    .where(eq(tables.messages.conversationId, id))
    .orderBy(asc(tables.messages.seq));

  if (conv.coverage && conv.coverageSeq === msgs.length) {
    return NextResponse.json({ sections: conv.coverage, cached: true });
  }
  if (msgs.filter((m) => m.role === "user").length === 0) {
    const empty = questionnaireSections().map((s) => ({ ...s, status: "missing" as const }));
    return NextResponse.json({ sections: empty, cached: false });
  }

  try {
    const sections = await scoreCoverage(msgs);
    await d
      .update(tables.conversations)
      .set({ coverage: sections, coverageSeq: msgs.length })
      .where(eq(tables.conversations.id, id));
    return NextResponse.json({ sections, cached: false });
  } catch (err) {
    console.error("[coverage]", err);
    return NextResponse.json({ error: "Coverage scoring failed" }, { status: 500 });
  }
}
