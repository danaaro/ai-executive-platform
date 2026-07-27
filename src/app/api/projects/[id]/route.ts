import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import {
  requireUser,
  dbEnabled,
  getProjectAccess,
  canAdminister,
  canWrite,
  getUserNames,
} from "@/shared/current-user";
import { deriveStages } from "@/orchestrator/stages";

/**
 * Board (#1b) — everything one hiring position needs in a single fetch:
 * the project, its derived stage pipeline (status, versions, thread, gating
 * warnings, inheritance), and its collaborators.
 *
 * Stage state is derived by `src/orchestrator/stages.ts`, the same function
 * the Home list uses, so the mini indicator and the board can never disagree.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const role = await getProjectAccess(id, user);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = db();
  const [project] = await d
    .select()
    .from(tables.projects)
    .where(eq(tables.projects.id, id))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [artifactRows, conversationRows, memberRows] = await Promise.all([
    d
      .select({
        id: tables.artifacts.id,
        agentSlug: tables.artifacts.agentSlug,
        version: tables.artifacts.version,
        label: tables.artifacts.label,
        status: tables.artifacts.status,
        createdAt: tables.artifacts.createdAt,
      })
      .from(tables.artifacts)
      .where(eq(tables.artifacts.projectId, id))
      .orderBy(desc(tables.artifacts.version)),
    d
      .select({
        id: tables.conversations.id,
        agentSlug: tables.conversations.agentSlug,
        title: tables.conversations.title,
        updatedAt: tables.conversations.updatedAt,
      })
      .from(tables.conversations)
      .where(eq(tables.conversations.projectId, id))
      .orderBy(desc(tables.conversations.updatedAt)),
    d
      .select({
        id: tables.projectMembers.id,
        userId: tables.projectMembers.userId,
        invitedEmail: tables.projectMembers.invitedEmail,
        role: tables.projectMembers.role,
        acceptedAt: tables.projectMembers.acceptedAt,
      })
      .from(tables.projectMembers)
      .where(eq(tables.projectMembers.projectId, id)),
  ]);

  const names = await getUserNames([
    project.createdBy,
    ...memberRows.map((m) => m.userId).filter((x): x is string => Boolean(x)),
  ]);

  const stages = deriveStages({
    artifacts: artifactRows,
    conversations: conversationRows,
  });

  return NextResponse.json({
    project: { ...project, ownerName: names[project.createdBy] ?? project.createdBy },
    viewerRole: role,
    canWrite: canWrite(role),
    canAdminister: canAdminister(role),
    stages,
    conversations: conversationRows,
    members: memberRows.map((m) => ({
      id: m.id,
      name: m.userId ? names[m.userId] ?? m.userId : m.invitedEmail,
      role: m.role,
      pending: !m.userId,
    })),
  });
}

/**
 * Status changes (`open / draft / filled / archived` chips on #4b) and
 * retitling. Owner or admin only — an editor may work inside a position but
 * not redefine or close it.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const role = await getProjectAccess(id, user);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAdminister(role)) {
    return NextResponse.json(
      { error: "Only the position owner can change its status" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const update: { status?: "open" | "draft" | "filled" | "archived"; title?: string; updatedAt: Date } =
    { updatedAt: new Date() };

  if (body.status !== undefined) {
    if (!["open", "draft", "filled", "archived"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status;
  }
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    update.title = title;
  }

  const [row] = await db()
    .update(tables.projects)
    .set(update)
    .where(eq(tables.projects.id, id))
    .returning({
      id: tables.projects.id,
      title: tables.projects.title,
      status: tables.projects.status,
    });

  return NextResponse.json({ project: row });
}

/** Invite a collaborator to an existing position. Owner or admin only. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const role = await getProjectAccess(id, user);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAdminister(role)) {
    return NextResponse.json({ error: "Only the position owner can invite" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  const memberRole = body.role === "editor" ? "editor" : "viewer";

  const d = db();
  // If they already have an account, bind the membership immediately rather
  // than leaving it pending — the invite flow should not make an existing
  // user wait for a sign-in that already happened.
  const [existing] = await d
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.email, email))
    .limit(1);

  await d
    .insert(tables.projectMembers)
    .values({
      projectId: id,
      userId: existing?.id ?? null,
      invitedEmail: email,
      role: memberRole,
      invitedBy: user.id,
      acceptedAt: existing ? new Date() : null,
    })
    .onConflictDoNothing();

  return NextResponse.json({ invited: email, role: memberRole, pending: !existing });
}

/** Remove a collaborator. Owner or admin only; the owner cannot be removed. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const role = await getProjectAccess(id, user);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAdminister(role)) {
    return NextResponse.json({ error: "Only the position owner can remove access" }, { status: 403 });
  }

  const memberId = req.nextUrl.searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId is required" }, { status: 400 });

  await db()
    .delete(tables.projectMembers)
    .where(
      and(
        eq(tables.projectMembers.id, memberId),
        eq(tables.projectMembers.projectId, id),
        // Never strip the owner's own row.
        inArray(tables.projectMembers.role, ["editor", "viewer"])
      )
    );

  return NextResponse.json({ removed: true });
}
