import { NextRequest, NextResponse } from "next/server";
import {
  getAgent,
  runAgentTurn,
  type ChatMessage,
} from "@/orchestrator/agent-orchestrator";
import { requireUser, appendTurns, dbEnabled } from "@/shared/current-user";

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

  try {
    const reply = await runAgentTurn(slug, messages);

    // Persist the turn for role-scoped agents (ADR-006 §5). Never let a
    // persistence hiccup break the conversation itself.
    let conversationId: string | null = body.conversationId ?? null;
    if (dbEnabled()) {
      try {
        const user = await requireUser();
        if (user) {
          conversationId = await appendTurns({
            conversationId,
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
