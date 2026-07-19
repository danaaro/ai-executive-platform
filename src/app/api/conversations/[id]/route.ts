import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser, dbEnabled } from "@/shared/current-user";

/** Returns one conversation's messages — owner or admin only. */
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

  const msgs = await d
    .select()
    .from(tables.messages)
    .where(eq(tables.messages.conversationId, id))
    .orderBy(tables.messages.seq);

  return NextResponse.json({
    id: conv.id,
    agentSlug: conv.agentSlug,
    title: conv.title,
    messages: msgs.map((m) => ({ role: m.role, content: m.content })),
  });
}
