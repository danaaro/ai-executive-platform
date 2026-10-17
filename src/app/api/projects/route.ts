import { tenantRoute } from "@/shared/tenant-route";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser, dbEnabled, getUserNames, inviteToCompany } from "@/shared/current-user";
import { deriveStages, PHASE_1_STAGES } from "@/orchestrator/stages";
import { creditBalance, isCurrency, lockCompanyCredits } from "@/shared/credits";

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

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_SALARY = 100_000_000;

/**
 * Open a role (ADR-011): spends one role credit and locks the title and salary
 * range, in ONE transaction (tenantRoute). A per-company lock stops two
 * simultaneous requests from spending the same last credit; the database's own
 * policy only lets a customer insert a −1 spend for their own company.
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
  const companyId = user.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "Your account is not linked to a company yet." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title || title.length > 120) {
    return NextResponse.json({ error: "Give the role a title (up to 120 characters)." }, { status: 400 });
  }
  const salaryMin = Number(body.salaryMin);
  const salaryMax = Number(body.salaryMax);
  if (
    !Number.isInteger(salaryMin) ||
    !Number.isInteger(salaryMax) ||
    salaryMin <= 0 ||
    salaryMax < salaryMin ||
    salaryMax > MAX_SALARY
  ) {
    return NextResponse.json(
      { error: "Enter the annual base salary range as whole numbers, minimum first." },
      { status: 400 }
    );
  }
  if (!isCurrency(body.salaryCurrency)) {
    return NextResponse.json({ error: "Choose the salary currency." }, { status: 400 });
  }
  const salaryCurrency = body.salaryCurrency;
  const showSalaryOnJd = body.showSalaryOnJd === true;

  // The hiring manager approves the job description (enforced in JD v3):
  // the person opening the role, or a colleague by email.
  const self = (user.email ?? "").toLowerCase();
  const hmEmailRaw = body.hiringManagerEmail == null ? "" : String(body.hiringManagerEmail).trim().toLowerCase();
  const hmIsSelf = !hmEmailRaw || hmEmailRaw === self;
  if (!hmIsSelf && !EMAIL.test(hmEmailRaw)) {
    return NextResponse.json({ error: "Enter a valid email for the hiring manager." }, { status: 400 });
  }

  // Collaborators invited at creation (#4c). Invites are by email and may
  // precede the account — they bind to a Clerk id on first sign-in
  // (ADR-008 §2).
  const invites: { email: string; role: "editor" | "viewer" }[] = Array.isArray(body.invites)
    ? body.invites
        .slice(0, 20)
        .map((i: { email?: unknown; role?: unknown }) => ({
          email: String(i?.email ?? "")
            .trim()
            .toLowerCase(),
          role: i?.role === "editor" ? ("editor" as const) : ("viewer" as const),
        }))
        .filter((i: { email: string }) => EMAIL.test(i.email) && i.email !== self)
    : [];
  // The hiring manager always gets editor access to the role.
  if (!hmIsSelf && !invites.some((i) => i.email === hmEmailRaw)) {
    invites.push({ email: hmEmailRaw, role: "editor" });
  }

  const d = db();
  await lockCompanyCredits(companyId);
  const balance = await creditBalance(companyId);
  if (balance < 1) {
    return NextResponse.json(
      { error: "No role credits left — contact us to add more.", credits: balance },
      { status: 402 }
    );
  }

  let hiringManagerUserId: string | null = hmIsSelf ? user.id : null;
  if (!hmIsSelf) {
    // Already a user of this company? (Row-level security: own company only.)
    const [existing] = await d
      .select({ id: tables.users.id })
      .from(tables.users)
      .where(eq(tables.users.email, hmEmailRaw))
      .limit(1);
    hiringManagerUserId = existing?.id ?? null;
  }

  const [row] = await d
    .insert(tables.projects)
    .values({
      companyId,
      title,
      createdBy: user.id,
      salaryMin,
      salaryMax,
      salaryCurrency,
      showSalaryOnJd,
      hiringManagerUserId,
      hiringManagerEmail: hmIsSelf ? self || null : hmEmailRaw,
    })
    .returning({ id: tables.projects.id, title: tables.projects.title });

  await d.insert(tables.creditLedger).values({
    companyId,
    kind: "spend",
    delta: -1,
    projectId: row.id,
    note: title,
    createdBy: user.id,
  });

  // The creator's owner row. getProjectAccess() also treats `createdBy` as
  // owner, so this is belt-and-braces — but it keeps membership listings
  // complete, which is what the sharing UI reads.
  const memberValues = [
    {
      companyId,
      projectId: row.id,
      userId: user.id,
      role: "owner" as const,
      acceptedAt: new Date(),
    },
    ...invites.map((i) => ({
      companyId,
      projectId: row.id,
      invitedEmail: i.email,
      role: i.role,
      invitedBy: user.id,
    })),
  ];
  await d.insert(tables.projectMembers).values(memberValues).onConflictDoNothing();
  // Invitees must be in the company to reach the role (ADR-010).
  await Promise.all(invites.map((i) => inviteToCompany(companyId, i.email, user.id)));

  return NextResponse.json({ project: row, invited: invites.length, credits: balance - 1 });
});
