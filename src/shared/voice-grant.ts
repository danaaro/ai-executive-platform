import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed voice grant: correlates an ElevenLabs voice session with a DB
 * conversation without trusting the client. The voice token endpoint signs
 * {conversationId, baseSeq, exp} for a conversation the signed-in user owns;
 * the client passes it to ElevenLabs as custom_llm_extra_body, and ElevenLabs
 * echoes it into every custom-LLM callback. The callback verifies the
 * signature before hydrating any conversation content — a forged or foreign
 * conversation id fails verification and gets no data.
 *
 * baseSeq = message count at session start: the callback prepends only
 * messages with seq < baseSeq (pre-session context); in-session turns come
 * from ElevenLabs' own history, so nothing is duplicated. After a dropped
 * call, the next session mints a fresh grant with a higher baseSeq and the
 * whole transcript carries over.
 */

export type VoiceGrant = {
  conversation_id: string;
  base_seq: number;
  exp: number; // unix seconds
  sig: string;
};

function secret(): string {
  const s = process.env.ELEVENLABS_CUSTOM_LLM_SECRET;
  if (!s) throw new Error("ELEVENLABS_CUSTOM_LLM_SECRET is not set");
  return s;
}

function payload(conversationId: string, baseSeq: number, exp: number): string {
  return `voice-grant:${conversationId}:${baseSeq}:${exp}`;
}

export function signVoiceGrant(
  conversationId: string,
  baseSeq: number,
  ttlSeconds = 2 * 60 * 60
): VoiceGrant {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac("sha256", secret())
    .update(payload(conversationId, baseSeq, exp))
    .digest("hex");
  return { conversation_id: conversationId, base_seq: baseSeq, exp, sig };
}

export function verifyVoiceGrant(grant: {
  conversation_id?: unknown;
  base_seq?: unknown;
  exp?: unknown;
  sig?: unknown;
}): { conversationId: string; baseSeq: number } | null {
  const { conversation_id, base_seq, exp, sig } = grant;
  if (
    typeof conversation_id !== "string" ||
    typeof base_seq !== "number" ||
    typeof exp !== "number" ||
    typeof sig !== "string"
  ) {
    return null;
  }
  if (exp < Math.floor(Date.now() / 1000)) return null;
  const expected = createHmac("sha256", secret())
    .update(payload(conversation_id, base_seq, exp))
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { conversationId: conversation_id, baseSeq: base_seq };
}

/**
 * ElevenLabs' documented behavior is to merge custom_llm_extra_body into the
 * request body it sends the custom LLM; some client versions nest it instead.
 * Accept both shapes.
 */
export function extractVoiceGrant(body: Record<string, unknown>): {
  conversationId: string;
  baseSeq: number;
} | null {
  const candidates: unknown[] = [
    body,
    body.elevenlabs_extra_body,
    body.custom_llm_extra_body,
  ];
  for (const c of candidates) {
    if (c && typeof c === "object" && "sig" in (c as Record<string, unknown>)) {
      const verified = verifyVoiceGrant(c as Record<string, unknown>);
      if (verified) return verified;
    }
  }
  return null;
}
