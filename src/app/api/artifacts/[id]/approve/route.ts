import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import {
  requireUser,
  dbEnabled,
  getProjectAccess,
  canWrite,
} from "@/shared/current-user";

/**
 * Approve an artifact (ADR-008 §7) — the moment a draft becomes the version
 * that feeds downstream agents (#3d).
 *
 * Two rules make the chain unambiguous:
 *  - only the LATEST version in a (project, agent) slot may be approved.
 *    Approving history would leave "which one feeds downstream?" undefined.
 *  - every approval writes an append-only `artifact_approvals` row. That log
 *    is the EU AI Act human-oversight record, not a UI convenience.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const d = db();

  const [artifact] = await d
    .select({
      id: tables.artifacts.id,
      projectId: tables.artifacts.projectId,
      agentSlug: tables.artifacts.agentSlug,
      version: tables.artifacts.version,
      status: tables.artifacts.status,
    })
    .from(tables.artifacts)
    .where(eq(tables.artifacts.id, id))
    .limit(1);
  if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await getProjectAccess(artifact.projectId, user);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canWrite(role)) {
    return NextResponse.json(
      { error: "You have view-only access to this position" },
      { status: 403 }
    );
  }

  const [latest] = await d
    .select({ version: tables.artifacts.version })
    .from(tables.artifacts)
    .where(
      and(
        eq(tables.artifacts.projectId, artifact.projectId),
        eq(tables.artifacts.agentSlug, artifact.agentSlug)
      )
    )
    .orderBy(desc(tables.artifacts.version))
    .limit(1);

  if (latest && latest.version !== artifact.version) {
    return NextResponse.json(
      {
        error: `Only the latest version can be approved — this is v${artifact.version}, the slot is at v${latest.version}.`,
      },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note.slice(0, 2000) : null;

  // Idempotent: re-approving an already-approved version is a no-op on the
  // artifact, but still records that a second person signed off.
  if (artifact.status !== "approved") {
    await d
      .update(tables.artifacts)
      .set({ status: "approved" })
      .where(eq(tables.artifacts.id, id));
  }

  await d.insert(tables.artifactApprovals).values({
    artifactId: id,
    action: "approved",
    note,
    actorId: user.id,
  });

  await d
    .update(tables.projects)
    .set({ updatedAt: new Date() })
    .where(eq(tables.projects.id, artifact.projectId));

  return NextResponse.json({
    approved: true,
    id,
    agentSlug: artifact.agentSlug,
    version: artifact.version,
  });
}
