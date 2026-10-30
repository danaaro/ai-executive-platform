import { roleContextBlock } from "@/orchestrator/role-context";
import { INTERIM_DRAFT_MARKER } from "@/components/review/deliverable";
import { validateChatMessages } from "@/shared/chat-limits";
import { errorSummary } from "@/shared/safe-log";
import { NextRequest, NextResponse } from "next/server";
import {
  streamJobDescriptionTurn,
  streamJobDescriptionDraft,
  questionBankIndex,
  type ChatMessage,
} from "@/orchestrator/job-description-orchestrator";
import { adminDb, tables } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import {
  requireUser,
  appendUserTurn,
  appendAssistantTurn,
  dbEnabled,
  getProjectAccess,
  canWrite,
} from "@/shared/current-user";
import { agentStreamResponse } from "@/shared/agent-stream";
import { recordSecurityFlags } from "@/shared/security-flags";
import {
  createIntakeBlockFilter,
  recordIntakeAnswers,
  splitIntakeBlock,
} from "@/shared/intake-answers";

// The Phase 2/3 deliverable (JD + coverage record) is the longest generation in
// the suite — measured at 90-120s on 2026-08-13. It now STREAMS (see
// shared/agent-stream.ts): first bytes leave in seconds, so this budget is
// headroom for the tail of a long write rather than the thing the whole reply
// has to fit inside. 120 was not enough and produced a gateway-timeout page.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const checked = validateChatMessages(body.messages);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const messages: ChatMessage[] = checked.messages;

  const projectId: string | null = body.projectId ?? null;
  if (dbEnabled()) {
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required for this agent" },
        { status: 400 }
      );
    }
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = await getProjectAccess(projectId, user);
    if (!role) {
      return NextResponse.json(
        { error: "Project not found or not accessible" },
        { status: 403 }
      );
    }
    if (!canWrite(role)) {
      return NextResponse.json(
        { error: "You have view-only access to this position" },
        { status: 403 }
      );
    }
  }

  // Everything above is a fast pre-flight check and still answers with plain
  // JSON + a real status code. Only the model call streams.
  return agentStreamResponse(async (emit) => {
    let conversationId: string | null = body.conversationId ?? null;
    // The session's company — every write below is scoped to it (ADR-010).
    let scopeCompanyId: string | null = null;
    let scopeUserId: string | null = null;
    let assistantSeq: number | null = null;

    // The user's input is stored BEFORE the model runs. A JD generation takes
    // 90-160s and can fail or time out; when it does, the reply is lost but
    // what the hiring manager typed or pasted is already safe.
    if (dbEnabled() && projectId) {
      try {
        const user = await requireUser();
        if (user) {
          scopeCompanyId = user.companyId;
          scopeUserId = user.id;
          const started = await appendUserTurn({
            companyId: user.companyId,
            conversationId,
            projectId,
            agentSlug: "job-description",
            userId: user.id,
            userText: messages[messages.length - 1]?.content ?? "",
          });
          if (started) {
            conversationId = started.conversationId;
            assistantSeq = started.assistantSeq;
          }
        }
      } catch (err) {
        console.error("[job-description] user-turn persistence failed (turn served):", errorSummary(err));
      }
    }

    // The agent closes each turn with an [INTAKE ANSWERS] block. It is
    // bookkeeping, not conversation, so it is withheld from the stream as it
    // arrives rather than typed out on screen and removed afterwards.
    // The role's context (title, salary, company, documents, research) and
    // whether this turn writes the document (deep thinking) or just asks.
    const last = messages[messages.length - 1]?.content ?? "";
    const writesDocument = last.includes(INTERIM_DRAFT_MARKER) || /^Please revise the /.test(last);

    // Writing or revising the document is the JD writer's job (PRD v4 §3.2):
    // its own prompt (Susan's template), its own model, the full company
    // context, the recorded answers and the transcript. The interview agent
    // never writes the document.
    if (writesDocument) {
      let context = "";
      let answers = "";
      let latest = "";
      if (dbEnabled() && projectId) {
        try {
          context = await roleContextBlock(projectId, "writer");
          answers = conversationId ? await answersForWriter(conversationId) : "";
          latest = await latestJobDescription(projectId);
        } catch (err) {
          console.error("[job-description] writer inputs incomplete (draft served):", errorSummary(err));
        }
      }
      const transcript = messages
        .slice(0, -1)
        .map((m) => `${m.role === "user" ? "Hiring manager" : "Partner"}: ${m.content}`)
        .join("\n\n");
      const request = last.includes(INTERIM_DRAFT_MARKER)
        ? "Write the first version of the role description."
        : `${last}${latest ? `\n\nThe latest saved version, to revise:\n\n${latest}` : ""}`;
      const draft = await streamJobDescriptionDraft(
        { context, answers, transcript, request },
        (text) => emit({ type: "delta", text }),
        () => emit({ type: "reset" })
      );
      if (conversationId && assistantSeq !== null) {
        try {
          await appendAssistantTurn({ companyId: scopeCompanyId, conversationId, seq: assistantSeq, assistantText: draft });
        } catch (err) {
          console.error("[job-description] draft persistence failed (draft served):", errorSummary(err));
        }
      }
      emit({ type: "done", conversationId });
      return;
    }

    let context = "";
    if (dbEnabled() && projectId) {
      try {
        context = await roleContextBlock(projectId);
      } catch (err) {
        console.error("[job-description] role context unavailable (turn served):", errorSummary(err));
      }
    }

    let filter = createIntakeBlockFilter();
    const raw = await streamJobDescriptionTurn(
      messages,
      (text) => {
        const visible = filter.push(text);
        if (visible) emit({ type: "delta", text: visible });
      },
      () => {
        filter = createIntakeBlockFilter();
        emit({ type: "reset" });
      },
      { thinking: false, context }
    );
    const tail = filter.flush();
    if (tail) emit({ type: "delta", text: tail });

    const { visibleText, answers } = splitIntakeBlock(raw);

    if (conversationId && assistantSeq !== null) {
      try {
        // The transcript stores what the user saw; the block lives in
        // intake_answers, not twice.
        await appendAssistantTurn({
          companyId: scopeCompanyId,
          conversationId,
          seq: assistantSeq,
          assistantText: visibleText,
        });
        await recordIntakeAnswers(conversationId, answers, "text", scopeCompanyId);
      } catch (err) {
        console.error("[job-description] reply persistence failed (turn served):", errorSummary(err));
      }
    }
    await recordSecurityFlags({
      companyId: scopeCompanyId,
      projectId,
      conversationId,
      userId: scopeUserId,
      agentSlug: "job-description",
      channel: "text",
      userText: last,
      replyText: visibleText,
    });

    emit({ type: "done", conversationId });
  });
}

