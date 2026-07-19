import { NextRequest, NextResponse } from "next/server";
import { eq, max } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser, dbEnabled } from "@/shared/current-user";

/**
 * Appends a single turn to a conversation the caller owns. Used by the voice
 * UI to persist every spoken turn the moment it is transcribed (voice
 * continuity fix, 2026-07-19) — the transcript lives in Postgres before the
 * audio finishes playing, so a dropped call loses nothing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const role = body?.role;
  const content = typeof body?.content === "string" ? body.content.slice(0, 20_000) : "";
  if ((role !== "user" && role !== "assistant") || !content.trim()) {
    return NextResponse.json({ error: "role (user|assistant) and content are required" }, { status: 400 });
  }

  const d = db();
  const [conv] = await d
    .select({ createdBy: tables.conversations.createdBy })
    .from(tables.conversations)
    .where(eq(tables.conversations.id, id))
    .limit(1);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (conv.createdBy !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [agg] = await d
    .select({ maxSeq: max(tables.messages.seq) })
    .from(tables.messages)
    .where(eq(tables.messages.conversationId, id));
  const seq = agg.maxSeq === null ? 0 : agg.maxSeq + 1;

  await d.insert(tables.messages).values({ conversationId: id, seq, role, content });
  await d
    .update(tables.conversations)
    .set({ updatedAt: new Date() })
    .where(eq(tables.conversations.id, id));

  return NextResponse.json({ saved: true, seq });
}
