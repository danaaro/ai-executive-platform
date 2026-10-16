import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import {
  requireUser,
  dbEnabled,
  getUserNames,
  accessibleProjectIds,
} from "@/shared/current-user";

/**
 * Lists conversations visible to the caller. Scoped by PROJECT membership
 * (ADR-008), not by `createdBy` — a shared position's threads belong to
 * everyone working it.
 */
export async function GET(req: NextRequest) {
  if (!dbEnabled()) return NextResponse.json({ conversations: [] });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agent = req.nextUrl.searchParams.get("agent");
  const project = req.nextUrl.searchParams.get("project");

  const allowed = await accessibleProjectIds(user);
  // Always a list, always inside the user's company (ADR-010) — admins too.
  let scope: string[] = allowed;
  if (project) {
    if (!allowed.includes(project)) {
      return NextResponse.json({ isAdmin: false, conversations: [] });
    }
    scope = [project];
  }
  if (scope.length === 0) {
    return NextResponse.json({ isAdmin: user.role === "admin", conversations: [] });
  }

  const filters = [inArray(tables.conversations.projectId, scope)];
  if (agent) filters.push(eq(tables.conversations.agentSlug, agent));

  const rows = await db()
    .select()
    .from(tables.conversations)
    .where(and(...filters))
    .orderBy(desc(tables.conversations.updatedAt))
    .limit(50);

  const names = await getUserNames(rows.map((r) => r.createdBy));
  return NextResponse.json({
    isAdmin: user.role === "admin",
    conversations: rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      agentSlug: r.agentSlug,
      title: r.title,
      updatedAt: r.updatedAt,
      createdBy: names[r.createdBy] ?? r.createdBy,
      own: r.createdBy === user.id,
    })),
  });
}
