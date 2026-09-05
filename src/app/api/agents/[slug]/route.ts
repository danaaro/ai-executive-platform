import { NextRequest, NextResponse } from "next/server";
import {
  getAgent,
  streamAgentTurn,
  type ChatMessage,
} from "@/orchestrator/agent-orchestrator";
import { agentStreamResponse } from "@/shared/agent-stream";
import {
  createIntakeBlockFilter,
  recordIntakeAnswers,
  splitIntakeBlock,
} from "@/shared/intake-answers";
import {
  requireUser,
  appendUserTurn,
  appendAssistantTurn,
  dbEnabled,
  isPersistableAgent,
  getProjectAccess,
  canWrite,
} from "@/shared/current-user";
import {
  loadInheritedArtifacts,
  applyInheritance,
  isEmptyThread,
} from "@/orchestrator/inheritance";

// Long-form generations (8K+ output tokens) exceed Vercel's default function
// window. Turns now STREAM (see shared/agent-stream.ts) so the connection is
// never idle, but the budget still has to cover the tail of a long write:
// measured 2026-08-13, a full JD interim draft (document + 20-section coverage
// record, ~14K chars) takes 90-120s, which sat right on the old 120s ceiling
// and returned a gateway-timeout page. 300s is the platform maximum; Vercel
// clamps to the plan limit rather than failing the build if it allows less.
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!getAgent(slug)) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
  }

  const body = await req.json();
  const messages: ChatMessage[] = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages[] is required" }, { status: 400 });
  }

  // Project-scoped agents require a project (ADR-007) and WRITE access to it
  // (ADR-008) — both checked before the costly model call.
  const projectId: string | null = body.projectId ?? null;
  const conversationId: string | null = body.conversationId ?? null;
  const scoped = isPersistableAgent(slug) && dbEnabled();

  if (scoped) {
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

  try {
    // Chaining (ADR-008 §9): on the first turn of an empty thread, prepend
    // the approved upstream artifacts server-side. Doing it here rather than
    // in the client means the content cannot be substituted, and the model
    // sees it as pasted input — exactly what the agent prompts expect.
    let outbound = messages;
    let inheritedNote: { agentSlug: string; name: string; version: number }[] = [];

    if (scoped && body.inherit === true && projectId && (await isEmptyThread(conversationId))) {
      const inherited = await loadInheritedArtifacts(projectId, slug);
      if (inherited.length > 0) {
        const first = messages[0];
        outbound = [
          { ...first, content: applyInheritance(first.content, inherited) },
          ...messages.slice(1),
        ];
        inheritedNote = inherited.map(({ agentSlug, name, version }) => ({
          agentSlug,
          name,
          version,
        }));
      }
    }

    return agentStreamResponse(async (emit) => {
      // Persist the turn for role-scoped agents (ADR-006 §5) — the user half
      // BEFORE generating, so a failed or timed-out generation costs the reply
      // and never the input. Never let a persistence hiccup break the
      // conversation itself.
      let savedConversationId = conversationId;
      let assistantSeq: number | null = null;
      if (dbEnabled() && projectId) {
        try {
          const user = await requireUser();
          if (user) {
            const started = await appendUserTurn({
              conversationId,
              projectId,
              agentSlug: slug,
              userId: user.id,
              // Persist what the model actually saw, so a resumed thread and a
              // voice hand-off both carry the inherited context.
              userText: outbound[outbound.length - 1]?.content ?? "",
            });
            if (started) {
              savedConversationId = started.conversationId;
              assistantSeq = started.assistantSeq;
            }
          }
        } catch (err) {
          console.error(`[agents/${slug}] user-turn persistence failed (turn served):`, err);
        }
      }

      // Defence in depth: only the JD agent emits an [INTAKE ANSWERS] block, and
      // the JD chat is routed to /api/job-description rather than here (see
      // use-intake-session.ts). Filtering anyway costs nothing for the agents
      // that never emit one, and means routing JD through this endpoint later
      // cannot silently print bookkeeping into the transcript.
      let filter = createIntakeBlockFilter();
      const raw = await streamAgentTurn(
        slug,
        outbound,
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

      const { visibleText: reply, answers } = splitIntakeBlock(raw);

      if (savedConversationId && assistantSeq !== null) {
        try {
          await appendAssistantTurn({
            conversationId: savedConversationId,
            seq: assistantSeq,
            assistantText: reply,
          });
          await recordIntakeAnswers(savedConversationId, answers, "text");
        } catch (err) {
          console.error(`[agents/${slug}] reply persistence failed (turn served):`, err);
        }
      }

      emit({ type: "done", conversationId: savedConversationId, inherited: inheritedNote });
    });
  } catch (err) {
    // Only reachable for failures BEFORE the stream opens (inheritance lookup).
    console.error(`[agents/${slug}]`, err);
    return NextResponse.json({ error: "Agent request failed" }, { status: 500 });
  }
}
