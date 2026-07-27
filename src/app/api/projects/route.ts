import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray, or } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser, dbEnabled, getUserNames } from "@/shared/current-user";
import { deriveStages, PHASE_1_STAGES } from "@/orchestrator/stages";

/**
 * Home (#4b) — "Your hiring positions", split into what you own and what was
 * shared with you (ADR-008). Each card carries a compact stage rollup so the
 * 4-node mini progress indicator renders without an N+1 fetch per card.
 */
export async function GET(_req: NextRequest) {
  if (!dbEnabled()) return NextResponse.json({ owned: [], shared: [] });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const d = db();
  const isAdmin = user.role === "admin";

  // This user's membership rows, so each shared card can show the viewer's
  // own permission level without a second round trip.
  const memberships = await d
    .select({
      projectId: tables.projectMembers.projectId,
      role: tables.projectMembers.role,
    })
    .from(tables.projectMembers)
    .where(eq(tables.projectMembers.userId, user.id));
  const memberRole = new Map(memberships.map((m) => [m.projectId, m.role]));

  const columns = {
    id: tables.projects.id,
    title: tables.projects.title,
    status: tables.projects.status,
    createdBy: tables.projects.createdBy,
    createdAt: tables.projects.createdAt,
    updatedAt: tables.projects.updatedAt,
  };

  const rows = isAdmin
    ? await d.select(columns).from(tables.projects).orderBy(desc(tables.projects.updatedAt))
    : await d
        .selectDistinct(columns)
        .from(tables.projects)
        .leftJoin(
          tables.projectMembers,
          eq(tables.projectMembers.projectId, tables.projects.id)
        )
        .where(
          or(
            eq(tables.projects.createdBy, user.id),
            eq(tables.projectMembers.userId, user.id)
          )
        )
        .orderBy(desc(tables.projects.updatedAt));

  const ids = rows.map((r) => r.id);
  const [artifactRows, conversationRows, names] = await Promise.all([
    ids.length
      ? d
          .select({
            id: tables.artifacts.id,
            projectId: tables.artifacts.projectId,
            agentSlug: tables.artifacts.agentSlug,
            version: tables.artifacts.version,
            label: tables.artifacts.label,
            status: tables.artifacts.status,
            createdAt: tables.artifacts.createdAt,
          })
          .from(tables.artifacts)
          .where(inArray(tables.artifacts.projectId, ids))
      : Promise.resolve([]),
    ids.length
      ? d
          .select({
            id: tables.conversations.id,
            projectId: tables.conversations.projectId,
            agentSlug: tables.conversations.agentSlug,
            title: tables.conversations.title,
            updatedAt: tables.conversations.updatedAt,
          })
          .from(tables.conversations)
          .where(inArray(tables.conversations.projectId, ids))
      : Promise.resolve([]),
    getUserNames(rows.map((r) => r.createdBy)),
  ]);

  const phase1 = new Set(PHASE_1_STAGES.map((s) => s.slug));

  const projects = rows.map((r) => {
    const stages = deriveStages({
      artifacts: artifactRows.filter((a) => a.projectId === r.id),
      conversations: conversationRows.filter((c) => c.projectId === r.id),
    }).filter((s) => phase1.has(s.slug));

    const isOwner = r.createdBy === user.id;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      ownerName: names[r.createdBy] ?? r.createdBy,
      isOwner,
      // What THIS viewer may do — the permission chip on a shared card.
      viewerRole: isOwner ? "owner" : isAdmin ? "admin" : memberRole.get(r.id) ?? "viewer",
      artifactCount: artifactRows.filter((a) => a.projectId === r.id).length,
      // Trimmed to what the mini indicator needs; the board fetches the rest.
      stages: stages.map((s) => ({
        slug: s.slug,
        name: s.name,
        status: s.status,
        version: s.latest?.version ?? null,
      })),
      doneCount: stages.filter((s) => s.status === "done").length,
      stageCount: stages.length,
    };
  });

  return NextResponse.json({
    isAdmin,
    owned: projects.filter((p) => p.isOwner),
    shared: projects.filter((p) => !p.isOwner),
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

  const body = await req.json().catch(() => ({}));
  const title: string = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // Collaborators invited at creation (#4c). Invites are by email and may
  // precede the account — they bind to a Clerk id on first sign-in
  // (ADR-008 §2).
  const invites: { email: string; role: "editor" | "viewer" }[] = Array.isArray(body.invites)
    ? body.invites
        .map((i: { email?: unknown; role?: unknown }) => ({
          email: String(i?.email ?? "")
            .trim()
            .toLowerCase(),
          role: i?.role === "editor" ? ("editor" as const) : ("viewer" as const),
        }))
        .filter((i: { email: string }) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.email))
    : [];

  const d = db();
  const [row] = await d
    .insert(tables.projects)
    .values({ title, createdBy: user.id })
    .returning({ id: tables.projects.id, title: tables.projects.title });

  // The creator's owner row. getProjectAccess() also treats `createdBy` as
  // owner, so this is belt-and-braces — but it keeps membership listings
  // complete, which is what the sharing UI reads.
  const memberValues = [
    {
      projectId: row.id,
      userId: user.id,
      role: "owner" as const,
      acceptedAt: new Date(),
    },
    ...invites
      .filter((i) => i.email !== (user.email ?? "").toLowerCase())
      .map((i) => ({
        projectId: row.id,
        invitedEmail: i.email,
        role: i.role,
        invitedBy: user.id,
      })),
  ];
  await d.insert(tables.projectMembers).values(memberValues).onConflictDoNothing();

  return NextResponse.json({ project: row, invited: invites.length });
}
