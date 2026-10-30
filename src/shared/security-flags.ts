import { adminDb, tables } from "@/db";
import { errorSummary } from "@/shared/safe-log";

/**
 * Detects and logs attempts to take an agent off-topic, to learn how it works,
 * or to inject instructions (Dana 2026-10-29: "we want to see in the logs that
 * such an attempt was made, and be notified").
 *
 * No extra model call: the agent's own polite replies (prompts/system/
 * guardrails.md) mark exactly the turns where it declined something, and a
 * keyword rule catches obvious injection attempts it may have shrugged off.
 */

export type FlagKind = "ip_probe" | "off_topic" | "injection";

const IP_REPLY = /proprietary method/i;
const OFF_TOPIC_REPLY = /\b(here only to help|only here to help|can['’]t help with that)\b/i;
const INJECTION =
  /\b(ignore (all |any |your |the )?(previous |prior |above )?(instructions|rules|prompt)|system prompt|your (instructions|prompt|rules|guidelines)|reveal your|print (everything|all) above|developer mode|jailbreak|you are now (a|an)\b|pretend (you are|to be)|how (were|are) you (built|trained|programmed|made)|what model are you|which (llm|model) (are you|do you use))/i;

export function detectFlags(userText: string, replyText: string): FlagKind[] {
  const kinds: FlagKind[] = [];
  if (IP_REPLY.test(replyText)) kinds.push("ip_probe");
  else if (OFF_TOPIC_REPLY.test(replyText)) kinds.push("off_topic");
  if (INJECTION.test(userText) && !kinds.includes("ip_probe")) kinds.push("injection");
  return kinds;
}

/** Never throws: a logging failure must not cost the user their reply. */
export async function recordSecurityFlags(input: {
  companyId: string | null;
  projectId: string | null;
  conversationId: string | null;
  userId: string | null;
  agentSlug: string;
  channel: "text" | "voice";
  userText: string;
  replyText: string;
}): Promise<void> {
  const kinds = detectFlags(input.userText, input.replyText);
  if (!kinds.length) return;
  const excerpt = input.userText.replace(/\s+/g, " ").trim().slice(0, 280);
  try {
    await adminDb()
      .insert(tables.securityFlags)
      .values(
        kinds.map((kind) => ({
          companyId: input.companyId,
          projectId: input.projectId,
          conversationId: input.conversationId,
          userId: input.userId,
          agentSlug: input.agentSlug,
          channel: input.channel,
          kind,
          excerpt,
        }))
      );
    console.warn(`[security-flag] ${kinds.join(",")} · ${input.agentSlug} · ${input.channel} · company ${input.companyId ?? "-"}`);
  } catch (err) {
    console.error("[security-flag] could not record:", errorSummary(err));
  }
}
