import { auth, clerkClient } from "@clerk/nextjs/server";
import { and, eq, inArray, isNull, max, or, sql } from "drizzle-orm";
import { db, tables } from "@/db";

/**
 * Identity and authorization.
 *
 * Identity: Clerk is the source of truth; `publicMetadata.role === "admin"`
 * makes a platform admin. The `users` table is a mirror for joins and
 * listings. Role lookups are cached per process for 5 minutes.
 *
 * Authorization: per-project membership (ADR-008), NOT `createdBy`.
 * `getProjectAccess()` is the single choke point — every route touching
 * project-scoped data goes through it. `createdBy` survives only as
 * provenance ("who made this"), never as permission.
 */

export type CurrentUser = { id: string; role: "admin" | "member"; email: string | null };
export type ProjectRole = "owner" | "editor" | "viewer" | "admin";

const cache = new Map<string, { user: CurrentUser; at: number }>();
const TTL = 5 * 60 * 1000;

export async function requireUser(): Promise<CurrentUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.user;

  const clerk = await clerkClient();
  const cu = await clerk.users.getUser(userId);
  const role = cu.publicMetadata?.role === "admin" ? "admin" : "member";
  const email = cu.emailAddresses[0]?.emailAddress ?? null;
  const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || null;

  await db()
    .insert(tables.users)
    .values({ id: userId, email, name, role })
    .onConflictDoUpdate({
      target: tables.users.id,
      set: { email, name, role },
    });

  // Collaborators are invited by email before they have a Clerk id
  // (ADR-008 §2). There is no sign-in webhook, so binding happens here — on
  // the first authenticated request after the invite, at most once per
  // cache miss.
  if (email) await claimPendingInvites(userId, email);

  const user: CurrentUser = { id: userId, role, email };
  cache.set(userId, { user, at: Date.now() });
  return user;
}

async function claimPendingInvites(userId: string, email: string): Promise<void> {
  try {
    await db()
      .update(tables.projectMembers)
      .set({ userId, acceptedAt: new Date() })
      .where(
        and(
          isNull(tables.projectMembers.userId),
          // Case-insensitive: the inviter types what they remember, Clerk
          // stores what the identity provider returned.
          sql`lower(${tables.projectMembers.invitedEmail}) = ${email.toLowerCase()}`
        )
      );
  } catch (err) {
    // A unique collision here means they are already a member of that
    // project via another row — never a reason to fail the request.
    console.warn("[invites] claim failed (non-fatal):", err);
  }
}

export async function getUserNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  const rows = await db()
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
  const d = db();
  const [project] = await d
    .select({ createdBy: tables.projects.createdBy })
    .from(tables.projects)
    .where(eq(tables.projects.id, projectId))
    .limit(1);
  if (!project) return null;

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
 * Every project id the user can see. Returns **null for platform admins**,
 * meaning "no restriction" — callers must treat null as *unfiltered*, not as
 * *empty*. Used by the list endpoints, which now filter by project instead
 * of by `createdBy`.
 */
export async function accessibleProjectIds(user: CurrentUser): Promise<string[] | null> {
  if (user.role === "admin") return null;
  const rows = await db()
    .selectDistinct({ id: tables.projects.id })
    .from(tables.projects)
    .leftJoin(tables.projectMembers, eq(tables.projectMembers.projectId, tables.projects.id))
    .where(
      or(eq(tables.projects.createdBy, user.id), eq(tables.projectMembers.userId, user.id))
    );
  return rows.map((r) => r.id);
}

/* -------------------------------------------------------------------------
 * Conversation helpers shared by the chat routes
 * ---------------------------------------------------------------------- */

/**
 * Appends one user/assistant turn pair to a conversation.
 *
 * Callers authorize the project before getting here, so the remaining check
 * is *coherence*, not permission: a client-supplied conversation id must
 * belong to this project and this agent. It deliberately no longer forks on
 * a `createdBy` mismatch — a stage thread on a shared board is worked by
 * several authorized people (ADR-008 §5), and forking per author would
 * shatter it into one thread each.
 */
export async function appendTurns(opts: {
  conversationId: string | null;
  projectId: string;
  agentSlug: string;
  userId: string;
  userText: string;
  assistantText: string;
}): Promise<string | null> {
  if (!dbEnabled() || !isPersistableAgent(opts.agentSlug)) return null;
  const d = db();
  let convId = opts.conversationId;

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

  await d.insert(tables.messages).values([
    { conversationId: convId, seq: nextSeq, role: "user", content: opts.userText },
    {
      conversationId: convId,
      seq: nextSeq + 1,
      role: "assistant",
      content: opts.assistantText,
    },
  ]);
  await d
    .update(tables.conversations)
    .set({ updatedAt: new Date() })
    .where(eq(tables.conversations.id, convId));

  return convId;
}

/**
 * Authorizes a conversation through its project — the conversation-level
 * equivalent of getProjectAccess().
 */
export async function getConversationAccess(
  conversationId: string,
  user: CurrentUser
): Promise<{ projectId: string; agentSlug: string; role: ProjectRole } | null> {
  const [conv] = await db()
    .select({
      projectId: tables.conversations.projectId,
      agentSlug: tables.conversations.agentSlug,
    })
    .from(tables.conversations)
    .where(eq(tables.conversations.id, conversationId))
    .limit(1);
  if (!conv) return null;
  const role = await getProjectAccess(conv.projectId, user);
  if (!role) return null;
  return { projectId: conv.projectId, agentSlug: conv.agentSlug, role };
}
