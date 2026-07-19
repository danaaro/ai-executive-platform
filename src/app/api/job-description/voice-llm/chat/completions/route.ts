import { NextRequest } from "next/server";
import { handleVoiceLlm } from "../../handler";

// ElevenLabs appends /chat/completions to the configured custom-LLM base URL
// (<app>/api/job-description/voice-llm) — this is the path it actually calls.

// Streaming keeps first-byte fast, but the function must stay alive for the
// whole generation — don't let Vercel's default window cut long turns.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  return handleVoiceLlm(req);
}
