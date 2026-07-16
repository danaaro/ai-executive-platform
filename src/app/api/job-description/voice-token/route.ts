import { NextResponse } from "next/server";
import { buildJobDescriptionSystemPrompt } from "@/orchestrator/job-description-orchestrator";
import { getAnthropicClient, DEFAULT_MODEL } from "@/shared/anthropic-client";

/**
 * Fire-and-forget cache pre-warm (see shared prompt-caching guidance):
 * max_tokens: 0 runs prefill only — it writes the Anthropic prompt cache at
 * the system-block breakpoint and returns without generating. By the time
 * the user has heard the greeting and finished their first answer, the
 * first LLM turn reads a warm cache instead of paying ~3-6s of cold
 * prompt processing against ElevenLabs' per-attempt timeout.
 */
function prewarmPromptCache() {
  getAnthropicClient()
    .messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 0,
      system: [
        {
          type: "text",
          text: buildJobDescriptionSystemPrompt(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: "warmup" }],
    })
    .catch((err) => console.warn("prompt-cache prewarm failed (non-fatal):", err?.message));
}

/**
 * Mints a short-lived ElevenLabs conversation token so the signed-in user's
 * browser can open a WebRTC voice session (ADR-005). Clerk-gated by
 * src/middleware.ts like every other API route; the ElevenLabs API key
 * never reaches the client, and the agent itself stays private.
 */
export async function GET() {
  prewarmPromptCache();
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    return NextResponse.json(
      {
        error:
          "Voice is not configured: set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in .env.local (see .env.local.example) and restart the dev server.",
      },
      { status: 503 }
    );
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": apiKey }, cache: "no-store" }
  );

  if (!res.ok) {
    console.error("ElevenLabs token request failed:", res.status, await res.text());
    return NextResponse.json(
      { error: "Could not start a voice session (ElevenLabs token request failed)." },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json({ token: data.token });
}
