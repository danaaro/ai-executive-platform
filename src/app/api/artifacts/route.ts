import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser, dbEnabled, getUserNames } from "@/shared/current-user";

/**
 * Lists artifacts (own for members, all for admins). ?full=1&id=<uuid>
 * returns a single artifact with content.
 */
export async function GET(req: NextRequest) {
  if (!dbEnabled()) return NextResponse.json({ artifacts: [] });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const d = db();
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const [row] = await d
      .select()
      .from(tables.artifacts)
      .where(eq(tables.artifacts.id, id))
      .limit(1);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (row.createdBy !== user.id && user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ artifact: row });
  }

  let q = d
    .select({
      id: tables.artifacts.id,
      agentSlug: tables.artifacts.agentSlug,
      version: tables.artifacts.version,
      label: tables.artifacts.label,
      status: tables.artifacts.status,
      createdBy: tables.artifacts.createdBy,
      createdAt: tables.artifacts.createdAt,
    })
    .from(tables.artifacts)
    .orderBy(desc(tables.artifacts.createdAt))
    .limit(200)
    .$dynamic();
  if (user.role !== "admin") {
    q = q.where(eq(tables.artifacts.createdBy, user.id));
  }
  const rows = await q;
  const names = await getUserNames(rows.map((r) => r.createdBy));

  return NextResponse.json({
    isAdmin: user.role === "admin",
    artifacts: rows.map((r) => ({
      ...r,
      createdBy: names[r.createdBy] ?? r.createdBy,
    })),
  });
}
