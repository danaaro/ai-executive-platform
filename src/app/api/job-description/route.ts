import { NextRequest, NextResponse } from "next/server";
import {
  streamJobDescriptionTurn,
  type ChatMessage,
} from "@/orchestrator/job-description-orchestrator";
import {
  requireUser,
  appendUserTurn,
  appendAssistantTurn,
  dbEnabled,
  getProjectAccess,
  canWrite,
} from "@/shared/current-user";
import { agentStreamResponse } from "@/shared/agent-stream";
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
  const body = await req.json();
  const messages: ChatMessage[] = body.messages;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages[] is required" }, { status: 400 });
  }

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
    let assistantSeq: number | null = null;

    // The user's input is stored BEFORE the model runs. A JD generation takes
    // 90-160s and can fail or time out; when it does, the reply is lost but
    // what the hiring manager typed or pasted is already safe.
    if (dbEnabled() && projectId) {
      try {
        const user = await requireUser();
        if (user) {
          const started = await appendUserTurn({
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
        console.error("[job-description] user-turn persistence failed (turn served):", err);
      }
    }

    // The agent closes each turn with an [INTAKE ANSWERS] block. It is
    // bookkeeping, not conversation, so it is withheld from the stream as it
    // arrives rather than typed out on screen and removed afterwards.
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
      }
    );
    const tail = filter.flush();
    if (tail) emit({ type: "delta", text: tail });

    const { visibleText, answers } = splitIntakeBlock(raw);

    if (conversationId && assistantSeq !== null) {
      try {
        // The transcript stores what the user saw; the block lives in
        // intake_answers, not twice.
        await appendAssistantTurn({
          conversationId,
          seq: assistantSeq,
          assistantText: visibleText,
        });
        await recordIntakeAnswers(conversationId, answers, "text");
      } catch (err) {
        console.error("[job-description] reply persistence failed (turn served):", err);
      }
    }

    emit({ type: "done", conversationId });
  });
}
