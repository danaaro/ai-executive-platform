import { errorSummary } from "@/shared/safe-log";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { and, eq, inArray, isNull, max, or, sql } from "drizzle-orm";
import { db, adminDb, withTenant, tables } from "@/db";

/**
 * Identity and authorization.
 *
 * Identity: Clerk is the source of truth; `publicMetadata.role === "admin"`
 * makes a platform admin. The `users` table is a mirror for joins and
 * listings. Role lookups are cached per process for 5 minutes.
 *
 * Tenancy (ADR-010): every user acts inside ONE customer company — the Clerk
 * Organization active in their session, resolved on the server to our
 * `companies` row. The company is never read from the request. Nothing of
 * another company is visible, admins included: platform admin (Dana, Susan)
 * is admin *within* their own company here; cross-company admin views get
 * their own audited path in the admin back office.
 *
 * Authorization: company first, then per-project membership (ADR-008), NOT
 * `createdBy`. `getProjectAccess()` is the single choke point — every route
 * touching project-scoped data goes through it. `createdBy` survives only as
 * provenance ("who made this"), never as permission.
 */

export type CurrentUser = {
  id: string;
  role: "admin" | "member";
  email: string | null;
  /** The customer company of this session, or null = sees no customer data. */
  companyId: string | null;
};
export type ProjectRole = "owner" | "editor" | "viewer" | "admin";

const cache = new Map<string, { user: CurrentUser; at: number }>();
const TTL = 5 * 60 * 1000;
/**
 * How long our own copy of a user (role, home company) is trusted before Clerk
 * is asked again. Each Clerk call costs ~0.4 s, so it is not made per request.
 * Consequence: revoking admin or removing someone from a company in Clerk takes
 * effect within this window.
 */
const SYNC_WINDOW = 10 * 60 * 1000;

