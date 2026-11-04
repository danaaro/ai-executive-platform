import { tenantRoute } from "@/shared/tenant-route";
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
  projectCompanyId,
  inviteToCompany,
} from "@/shared/current-user";
import { deriveStages } from "@/orchestrator/stages";
import { logAdminAction } from "@/shared/credits";
import { applyTitleToDocuments } from "@/shared/role-rename";

/**
 * Board (#1b) — everything one hiring position needs in a single fetch:
 * the project, its derived stage pipeline (status, versions, thread, gating
 * warnings, inheritance), and its collaborators.
 *
 * Stage state is derived by `src/orchestrator/stages.ts`, the same function
 * the Home list uses, so the mini indicator and the board can never disagree.
 */
export const GET = tenantRoute(async function GET(
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
  // One batch (pipelined): the role and everything hanging off it.
  const [[project], artifactRows, conversationRows, memberRows] = await Promise.all([
    d.select().from(tables.projects).where(eq(tables.projects.id, id)).limit(1),
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
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    // Step 2: newest interview kit version (0 = none yet).
    kitVersion: artifactRows.filter((r) => r.agentSlug === "interview-kit").reduce((m, r) => Math.max(m, r.version), 0),
    stages,
    conversations: conversationRows,
    members: memberRows.map((m) => ({
      id: m.id,
      name: m.userId ? names[m.userId] ?? m.userId : m.invitedEmail,
      role: m.role,
      pending: !m.userId,
    })),
  });
});

/**
 * Status changes (`open / draft / filled / archived` chips on #4b), and
 * corrections to the locked role facts.
 *
 * - Status: owner or super admin; archiving and restoring an archived role
 *   are super admins only (Dana 2026-11-01). Archiving never refunds the
 *   credit: super admins adjust credits by hand on the company account page.
 * - Title, salary range, currency and "show salary": locked once the role is
 *   opened (ADR-011: a different role needs a new credit), EXCEPT for super
 *   admins, who correct mistakes such as a misspelt title (Dana 2026-11-01).
 *   Every correction is logged with the old and new values. With
 *   `applyTitleToDocuments`, the newest JD and kit get a new version carrying
 *   the new title (src/shared/role-rename.ts).
 */
export const PATCH = tenantRoute(async function PATCH(
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
  const superAdmin = user.role === "admin";

  const body = await req.json().catch(() => ({}));
  const [current] = await db()
    .select({
      title: tables.projects.title,
      status: tables.projects.status,
      salaryMin: tables.projects.salaryMin,
      salaryMax: tables.projects.salaryMax,
      salaryCurrency: tables.projects.salaryCurrency,
      showSalaryOnJd: tables.projects.showSalaryOnJd,
    })
    .from(tables.projects)
    .where(eq(tables.projects.id, id))
    .limit(1);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const update: {
    status?: "open" | "draft" | "filled" | "archived";
    title?: string;
    salaryMin?: number;
    salaryMax?: number;
    salaryCurrency?: string;
    showSalaryOnJd?: boolean;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (body.status !== undefined) {
    if (!["open", "draft", "filled", "archived"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const touchesArchive = body.status === "archived" || current.status === "archived";
    if (touchesArchive && !superAdmin && body.status !== current.status) {
      return NextResponse.json({ error: "Only Exec10X admins can archive or restore a role" }, { status: 403 });
    }
    update.status = body.status;
  }

  const locked = ["title", "salaryMin", "salaryMax", "salaryCurrency", "showSalaryOnJd"].filter((k) => body[k] !== undefined);
  if (locked.length > 0) {
    if (!superAdmin) {
      return NextResponse.json(
        { error: "The role title and salary range are locked once the role is opened. Ask Exec10X to correct them." },
        { status: 400 }
      );
    }
    if (body.title !== undefined) {
      const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim() : "";
      if (title.length < 2 || title.length > 200) {
        return NextResponse.json({ error: "The title must be 2 to 200 characters" }, { status: 400 });
      }
      update.title = title;
    }
    const money = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100_000_000 ? (v as number) : null);
    if (body.salaryMin !== undefined) {
      const v = money(body.salaryMin);
      if (v === null) return NextResponse.json({ error: "Invalid minimum salary" }, { status: 400 });
      update.salaryMin = v;
    }
    if (body.salaryMax !== undefined) {
      const v = money(body.salaryMax);
      if (v === null) return NextResponse.json({ error: "Invalid maximum salary" }, { status: 400 });
      update.salaryMax = v;
    }
    const min = update.salaryMin ?? current.salaryMin;
    const max = update.salaryMax ?? current.salaryMax;
    if (min !== null && max !== null && min > max) {
      return NextResponse.json({ error: "The minimum salary is above the maximum" }, { status: 400 });
    }
    if (body.salaryCurrency !== undefined) {
      if (typeof body.salaryCurrency !== "string" || !/^[A-Za-z]{3}$/.test(body.salaryCurrency)) {
        return NextResponse.json({ error: "Currency must be a 3-letter code" }, { status: 400 });
      }
      update.salaryCurrency = body.salaryCurrency.toUpperCase();
    }
    if (body.showSalaryOnJd !== undefined) {
      if (typeof body.showSalaryOnJd !== "boolean") return NextResponse.json({ error: "Invalid value" }, { status: 400 });
      update.showSalaryOnJd = body.showSalaryOnJd;
    }
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

  let documents: Awaited<ReturnType<typeof applyTitleToDocuments>> | null = null;
  if (update.title && update.title !== current.title && body.applyTitleToDocuments === true) {
    documents = await applyTitleToDocuments(id, current.title, update.title, user);
  }

  if (superAdmin && (locked.length > 0 || update.status === "archived" || current.status === "archived")) {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of [...locked, ...(update.status ? ["status"] : [])]) {
      const from = current[k as keyof typeof current];
      const to = update[k as keyof typeof update];
      if (from !== to) changes[k] = { from, to };
    }
    if (Object.keys(changes).length > 0) {
      await logAdminAction({
        adminUserId: user.id,
        action: update.status === "archived" && current.status !== "archived" ? "role.archive" : "role.edit",
        companyId: user.companyId,
        details: { projectId: id, changes, reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : null, documents },
      });
    }
  }

  return NextResponse.json({ project: row, documents });
});

/** Invite a collaborator to an existing position. Owner or admin only. */
export const POST = tenantRoute(async function POST(
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

  const companyId = await projectCompanyId(id);
  if (!companyId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await d
    .insert(tables.projectMembers)
    .values({
      companyId,
      projectId: id,
      userId: existing?.id ?? null,
      invitedEmail: email,
      role: memberRole,
      invitedBy: user.id,
      acceptedAt: existing ? new Date() : null,
    })
    .onConflictDoNothing();

  // Invitees must be in the company to reach the role (ADR-010).
  const orgInvite = await inviteToCompany(companyId, email, user.id);

  return NextResponse.json({ invited: email, role: memberRole, pending: !existing, orgInvite });
});

/** Remove a collaborator. Owner or admin only; the owner cannot be removed. */
export const DELETE = tenantRoute(async function DELETE(
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
});
