import { NextRequest } from "next/server";
import { handleVoiceLlm } from "../../handler";

// ElevenLabs appends /chat/completions to the configured custom-LLM base URL
// (<app>/api/job-description/voice-llm) — this is the path it actually calls.
export async function POST(req: NextRequest) {
  return handleVoiceLlm(req);
}
