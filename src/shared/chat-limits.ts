/**
 * Server-side limits on the chat history a browser may send (security review
 * 2026-10-17, finding #4). The history reaches the model and the database, so
 * an unbounded one is a cost and abuse lever.
 *
 * Sized for real use: an uploaded document arrives as one user turn of at most
 * ~60K characters (upload-parse MAX_CHARS) plus framing, and a long intake is a
 * few hundred short turns. Anything larger is refused, never truncated
 * silently.
 *
 * Still open (JD v3): the server should rebuild the history from the database
 * instead of trusting the browser's copy at all.
 */
export const CHAT_LIMITS = {
  maxMessages: 400,
  maxMessageChars: 80_000,
  maxTotalChars: 600_000,
} as const;

export type ValidChatMessage = { role: "user" | "assistant"; content: string };

export function validateChatMessages(
  input: unknown,
  opts: { allowEmpty?: boolean } = {}
): { ok: true; messages: ValidChatMessage[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "messages[] is required" };
  if (input.length === 0 && !opts.allowEmpty) return { ok: false, error: "messages[] is required" };
  if (input.length > CHAT_LIMITS.maxMessages) {
    return { ok: false, error: `Too many messages (limit ${CHAT_LIMITS.maxMessages}).` };
  }
  let total = 0;
  const messages: ValidChatMessage[] = [];
  for (const m of input) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return { ok: false, error: "Each message needs role 'user' or 'assistant' and text content." };
    }
    if (content.length > CHAT_LIMITS.maxMessageChars) {
      return { ok: false, error: `A message is too long (limit ${CHAT_LIMITS.maxMessageChars} characters).` };
    }
    total += content.length;
    if (total > CHAT_LIMITS.maxTotalChars) {
      return { ok: false, error: "This conversation is too long to send in one request." };
    }
    messages.push({ role, content });
  }
  return { ok: true, messages };
}