export async function requireUser(): Promise<CurrentUser | null> {
  const { userId, orgId } = await auth();
  if (!userId) return null;

  // Keyed by organization too: switching company in the session must never
  // serve the previous company from cache.
  const key = `${userId}:${orgId ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.user;

  // Fast path: one database read — our synced copy, plus the session
  // organization's company when the session names one.
  const fresh = await fromRecentSync(userId, orgId ?? null);
  if (fresh) {
    cache.set(key, { user: fresh, at: Date.now() });
    return fresh;
  }

  const clerk = await clerkClient();
  const cu = await clerk.users.getUser(userId);
  const role = cu.publicMetadata?.role === "admin" ? "admin" : "member";
  const email = cu.emailAddresses[0]?.emailAddress ?? null;
  const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || null;
  const companyId = await resolveCompanyId(userId, orgId ?? null);

  // System mirror of the Clerk identity, before any tenant scope exists.
  const syncedAt = new Date();
  await adminDb()
    .insert(tables.users)
    .values({ id: userId, email, name, role, companyId, syncedAt })
    .onConflictDoUpdate({
      target: tables.users.id,
      // The home company only ever moves to a known company, never to null.
      set: companyId ? { email, name, role, companyId, syncedAt } : { email, name, role, syncedAt },
    });

  // Collaborators are invited by email before they have a Clerk id
  // (ADR-008 §2). There is no sign-in webhook, so binding happens here — on
  // the first authenticated request after the invite, at most once per
  // cache miss.
  if (email && companyId) await claimPendingInvites(userId, email, companyId);

  const user: CurrentUser = { id: userId, role, email, companyId };
  cache.set(key, { user, at: Date.now() });
  return user;
}

/**
 * The user as of the last Clerk sync, if that was within SYNC_WINDOW — in ONE
 * database round trip. With an organization in the session, the company is
 * that organization's (no row → no company, never a fallback). Without one,
 * the home company recorded at the last sync is used.
 */
async function fromRecentSync(userId: string, orgId: string | null): Promise<CurrentUser | null> {
  const [row] = await adminDb()
    .select({
      role: tables.users.role,
      email: tables.users.email,
      homeCompanyId: tables.users.companyId,
      syncedAt: tables.users.syncedAt,
      sessionCompanyId: tables.companies.id,
    })
    .from(tables.users)
    .leftJoin(tables.companies, eq(tables.companies.clerkOrgId, orgId ?? "__no_org__"))
    .where(eq(tables.users.id, userId))
    .limit(1);
  if (!row?.syncedAt || Date.now() - row.syncedAt.getTime() > SYNC_WINDOW) return null;
  return {
    id: userId,
    role: row.role,
    email: row.email,
    companyId: orgId ? (row.sessionCompanyId ?? null) : row.homeCompanyId,
  };
}

/**
 * The session's organization → our `companies` row.
 *
 * Normally the session carries an active organization. When it does not, Clerk
 * is asked (server-side) which organizations the user belongs to: exactly one
 * is unambiguous and used; none or several means no company until they pick
 * one. An organization with no `companies` row (not set up by an admin) also
 * resolves to null. Null always means "sees no customer data", never "sees all".
 */
async function resolveCompanyId(userId: string, orgId: string | null): Promise<string | null> {
  let clerkOrgId = orgId;
  if (!clerkOrgId) {
    try {
      const clerk = await clerkClient();
      const list = await clerk.users.getOrganizationMembershipList({ userId, limit: 2 });
      if (list.data.length === 1) clerkOrgId = list.data[0].organization.id;
    } catch (err) {
      console.warn("[tenancy] membership lookup failed — no company for this request:", errorSummary(err));
    }
  }
  if (!clerkOrgId) return null;
  const [row] = await adminDb()
    .select({ id: tables.companies.id })
    .from(tables.companies)
    .where(eq(tables.companies.clerkOrgId, clerkOrgId))
    .limit(1);
  return row?.id ?? null;
}

/** The Clerk organization behind a company — for organization invitations. */
export async function companyClerkOrgId(companyId: string): Promise<string | null> {
  const [row] = await adminDb()
    .select({ clerkOrgId: tables.companies.clerkOrgId })
    .from(tables.companies)
    .where(eq(tables.companies.id, companyId))
    .limit(1);
  return row?.clerkOrgId ?? null;
}

/**
 * Where an invitation link lands: our own sign-up page on the host serving
 * this request (app, preview or localhost). Without it Clerk sends people to
 * its hosted account pages instead of Exec10X (Dana 2026-10-18).
 */
export async function inviteRedirectUrl(): Promise<string | undefined> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return undefined;
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}/sign-up`;
  } catch {
    return undefined;
  }
}

/**
 * Invites an email address into the company's Clerk Organization, so a person
 * added to a role can actually reach it once they sign in (ADR-010: access
 * requires being in the company). Already a member or already invited counts
 * as success. Never throws — the role membership row is the record either way.
 */
export async function inviteToCompany(
  companyId: string,
  email: string,
  inviterUserId: string
): Promise<"invited" | "already" | "failed"> {
  try {
    const organizationId = await companyClerkOrgId(companyId);
    if (!organizationId) return "failed";
    const clerk = await clerkClient();
    await clerk.organizations.createOrganizationInvitation({
      organizationId,
      emailAddress: email,
      role: "org:member",
      inviterUserId,
      redirectUrl: await inviteRedirectUrl(),
    });
    return "invited";
  } catch (err) {
    const codes = ((err as { errors?: { code?: string }[] })?.errors ?? []).map((e) => e.code ?? "");
    if (codes.some((c) => /already|duplicate/.test(c))) return "already";
    console.warn("[tenancy] organization invitation failed:", codes.join(",") || "unknown error");
    return "failed";
  }
}

/** Owning company of a project — child rows copy it from here (ADR-010 §5). */
export async function projectCompanyId(projectId: string): Promise<string | null> {
  const [row] = await db()
    .select({ companyId: tables.projects.companyId })
    .from(tables.projects)
    .where(eq(tables.projects.id, projectId))
    .limit(1);
  return row?.companyId ?? null;
}

/**
 * Owning company of a conversation, read WITHOUT a tenant scope. Only for the
 * voice callback, whose conversation id comes from a grant our server signed
 * (voice-grant.ts) — there is no user session to take the company from.
 */
export async function trustedConversationCompanyId(conversationId: string): Promise<string | null> {
  return (await trustedConversation(conversationId))?.companyId ?? null;
}

