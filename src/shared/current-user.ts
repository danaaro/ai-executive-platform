import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";

/**
 * Resolves the signed-in user, mirrors them into the `users` table, and
 * returns their role. Clerk publicMetadata.role is the role's source of
 * truth ("admin" | anything else = member); the DB mirror exists for joins
 * and admin listings. Role lookups are cached per process for 5 minutes.
 */

export type CurrentUser = { id: string; role: "admin" | "member" };

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

  const user: CurrentUser = { id: userId, role };
  cache.set(userId, { user, at: Date.now() });
  return user;
}

export async function getUserNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await db()
    .select({ id: tables.users.id, name: tables.users.name, email: tables.users.email })
    .from(tables.users);
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (ids.includes(r.id)) map[r.id] = r.name || r.email || r.id;
  }
  return map;
}

export function isPersistableAgent(slug: string): boolean {
  // ADR-006 §5: only candidate-agnostic agents persist conversations —
  // candidate-scoped chats (CVs, transcripts) stay ephemeral until Phase 2.
  return ["job-description", "competency-builder", "panel-designer", "interview-system-builder", "screening-guide"].includes(slug);
}

export const dbEnabled = () => Boolean(process.env.DATABASE_URL);

// Conversation helpers shared by the chat routes.
export async function appendTurns(opts: {
  conversationId: string | null;
  agentSlug: string;
  userId: string;
  userText: string;
  assistantText: string;
}): Promise<string | null> {
  if (!dbEnabled() || !isPersistableAgent(opts.agentSlug)) return null;
  const d = db();
  let convId = opts.conversationId;

  // Never trust a client-supplied conversation id: writing into a
  // conversation requires owning it (admins included — resuming someone
  // else's session in the UI is read-only today). On mismatch, fork into
  // a fresh conversation instead of failing the turn.
  if (convId) {
    const [conv] = await d
      .select({ createdBy: tables.conversations.createdBy, agentSlug: tables.conversations.agentSlug })
      .from(tables.conversations)
      .where(eq(tables.conversations.id, convId))
      .limit(1);
    if (!conv || conv.createdBy !== opts.userId || conv.agentSlug !== opts.agentSlug) {
      convId = null;
    }
  }

  if (!convId) {
    const title =
      opts.userText.replace(/\s+/g, " ").slice(0, 80) || `${opts.agentSlug} session`;
    const [row] = await d
      .insert(tables.conversations)
      .values({ agentSlug: opts.agentSlug, createdBy: opts.userId, title })
      .returning({ id: tables.conversations.id });
    convId = row.id;
  }

  const existing = await d
    .select({ seq: tables.messages.seq })
    .from(tables.messages)
    .where(eq(tables.messages.conversationId, convId))
    .orderBy(tables.messages.seq);
  const nextSeq = existing.length > 0 ? existing[existing.length - 1].seq + 1 : 0;

  await d.insert(tables.messages).values([
    { conversationId: convId, seq: nextSeq, role: "user", content: opts.userText },
    { conversationId: convId, seq: nextSeq + 1, role: "assistant", content: opts.assistantText },
  ]);
  await d
    .update(tables.conversations)
    .set({ updatedAt: new Date() })
    .where(eq(tables.conversations.id, convId));

  return convId;
}
