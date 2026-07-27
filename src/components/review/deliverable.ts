import type { Message } from "@/components/intake/use-intake-session";

/**
 * Finds the agent's actual DELIVERABLE in a thread.
 *
 * Saving "the last assistant message" is wrong and was a real bug: mid-interview
 * the last thing the agent said is a follow-up question ("How big is the team?"),
 * so Save stored the question as v1 of the job description. The artifact is the
 * long-form document the agent produced, which is often several turns back.
 *
 * Detection is structural, deliberately NOT keyed to Susan's exact section
 * names: the JD prompt's required headings are still being tuned (the open eval
 * finding about structure/word count), and a detector pinned to today's wording
 * would silently stop finding drafts the moment the prompt changes. What is
 * stable across every agent in the suite is the SHAPE — a multi-section Markdown
 * document, substantially longer than conversational turns.
 */

export type Deliverable = { content: string; index: number; isLatest: boolean };

const MIN_DELIVERABLE_CHARS = 700;
const MIN_HEADINGS = 2;
/** A bare lead-in like "Here it is:" may precede the title; a paragraph may not. */
const MAX_PREAMBLE_CHARS = 60;
/** Long + heavily sectioned is a document even if it opens conversationally. */
const LONG_DOC_CHARS = 3000;
const LONG_DOC_HEADINGS = 3;

function headingCount(text: string): number {
  return (text.match(/^#{1,3} \S/gm) ?? []).length;
}

function isHeading(line: string): boolean {
  return /^#{1,3} \S/.test(line.trim());
}

/**
 * The decisive signal, validated against every artifact and every assistant
 * turn in the live database: a deliverable OPENS with a Markdown title; an
 * intake summary opens with a sentence.
 *
 * That is not a coincidence to be tuned away — Susan's prompts mandate Title
 * as section 1 of every artifact, so all three real artifacts start `# …`,
 * while the "here's my intake summary" turns start with prose and only reach
 * a `##` a sentence later. Hence the tight preamble allowance: a generous
 * look-ahead re-admitted exactly those summaries.
 *
 * Bold pseudo-headings are deliberately NOT counted — summaries are full of
 * `**Business context & purpose**` bullets, which is what produced the first
 * round of false positives.
 */
function opensWithTitle(body: string): boolean {
  const lines = body.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return false;
  if (isHeading(lines[0])) return true;
  // "Here it is:" / "Final version:" then the title.
  return lines[0].trim().length <= MAX_PREAMBLE_CHARS && lines[1] !== undefined && isHeading(lines[1]);
}

function looksLikeDocument(text: string): boolean {
  const body = text.trim();
  if (body.length < MIN_DELIVERABLE_CHARS) return false;
  if (headingCount(body) < MIN_HEADINGS) return false;

  const longAndSectioned =
    body.length >= LONG_DOC_CHARS && headingCount(body) >= LONG_DOC_HEADINGS;
  if (!opensWithTitle(body) && !longAndSectioned) return false;

  // A long message that is mostly an enumerated set of QUESTIONS is the agent
  // bundling questionnaire items (its documented interview style), not a draft.
  const questionLines = (body.match(/^.*\?\s*$/gm) ?? []).length;
  const totalLines = body.split("\n").filter((l) => l.trim()).length;
  if (totalLines > 0 && questionLines / totalLines > 0.35) return false;

  return true;
}

export function findDeliverable(messages: Message[]): Deliverable | null {
  const lastAssistantIndex = messages.map((m) => m.role).lastIndexOf("assistant");

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    if (looksLikeDocument(m.content)) {
      return { content: m.content, index: i, isLatest: i === lastAssistantIndex };
    }
  }
  return null;
}

/**
 * The turn sent when the user asks for a draft before the agent has produced
 * one. The JD agent's prompt defers generation until every questionnaire item
 * is resolved (Phase 2) — this is the user deliberately overriding that to see
 * an interim draft, so it must ask for gaps to be flagged rather than invented.
 */
export function generateDraftPrompt(agentSlug: string, stageName: string): string {
  if (agentSlug === "job-description") {
    return (
      "Please produce an interim draft of the job description now, using everything I have given you so far — " +
      "even though the questionnaire isn't fully resolved. Follow your required structure exactly, and include " +
      "the Intake & Coverage Record. Where information is still missing, write a clearly marked placeholder such " +
      "as [TO CONFIRM: …] rather than inventing anything. Then tell me which questions still need answering."
    );
  }
  return (
    `Please produce an interim draft of the ${stageName.toLowerCase()} now, using everything provided so far. ` +
    "Follow your required output structure, mark anything still unknown as [TO CONFIRM: …] rather than inventing it, " +
    "and then tell me what you still need."
  );
}