/** The project of a conversation named by a signed voice grant (see above). */
export async function trustedConversationProjectId(conversationId: string): Promise<string | null> {
  return (await trustedConversation(conversationId))?.projectId ?? null;
}

// A conversation's company and project never change, so voice turns look them
// up once per process instead of on every spoken turn.
const conversationOwners = new Map<string, { companyId: string; projectId: string }>();
async function trustedConversation(conversationId: string) {
  const hit = conversationOwners.get(conversationId);
  if (hit) return hit;
  const [row] = await adminDb()
    .select({ companyId: tables.conversations.companyId, projectId: tables.conversations.projectId })
    .from(tables.conversations)
    .where(eq(tables.conversations.id, conversationId))
    .limit(1);
  if (row) conversationOwners.set(conversationId, row);
  return row ?? null;
}

/** Owning company of a conversation — messages and answers copy it from here. */
export async function conversationCompanyId(conversationId: string): Promise<string | null> {
  const [row] = await db()
    .select({ companyId: tables.conversations.companyId })
    .from(tables.conversations)
    .where(eq(tables.conversations.id, conversationId))
    .limit(1);
  return row?.companyId ?? null;
}

/**
 * Platform admins only (Dana + Susan) — the gate for internal tools such as
 * Company Intelligence (ADR-009). Customers never get a link to these; this is
 * the server-side guard behind that, not a UX surface.
 */
export async function requireAdmin(): Promise<CurrentUser | null> {
  const user = await requireUser();
  return user?.role === "admin" ? user : null;
}

async function claimPendingInvites(userId: string, email: string, companyId: string): Promise<void> {
  try {
    // Only invitations of the company this session belongs to (ADR-010).
    await withTenant(companyId, () => db()
      .update(tables.projectMembers)
      .set({ userId, acceptedAt: new Date() })
      .where(
        and(
          isNull(tables.projectMembers.userId),
          // Case-insensitive: the inviter types what they remember, Clerk
          // stores what the identity provider returned.
          sql`lower(${tables.projectMembers.invitedEmail}) = ${email.toLowerCase()}`
        )
      ));
  } catch (err) {
    // A unique collision here means they are already a member of that
    // project via another row — never a reason to fail the request.
    console.warn("[invites] claim failed (non-fatal):", errorSummary(err));
  }
}

export async function getUserNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  // Display names only, for ids the caller already holds legitimately.
  const rows = await adminDb()
    .select({ id: tables.users.id, name: tables.users.name, email: tables.users.email })
    .from(tables.users)
    .where(inArray(tables.users.id, unique));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.id] = r.name || r.email || r.id;
  return map;
}

export function isPersistableAgent(slug: string): boolean {
  // ADR-006 §5: only candidate-agnostic agents persist conversations —
  // candidate-scoped chats (CVs, transcripts) stay ephemeral until Phase 2.
  // These are exactly the agents that live inside a project (ADR-007).
  return [
    "job-description",
    "competency-builder",
    "panel-designer",
    "interview-system-builder",
    "screening-guide",
  ].includes(slug);
}

export const dbEnabled = () => Boolean(process.env.DATABASE_URL);

/* -------------------------------------------------------------------------
 * Project authorization (ADR-008)
 * ---------------------------------------------------------------------- */

/**
 * Resolves what `user` may do in `projectId`, or null if the project does not
 * exist or they have no access at all.
 *
 * Admins are deliberately NOT member rows — platform admin comes from Clerk
 * and outranks membership, so it is resolved here rather than duplicated
 * into the table. The project creator is always treated as owner even if the
 * backfill has not run, so a missing member row can never lock someone out
 * of their own project.
 */
export async function getProjectAccess(
  projectId: string,
  user: CurrentUser
): Promise<ProjectRole | null> {
  return withTenant(user.companyId, () => projectAccessInScope(projectId, user));
}

