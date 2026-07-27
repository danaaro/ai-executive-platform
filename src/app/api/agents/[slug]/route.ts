import { NextRequest, NextResponse } from "next/server";
import {
  getAgent,
  runAgentTurn,
  type ChatMessage,
} from "@/orchestrator/agent-orchestrator";
import {
  requireUser,
  appendTurns,
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
// window — give LLM turns an explicit budget.
export const maxDuration = 120;

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

    const reply = await runAgentTurn(slug, outbound);

    // Persist the turn for role-scoped agents (ADR-006 §5). Never let a
    // persistence hiccup break the conversation itself.
    let savedConversationId = conversationId;
    if (dbEnabled() && projectId) {
      try {
        const user = await requireUser();
        if (user) {
          savedConversationId = await appendTurns({
            conversationId,
            projectId,
            agentSlug: slug,
            userId: user.id,
            // Persist what the model actually saw, so a resumed thread and a
            // voice hand-off both carry the inherited context.
            userText: outbound[outbound.length - 1]?.content ?? "",
            assistantText: reply,
          });
        }
      } catch (err) {
        console.error(`[agents/${slug}] persistence failed (turn served):`, err);
      }
    }

    return NextResponse.json({
      reply,
      conversationId: savedConversationId,
      inherited: inheritedNote,
    });
  } catch (err) {
    console.error(`[agents/${slug}]`, err);
    return NextResponse.json({ error: "Agent request failed" }, { status: 500 });
  }
}
