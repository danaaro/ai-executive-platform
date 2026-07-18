/**
 * Voice-session context handoff.
 *
 * The ElevenLabs voice leg starts a fresh conversation each session, so its
 * custom-LLM callback only ever sees that session's turns — switching
 * text → voice used to wipe the agent's memory of the chat so far. The chat
 * UI stashes its full message history here when it mints a voice token; the
 * voice-llm handler prepends the stash on every turn of the session, so one
 * continuous conversation spans both channels.
 *
 * KNOWN LIMIT (accepted, dev-stage): module-level store — single process,
 * effectively single concurrent voice user (we have one ElevenLabs agent).
 * The custom-LLM callback carries no user identity to correlate on; proper
 * per-session correlation lands with the database/session layer.
 */

export type HandoffMessage = { role: "user" | "assistant"; content: string };

const TTL_MS = 30 * 60 * 1000;

let stash: { messages: HandoffMessage[]; storedAt: number } | null = null;

export function setVoiceHandoff(messages: HandoffMessage[]): void {
  const clean = (Array.isArray(messages) ? messages : [])
    .filter(
      (m) =>
        (m?.role === "user" || m?.role === "assistant") &&
        typeof m?.content === "string" &&
        m.content.trim() !== ""
    )
    .map((m) => ({ role: m.role, content: m.content }));
  stash = { messages: clean, storedAt: Date.now() };
}

export function getVoiceHandoff(): HandoffMessage[] {
  if (!stash) return [];
  if (Date.now() - stash.storedAt > TTL_MS) {
    stash = null;
    return [];
  }
  return stash.messages;
}