async function projectAccessInScope(projectId: string, user: CurrentUser): Promise<ProjectRole | null> {
  const d = db();
  const [project] = await d
    .select({ createdBy: tables.projects.createdBy, companyId: tables.projects.companyId })
    .from(tables.projects)
    .where(eq(tables.projects.id, projectId))
    .limit(1);
  if (!project) return null;

  // ADR-010: another company's project does not exist for this user — same
  // answer as a missing one, so ids cannot be probed. Admins included.
  if (!user.companyId || project.companyId !== user.companyId) return null;

  if (user.role === "admin") return "admin";
  if (project.createdBy === user.id) return "owner";

  const [member] = await d
    .select({ role: tables.projectMembers.role })
    .from(tables.projectMembers)
    .where(
      and(
        eq(tables.projectMembers.projectId, projectId),
        eq(tables.projectMembers.userId, user.id)
      )
    )
    .limit(1);
  return member?.role ?? null;
}

/** Owners, editors and admins may write; viewers are strictly read-only. */
export function canWrite(role: ProjectRole | null): boolean {
  return role === "owner" || role === "editor" || role === "admin";
}

/** Only owners and admins may change sharing or project status. */
export function canAdminister(role: ProjectRole | null): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Every project id the user can see, always inside their own company
 * (ADR-010). Admins see every project of their company; members see the ones
 * they own or were added to. No company → nothing. Used by the list endpoints.
 */
export async function accessibleProjectIds(user: CurrentUser): Promise<string[]> {
  if (!user.companyId) return [];
  return withTenant(user.companyId, () => accessibleInScope(user, user.companyId!));
}

async function accessibleInScope(user: CurrentUser, companyId: string): Promise<string[]> {
  const inCompany = eq(tables.projects.companyId, companyId);
  if (user.role === "admin") {
    const rows = await db().select({ id: tables.projects.id }).from(tables.projects).where(inCompany);
    return rows.map((r) => r.id);
  }
  const rows = await db()
    .selectDistinct({ id: tables.projects.id })
    .from(tables.projects)
    .leftJoin(tables.projectMembers, eq(tables.projectMembers.projectId, tables.projects.id))
    .where(
      and(
        inCompany,
        or(eq(tables.projects.createdBy, user.id), eq(tables.projectMembers.userId, user.id))
      )
    );
  return rows.map((r) => r.id);
}

/* -------------------------------------------------------------------------
 * Conversation helpers shared by the chat routes
 * ---------------------------------------------------------------------- */

/**
 * Appends the USER half of a turn, resolving or creating the conversation.
 *
 * Called BEFORE the model runs (2026-09-05). The two halves used to be written
 * together once generation finished, which meant a failed or timed-out
 * generation threw away the user's input along with the reply — on a long
 * document turn that is a real loss. Writing the user turn first costs the
 * reply on failure, never the input.
 *
 * Callers authorize the project before getting here, so the remaining check
 * is *coherence*, not permission: a client-supplied conversation id must
 * belong to this project and this agent. It deliberately no longer forks on
 * a `createdBy` mismatch — a stage thread on a shared board is worked by
 * several authorized people (ADR-008 §5), and forking per author would
 * shatter it into one thread each.
 *
 * Returns the conversation id and the seq the assistant reply should take.
 */
export async function appendUserTurn(opts: {
  /** The session's company (user.companyId) — the tenant scope of the write. */
  companyId: string | null;
  conversationId: string | null;
  projectId: string;
  agentSlug: string;
  userId: string;
  userText: string;
}): Promise<{ conversationId: string; assistantSeq: number } | null> {
  if (!dbEnabled() || !isPersistableAgent(opts.agentSlug)) return null;
  return withTenant(opts.companyId, () => appendUserTurnInScope(opts));
}

