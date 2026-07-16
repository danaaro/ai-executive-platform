import { NextRequest } from "next/server";
import { handleVoiceLlm } from "./handler";

// Also accept POSTs at the base URL itself, in case the custom-LLM server URL
// is configured pointing directly here rather than as an OpenAI-style base.
export async function POST(req: NextRequest) {
  return handleVoiceLlm(req);
}
