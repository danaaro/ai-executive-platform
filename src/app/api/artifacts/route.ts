import { NextRequest, NextResponse } from "next/server";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import {
  requireUser,
  dbEnabled,
  getUserNames,
  getProjectAccess,
  canWrite,
  accessibleProjectIds,
} from "@/shared/current-user";

/**
 * Artifact library. Access is derived from the PROJECT (ADR-008 §6), not
 * from `artifacts.createdBy` — a collaborator who can see a stage on the
 * board must be able to open the artifact behind it. `createdBy` survives
 * only as provenance.
 *
 * `?id=<uuid>` returns one artifact with its content and approval trail.
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

    const role = await getProjectAccess(row.projectId, user);
    if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // The oversight trail, shown in the review panel as "approved by X on Y".
    const trail = await d
      .select({
        action: tables.artifactApprovals.action,
        note: tables.artifactApprovals.note,
        actorId: tables.artifactApprovals.actorId,
        createdAt: tables.artifactApprovals.createdAt,
      })
      .from(tables.artifactApprovals)
      .where(eq(tables.artifactApprovals.artifactId, id))
      .orderBy(asc(tables.artifactApprovals.createdAt));

    const names = await getUserNames([row.createdBy, ...trail.map((t) => t.actorId)]);

    return NextResponse.json({
      artifact: { ...row, createdByName: names[row.createdBy] ?? row.createdBy },
      canWrite: canWrite(role),
      approvals: trail.map((t) => ({
        ...t,
        actorName: names[t.actorId] ?? t.actorId,
      })),
    });
  }

  const projectFilter = req.nextUrl.searchParams.get("project");
  const allowed = await accessibleProjectIds(user);

  // `allowed === null` means platform admin — unfiltered, NOT empty.
  let scope: string[] | null = allowed;
  if (projectFilter) {
    if (allowed !== null && !allowed.includes(projectFilter)) {
      return NextResponse.json({ isAdmin: false, artifacts: [] });
    }
    scope = [projectFilter];
  }
  if (scope !== null && scope.length === 0) {
    return NextResponse.json({ isAdmin: user.role === "admin", artifacts: [] });
  }

  let q = d
    .select({
      id: tables.artifacts.id,
      projectId: tables.artifacts.projectId,
      agentSlug: tables.artifacts.agentSlug,
      version: tables.artifacts.version,
      label: tables.artifacts.label,
      status: tables.artifacts.status,
      createdBy: tables.artifacts.createdBy,
      createdAt: tables.artifacts.createdAt,
      projectTitle: tables.projects.title,
    })
    .from(tables.artifacts)
    .innerJoin(tables.projects, eq(tables.projects.id, tables.artifacts.projectId))
    .orderBy(desc(tables.artifacts.createdAt))
    .limit(200)
    .$dynamic();

  if (scope !== null) q = q.where(inArray(tables.artifacts.projectId, scope));
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