async function appendUserTurnInScope(opts: {
  conversationId: string | null;
  projectId: string;
  agentSlug: string;
  userId: string;
  userText: string;
}): Promise<{ conversationId: string; assistantSeq: number } | null> {
  const d = db();
  let convId = opts.conversationId;
  // Visible only if the project is in the scope's company (row-level security).
  const companyId = await projectCompanyId(opts.projectId);
  if (!companyId) return null;

  if (convId) {
    const [conv] = await d
      .select({
        agentSlug: tables.conversations.agentSlug,
        projectId: tables.conversations.projectId,
      })
      .from(tables.conversations)
      .where(eq(tables.conversations.id, convId))
      .limit(1);
    if (!conv || conv.agentSlug !== opts.agentSlug || conv.projectId !== opts.projectId) {
      convId = null; // fork rather than fail the turn
    }
  }

  if (!convId) {
    const title =
      opts.userText.replace(/\s+/g, " ").slice(0, 80) || `${opts.agentSlug} session`;
    const [row] = await d
      .insert(tables.conversations)
      .values({
        companyId,
        projectId: opts.projectId,
        agentSlug: opts.agentSlug,
        createdBy: opts.userId,
        title,
      })
      .returning({ id: tables.conversations.id });
    convId = row.id;
  }

  const [agg] = await d
    .select({ maxSeq: max(tables.messages.seq) })
    .from(tables.messages)
    .where(eq(tables.messages.conversationId, convId));
  const nextSeq = agg.maxSeq === null ? 0 : agg.maxSeq + 1;

  await d
    .insert(tables.messages)
    .values({ companyId, conversationId: convId, seq: nextSeq, role: "user", content: opts.userText })
    .onConflictDoNothing();
  await d
    .update(tables.conversations)
    .set({ updatedAt: new Date() })
    .where(eq(tables.conversations.id, convId));

  return { conversationId: convId, assistantSeq: nextSeq + 1 };
}

/** Appends the assistant reply once generation succeeds. */
export async function appendAssistantTurn(opts: {
  /** The session's company — the tenant scope of the write. */
  companyId: string | null;
  conversationId: string;
  seq: number;
  assistantText: string;
}): Promise<void> {
  if (!dbEnabled() || !opts.assistantText.trim()) return;
  return withTenant(opts.companyId, () => appendAssistantTurnInScope(opts));
}

async function appendAssistantTurnInScope(opts: {
  conversationId: string;
  seq: number;
  assistantText: string;
}): Promise<void> {
  const d = db();
  const companyId = await conversationCompanyId(opts.conversationId);
  if (!companyId) return;
  await d
    .insert(tables.messages)
    .values({
      companyId,
      conversationId: opts.conversationId,
      seq: opts.seq,
      role: "assistant",
      content: opts.assistantText,
    })
    .onConflictDoNothing();
  await d
    .update(tables.conversations)
    .set({ updatedAt: new Date() })
    .where(eq(tables.conversations.id, opts.conversationId));
}

/**
 * Both halves in one call. Kept for callers that genuinely have the reply in
 * hand at the same moment as the input; the agent routes use the split pair
 * above so the input survives a failed generation.
 */
export async function appendTurns(opts: {
  companyId: string | null;
  conversationId: string | null;
  projectId: string;
  agentSlug: string;
  userId: string;
  userText: string;
  assistantText: string;
}): Promise<string | null> {
  const started = await appendUserTurn(opts);
  if (!started) return null;
  await appendAssistantTurn({
    companyId: opts.companyId,
    conversationId: started.conversationId,
    seq: started.assistantSeq,
    assistantText: opts.assistantText,
  });
  return started.conversationId;
}

/**
 * Authorizes a conversation through its project — the conversation-level
 * equivalent of getProjectAccess().
 */
export async function getConversationAccess(
  conversationId: string,
  user: CurrentUser
): Promise<{ projectId: string; agentSlug: string; companyId: string; role: ProjectRole } | null> {
  return withTenant(user.companyId, () => conversationAccessInScope(conversationId, user));
}

async function conversationAccessInScope(
  conversationId: string,
  user: CurrentUser
): Promise<{ projectId: string; agentSlug: string; companyId: string; role: ProjectRole } | null> {
  const [conv] = await db()
    .select({
      projectId: tables.conversations.projectId,
      agentSlug: tables.conversations.agentSlug,
      companyId: tables.conversations.companyId,
    })
    .from(tables.conversations)
    .where(eq(tables.conversations.id, conversationId))
    .limit(1);
  if (!conv) return null;
  const role = await getProjectAccess(conv.projectId, user);
  if (!role) return null;
  return { projectId: conv.projectId, agentSlug: conv.agentSlug, companyId: conv.companyId, role };
}
