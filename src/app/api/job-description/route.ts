import { NextRequest, NextResponse } from "next/server";
import {
  runJobDescriptionTurn,
  type ChatMessage,
} from "@/orchestrator/job-description-orchestrator";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages: ChatMessage[] = body.messages;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages[] is required" }, { status: 400 });
  }

  try {
    const reply = await runJobDescriptionTurn(messages);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
