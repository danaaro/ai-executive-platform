import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql as rawSql } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser, dbEnabled, getUserNames } from "@/shared/current-user";

/**
 * Projects (ADR-007) — the unique key everything else hangs off. Lists own
 * projects for members, everyone's for admins, each with an artifact count
 * so the dashboard can show "how much is in here" without a second fetch.
 */
export async function GET(req: NextRequest) {
  if (!dbEnabled()) return NextResponse.json({ projects: [] });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const d = db();
  let q = d
    .select({
      id: tables.projects.id,
      title: tables.projects.title,
      status: tables.projects.status,
      createdBy: tables.projects.createdBy,
      createdAt: tables.projects.createdAt,
      updatedAt: tables.projects.updatedAt,
      artifactCount: rawSql<number>`count(${tables.artifacts.id})`.as("artifact_count"),
    })
    .from(tables.projects)
    .leftJoin(tables.artifacts, eq(tables.artifacts.projectId, tables.projects.id))
    .groupBy(tables.projects.id)
    .orderBy(desc(tables.projects.updatedAt))
    .$dynamic();
  if (user.role !== "admin") {
    q = q.where(eq(tables.projects.createdBy, user.id));
  }
  const rows = await q;
  const names = await getUserNames(rows.map((r) => r.createdBy));

  return NextResponse.json({
    isAdmin: user.role === "admin",
    projects: rows.map((r) => ({
      ...r,
      artifactCount: Number(r.artifactCount),
      createdBy: names[r.createdBy] ?? r.createdBy,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!dbEnabled()) {
    return NextResponse.json(
      { error: "Persistence is not configured (DATABASE_URL missing)." },
      { status: 503 }
    );
  }
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const title: string = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const [row] = await db()
    .insert(tables.projects)
    .values({ title, createdBy: user.id })
    .returning({ id: tables.projects.id, title: tables.projects.title });

  return NextResponse.json({ project: row });
}
