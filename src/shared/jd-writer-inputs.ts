import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { questionBankIndex } from "@/orchestrator/job-description-orchestrator";

/**
 * What the JD writer reads besides the role context. Both run inside
 * withTenant(): row-level security limits them to the session's company.
 * Kept out of the route so the tenancy test can call them with another
 * company's ids (security review H2, 2026-11-06).
 */

/**
 * The recorded answers as the writer reads them: question, tag, status, answer.
 * Runs inside withTenant(): row-level security limits it to the session's
 * company, and the join limits it to this role's own conversation.
 */
export async function answersForWriter(conversationId: string, projectId: string): Promise<string> {
  const bank = questionBankIndex();
  const rows = await db()
    .select({
      questionId: tables.intakeAnswers.questionId,
      status: tables.intakeAnswers.status,
      source: tables.intakeAnswers.source,
      answer: tables.intakeAnswers.answer,
    })
    .from(tables.intakeAnswers)
    .innerJoin(tables.conversations, eq(tables.conversations.id, tables.intakeAnswers.conversationId))
    .where(and(eq(tables.intakeAnswers.conversationId, conversationId), eq(tables.conversations.projectId, projectId)))
    .orderBy(tables.intakeAnswers.sectionId, tables.intakeAnswers.questionId);
  return rows
    .filter((r) => bank.has(r.questionId))
    .map((r) => {
      const q = bank.get(r.questionId)!;
      return `- ${r.questionId} [${q.tag}] ${q.text}\n  ${r.status} (${r.source})${r.answer ? `: ${r.answer}` : ""}`;
    })
    .join("\n");
}

/** The newest saved job description for the role, if any (for revisions). Inside withTenant(). */
export async function latestJobDescription(projectId: string): Promise<string> {
  const [row] = await db()
    .select({ content: tables.artifacts.content })
    .from(tables.artifacts)
    .where(and(eq(tables.artifacts.projectId, projectId), eq(tables.artifacts.agentSlug, "job-description")))
    .orderBy(desc(tables.artifacts.version))
    .limit(1);
  return row?.content ?? "";
}
