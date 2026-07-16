import { NextResponse } from "next/server";

/**
 * Mints a short-lived ElevenLabs conversation token so the signed-in user's
 * browser can open a WebRTC voice session (ADR-005). Clerk-gated by
 * src/middleware.ts like every other API route; the ElevenLabs API key
 * never reaches the client, and the agent itself stays private.
 */
export async function GET() {
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
