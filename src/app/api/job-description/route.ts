import { NextRequest, NextResponse } from "next/server";
import {
  runJobDescriptionTurn,
  type ChatMessage,
} from "@/orchestrator/job-description-orchestrator";
import { requireUser, appendTurns, dbEnabled } from "@/shared/current-user";

// The Phase 2/3 deliverable (JD + coverage record) is a long non-streaming
// generation — needs more than Vercel's default function window.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages: ChatMessage[] = body.messages;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages[] is required" }, { status: 400 });
  }

  try {
    const reply = await runJobDescriptionTurn(messages);

    let conversationId: string | null = body.conversationId ?? null;
    if (dbEnabled()) {
      try {
        const user = await requireUser();
        if (user) {
          conversationId = await appendTurns({
            conversationId,
            agentSlug: "job-description",
            userId: user.id,
            userText: messages[messages.length - 1]?.content ?? "",
            assistantText: reply,
          });
        }
      } catch (err) {
        console.error("[job-description] persistence failed (turn served):", err);
      }
    }

    return NextResponse.json({ reply, conversationId });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
