import { NextRequest, NextResponse } from "next/server";
import {
  getAgent,
  runAgentTurn,
  type ChatMessage,
} from "@/orchestrator/agent-orchestrator";

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
    return NextResponse.json({ reply });
  } catch (err) {
    console.error(`[agents/${slug}]`, err);
    return NextResponse.json({ error: "Agent request failed" }, { status: 500 });
  }
}
