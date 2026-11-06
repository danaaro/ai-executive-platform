import { and, eq, gt, isNull } from "drizzle-orm";
import { adminDb, tables } from "@/db";
import { errorSummary } from "@/shared/safe-log";
import { containsFenceTag } from "@/shared/fence";

/**
 * Detects and logs attempts to take an agent off-topic, to learn how it works,
 * or to inject instructions (Dana 2026-10-29: "we want to see in the logs that
 * such an attempt was made, and be notified").
 *
 * No extra model call: the agent's own polite replies (prompts/system/
 * guardrails.md) mark exactly the turns where it declined something, and a
 * keyword rule catches obvious injection attempts it may have shrugged off.
 */

export type FlagKind = "ip_probe" | "off_topic" | "injection" | "upload_injection";

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

/* ---------------- Uploaded documents (Dana 2026-11-06) ---------------- */

/**
 * Instructions aimed at AI tools inside an uploaded document. Stricter than
 * the chat rule above: a normal company document may well say "follow your
 * guidelines", and an AI company's JD may well mention "system prompt design"
 * or "jailbreak testing" (we recruit AI leaders). So two levels:
 * - REFUSE: commands addressed to an AI, or our own prompt tags;
 * - FLAG ONLY: AI vocabulary that is suspicious but legitimate in context.
 */
const REFUSE: [string, RegExp][] = [
  ["ignore-instructions", /\b(ignore|disregard|forget|override|bypass)\s+(all\s+|any\s+|the\s+|your\s+|these\s+|those\s+)?(previous\s+|prior\s+|above\s+|earlier\s+|other\s+)?(instructions|prompts?|guardrails|system\s+rules)\b/i],
  ["addressed-to-ai", /\b(you\s+are\s+now\s+(an?\s+)?\w+|if\s+you\s+are\s+an?\s+(ai|language\s+model|llm|chatbot|assistant)|(note|message|attention|instructions?)\s+(to|for)\s+(the\s+|any\s+)?(ai|llm|assistant|language\s+model|chatbot)s?\b)/i],
  ["reveal-instructions", /\b(reveal|print|show|repeat|output|leak)\s+(me\s+)?your\s+(instructions|system\s+prompt|prompt|hidden\s+rules)\b/i],
  ["new-instructions", /\bnew\s+instructions\s*:/i],
];
const FLAG_ONLY: [string, RegExp][] = [
  ["system-prompt", /\b(system|developer)\s+(prompt|override|instructions?)\b/i],
  ["ai-persona", /\b(you\s+are\s+an?\s+(ai|ai\s+assistant|chatbot|language\s+model|llm|chatgpt|claude)|as\s+an\s+ai\s+(assistant|language\s+model|model))\b/i],
  ["jailbreak", /\b(jailbreak|developer\s+mode|dan\s+mode|do\s+anything\s+now)\b/i],
  ["role-tags", /<\s*\/?\s*(system|assistant|instructions?)\s*>/i],
];

export type DocumentFinding = { rule: string; snippet: string; refuse: boolean };

export function detectDocumentInjection(text: string): DocumentFinding | null {
  const snip = (m: RegExpExecArray) =>
    text.slice(Math.max(0, m.index - 80), m.index + m[0].length + 120).replace(/\s+/g, " ").trim();
  for (const [rule, rx] of REFUSE) {
    const m = rx.exec(text);
    if (m) return { rule, snippet: snip(m), refuse: true };
  }
  if (containsFenceTag(text)) return { rule: "platform-tags", snippet: "", refuse: true };
  for (const [rule, rx] of FLAG_ONLY) {
    const m = rx.exec(text);
    if (m) return { rule, snippet: snip(m), refuse: false };
  }
  return null;
}

/** What the user sees when a document is refused. */
export const UPLOAD_REFUSED =
  "This document contains instructions aimed at AI tools, so it can't be used. Remove that text and upload it again, or contact Exec10X if you think this is a mistake.";

/**
 * Checks an uploaded document. Any hit is recorded as an "upload_injection"
 * flag (Flagged activity); a REFUSE-level hit also returns the refusal the
 * route sends back. Never throws.
 */
export async function checkUploadedDocument(input: {
  companyId: string | null;
  projectId: string | null;
  userId: string | null;
  source: string;
  filename: string;
  text: string;
}): Promise<string | null> {
  const hit = detectDocumentInjection(input.text);
  if (!hit) return null;
  const outcome = hit.refuse ? "refused" : "accepted";
  const excerpt = `${outcome} · ${input.filename.slice(0, 80)} · ${hit.rule}${hit.snippet ? ` · ${hit.snippet}` : ""}`.slice(0, 280);
  try {
    // The same attempt repeated within 10 minutes is logged once, so nobody
    // can flood Flagged activity (security review 2026-11-06).
    const [recent] = await adminDb()
      .select({ id: tables.securityFlags.id })
      .from(tables.securityFlags)
      .where(
        and(
          eq(tables.securityFlags.kind, "upload_injection"),
          eq(tables.securityFlags.agentSlug, input.source),
          input.userId ? eq(tables.securityFlags.userId, input.userId) : isNull(tables.securityFlags.userId),
          eq(tables.securityFlags.excerpt, excerpt),
          gt(tables.securityFlags.createdAt, new Date(Date.now() - 10 * 60 * 1000))
        )
      )
      .limit(1);
    if (!recent) await adminDb().insert(tables.securityFlags).values({
      companyId: input.companyId,
      projectId: input.projectId,
      conversationId: null,
      userId: input.userId,
      agentSlug: input.source,
      channel: "text",
      kind: "upload_injection",
      excerpt,
    });
    console.warn(`[security-flag] upload_injection · ${outcome} · ${input.source} · ${hit.rule} · company ${input.companyId ?? "-"}`);
  } catch (err) {
    console.error("[security-flag] could not record:", errorSummary(err));
  }
  return hit.refuse ? UPLOAD_REFUSED : null;
}