/** The recorded answers as the writer reads them: question, tag, status, answer. */
async function answersForWriter(conversationId: string): Promise<string> {
  const bank = questionBankIndex();
  const rows = await adminDb()
    .select({
      questionId: tables.intakeAnswers.questionId,
      status: tables.intakeAnswers.status,
      source: tables.intakeAnswers.source,
      answer: tables.intakeAnswers.answer,
    })
    .from(tables.intakeAnswers)
    .where(eq(tables.intakeAnswers.conversationId, conversationId))
    .orderBy(tables.intakeAnswers.sectionId, tables.intakeAnswers.questionId);
  return rows
    .filter((r) => bank.has(r.questionId))
    .map((r) => {
      const q = bank.get(r.questionId)!;
      return `- ${r.questionId} [${q.tag}] ${q.text}\n  ${r.status} (${r.source})${r.answer ? `: ${r.answer}` : ""}`;
    })
    .join("\n");
}

/** The newest saved job description for the role, if any (for revisions). */
async function latestJobDescription(projectId: string): Promise<string> {
  const [row] = await adminDb()
    .select({ content: tables.artifacts.content })
    .from(tables.artifacts)
    .where(and(eq(tables.artifacts.projectId, projectId), eq(tables.artifacts.agentSlug, "job-description")))
    .orderBy(desc(tables.artifacts.version))
    .limit(1);
  return row?.content ?? "";
}
