import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import {
  requireUser,
  dbEnabled,
  getProjectAccess,
  canWrite,
} from "@/shared/current-user";

/**
 * Request changes on a draft (#3d step 1).
 *
 * v1 is a free-text note rather than the inline comment-on-a-line markup of
 * `#2d` (deferred, Dana 2026-07-26). The note is logged to the same
 * append-only trail as approvals — so the revision loop is auditable, not
 * just the sign-off — and returned so the drawer can drop it straight into
 * the agent conversation as the next user turn.
 *
 * This never mutates the artifact: the agent's revision is saved as a NEW
 * version, which is what makes the version chips on the board meaningful.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 4000) : "";
  if (!note) {
    return NextResponse.json(
      { error: "Describe what should change so the agent can revise it." },
      { status: 400 }
    );
  }

  const d = db();
  const [artifact] = await d
    .select({
      id: tables.artifacts.id,
      projectId: tables.artifacts.projectId,
      agentSlug: tables.artifacts.agentSlug,
      version: tables.artifacts.version,
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

  await d.insert(tables.artifactApprovals).values({
    artifactId: id,
    action: "changes_requested",
    note,
    actorId: user.id,
  });

  return NextResponse.json({
    logged: true,
    agentSlug: artifact.agentSlug,
    version: artifact.version,
    // The exact turn the drawer sends to the agent next.
    prompt: `Please revise the ${artifact.agentSlug === "job-description" ? "job description" : "artifact"} (v${artifact.version}). Requested changes:\n\n${note}`,
  });
}
