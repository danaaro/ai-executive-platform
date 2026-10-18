import { tenantRoute } from "@/shared/tenant-route";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser, dbEnabled, getUserNames, inviteToCompany } from "@/shared/current-user";
import { openRole } from "@/shared/open-role";
import { deriveStages, PHASE_1_STAGES } from "@/orchestrator/stages";
import { creditBalance } from "@/shared/credits";

/**
 * Home (#4b) — "Your hiring positions", split into what you own and what was
 * shared with you (ADR-008). Each card carries a compact stage rollup so the
 * 4-node mini progress indicator renders without an N+1 fetch per card.
 */
export const GET = tenantRoute(async function GET(_req: NextRequest) {
  if (!dbEnabled()) return NextResponse.json({ owned: [], shared: [] });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const d = db();
  const isAdmin = user.role === "admin";
  // ADR-010: no company in this session → no customer data at all.
  if (!user.companyId) {
    return NextResponse.json({ isAdmin, noCompany: true, owned: [], shared: [] });
  }
  const inCompany = eq(tables.projects.companyId, user.companyId);

  // This user's membership rows, so each shared card can show the viewer's
  // own permission level without a second round trip.
  // Independent reads go out together (pipelined on the tenant connection):
  // every round trip to the database costs tens of milliseconds.
  const membershipsQ = d
    .select({
      projectId: tables.projectMembers.projectId,
      role: tables.projectMembers.role,
    })
    .from(tables.projectMembers)
    .where(eq(tables.projectMembers.userId, user.id));

  const columns = {
    id: tables.projects.id,
    title: tables.projects.title,
    status: tables.projects.status,
    createdBy: tables.projects.createdBy,
    createdAt: tables.projects.createdAt,
    updatedAt: tables.projects.updatedAt,
  };

  const rowsQ = isAdmin
    ? d.select(columns).from(tables.projects).where(inCompany).orderBy(desc(tables.projects.updatedAt))
    : d
        .selectDistinct(columns)
        .from(tables.projects)
        .leftJoin(
          tables.projectMembers,
          eq(tables.projectMembers.projectId, tables.projects.id)
        )
        .where(
          and(
            inCompany,
            or(
              eq(tables.projects.createdBy, user.id),
              eq(tables.projectMembers.userId, user.id)
            )
          )
        )
        .orderBy(desc(tables.projects.updatedAt));

  // The company's own record — readable in this tenant scope (ADR-010 policy).
  const companyQ = d
    .select({ name: tables.companies.name })
    .from(tables.companies)
    .where(eq(tables.companies.id, user.companyId))
    .limit(1);

  const [memberships, rows, [company], credits] = await Promise.all([
    membershipsQ,
    rowsQ,
    companyQ,
    creditBalance(user.companyId),
  ]);
  const memberRole = new Map(memberships.map((m) => [m.projectId, m.role]));

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
    companyName: company?.name ?? null,
    credits,
    owned: projects.filter((p) => p.isOwner),
    shared: projects.filter((p) => !p.isOwner),
  });
});

/**
 * Open a role (ADR-011): spends one role credit and locks the title and salary
 * range, in ONE transaction (tenantRoute). The rules live in openRole(), shared
 * with the admin path that opens a role for a customer company.
 */
export const POST = tenantRoute(async function POST(req: NextRequest) {
  if (!dbEnabled()) {
    return NextResponse.json(
      { error: "Persistence is not configured (DATABASE_URL missing)." },
      { status: 503 }
    );
  }
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.companyId) {
    return NextResponse.json(
      { error: "Your account is not linked to a company yet." },
      { status: 403 }
    );
  }
  const companyId = user.companyId;
  const r = await openRole({
    companyId,
    actor: { id: user.id, email: user.email },
    body: await req.json().catch(() => ({})),
    onBehalf: false,
    invite: (email) => inviteToCompany(companyId, email, user.id),
  });
  return NextResponse.json(r.json, { status: r.status });
});
