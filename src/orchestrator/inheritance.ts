import { and, desc, eq, inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { getAgent } from "./agent-orchestrator";
import { stageName } from "./stages";

/**
 * Agent chaining (ADR-008 §9) — the hand-off the board promises: "each
 * stage's approved output automatically feeds the next stage's input."
 *
 * Assembled SERVER-SIDE and injected into the first turn of an empty thread.
 * The client never carries the upstream artifact, which means it cannot be
 * substituted or trimmed, and the voice channel inherits the same behaviour
 * without its own implementation.
 *
 * Only APPROVED artifacts are inherited. A draft upstream is treated as
 * absent — that is precisely the distinction the approve action buys, and
 * why gating can stay flexible without the chain becoming meaningless.
 */

export type InheritedArtifact = {
  agentSlug: string;
  name: string;
  version: number;
  content: string;
};

export async function loadInheritedArtifacts(
  projectId: string,
  slug: string
): Promise<InheritedArtifact[]> {
  const agent = getAgent(slug);
  const deps = agent?.dependsOn ?? [];
  if (deps.length === 0) return [];

  const rows = await db()
    .select({
      agentSlug: tables.artifacts.agentSlug,
      version: tables.artifacts.version,
      content: tables.artifacts.content,
    })
    .from(tables.artifacts)
    .where(
      and(
        eq(tables.artifacts.projectId, projectId),
        inArray(tables.artifacts.agentSlug, deps),
        eq(tables.artifacts.status, "approved")
      )
    )
    .orderBy(desc(tables.artifacts.version));

  // Highest approved version per dependency, in the order the agent declares
  // them — the prompt reads better when the JD comes before the competencies.
  const best = new Map<string, { version: number; content: string }>();
  for (const r of rows) {
    if (!best.has(r.agentSlug)) best.set(r.agentSlug, { version: r.version, content: r.content });
  }

  return deps
    .filter((d) => best.has(d))
    .map((d) => ({
      agentSlug: d,
      name: stageName(d),
      version: best.get(d)!.version,
      content: best.get(d)!.content,
    }));
}

/**
 * Prepends the inherited artifacts to the first user message. Framed as
 * material the user is supplying, because that is what the agent prompts
 * expect ("inputs arrive as pasted text in the conversation") — no prompt
 * changes were needed to make chaining work.
 */
export function applyInheritance(
  firstUserMessage: string,
  inherited: InheritedArtifact[]
): string {
  if (inherited.length === 0) return firstUserMessage;

  const blocks = inherited.map(
    (a) =>
      `[Approved ${a.name} — version ${a.version}]\n\n${a.content}`
  );

  return [
    "The following approved artifacts from earlier stages of this hiring project are provided as your input. Use them as the authoritative source; do not ask for information they already contain.",
    ...blocks,
    firstUserMessage.trim() ? `---\n\n${firstUserMessage}` : "---\n\nPlease begin.",
  ].join("\n\n");
}

/** Is this the first turn of a thread that has never been persisted? */
export async function isEmptyThread(conversationId: string | null): Promise<boolean> {
  if (!conversationId) return true;
  const [row] = await db()
    .select({ id: tables.messages.id })
    .from(tables.messages)
    .where(eq(tables.messages.conversationId, conversationId))
    .limit(1);
  return !row;
}
