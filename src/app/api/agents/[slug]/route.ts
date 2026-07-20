import { NextRequest, NextResponse } from "next/server";
import {
  getAgent,
  runAgentTurn,
  type ChatMessage,
} from "@/orchestrator/agent-orchestrator";
import { requireUser, appendTurns, dbEnabled, isPersistableAgent, assertProjectAccess } from "@/shared/current-user";

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

  // Project-scoped agents require a project (ADR-007) — checked before the
  // (costly) model call so a missing/foreign project fails fast.
  const projectId: string | null = body.projectId ?? null;
  if (isPersistableAgent(slug) && dbEnabled()) {
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required for this agent" }, { status: 400 });
    }
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await assertProjectAccess(projectId, user))) {
      return NextResponse.json({ error: "Project not found or not accessible" }, { status: 403 });
    }
  }

  try {
    const reply = await runAgentTurn(slug, messages);

    // Persist the turn for role-scoped agents (ADR-006 §5). Never let a
    // persistence hiccup break the conversation itself.
    let conversationId: string | null = body.conversationId ?? null;
    if (dbEnabled() && projectId) {
      try {
        const user = await requireUser();
        if (user) {
          conversationId = await appendTurns({
            conversationId,
            projectId,
            agentSlug: slug,
            userId: user.id,
            userText: messages[messages.length - 1]?.content ?? "",
            assistantText: reply,
          });
        }
      } catch (err) {
        console.error(`[agents/${slug}] persistence failed (turn served):`, err);
      }
    }

    return NextResponse.json({ reply, conversationId });
  } catch (err) {
    console.error(`[agents/${slug}]`, err);
    return NextResponse.json({ error: "Agent request failed" }, { status: 500 });
  }
}
