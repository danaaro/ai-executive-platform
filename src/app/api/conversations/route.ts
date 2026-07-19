import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser, dbEnabled, getUserNames } from "@/shared/current-user";

/** Lists conversations — own for members, everyone's for admins. */
export async function GET(req: NextRequest) {
  if (!dbEnabled()) return NextResponse.json({ conversations: [] });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agent = req.nextUrl.searchParams.get("agent");
  const d = db();
  let q = d
    .select()
    .from(tables.conversations)
    .orderBy(desc(tables.conversations.updatedAt))
    .limit(50)
    .$dynamic();
  if (user.role !== "admin") {
    q = q.where(eq(tables.conversations.createdBy, user.id));
  }
  let rows = await q;
  if (agent) rows = rows.filter((r) => r.agentSlug === agent);

  const names = await getUserNames(rows.map((r) => r.createdBy));
  return NextResponse.json({
    isAdmin: user.role === "admin",
    conversations: rows.map((r) => ({
      id: r.id,
      agentSlug: r.agentSlug,
      title: r.title,
      updatedAt: r.updatedAt,
      createdBy: names[r.createdBy] ?? r.createdBy,
      own: r.createdBy === user.id,
    })),
  });
}
