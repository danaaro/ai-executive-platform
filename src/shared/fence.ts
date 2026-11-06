/**
 * Prompt-injection protection (security plan S1, 2026-11-06): material the
 * agent reads (customer documents, the company profile, Company Intel,
 * transcripts, recorded answers, CVs) goes into the prompt inside a named tag.
 * prompts/system/guardrails.md tells every agent that tag contents are data,
 * never instructions.
 *
 * Inside the content, any of our own tags is neutralised (its "<" becomes
 * "‹"), so a document cannot close its fence early and continue as if it
 * were the platform speaking.
 */

export const FENCE_TAGS = [
  "company_profile",
  "company_document",
  "company_intelligence",
  "job_description",
  "current_job_description",
  "recorded_answers",
  "briefing_transcript",
  "notes",
  "candidate_cv",
  "interview_transcript",
  "uploaded_document",
  // Company Intel research inputs (admin-only tool; third-party websites).
  "document",
  // The interview kit's own tags (hiring-toolkit partials/safety.md).
  "cv",
  "transcript",
  "tests",
  "rubric",
] as const;
export type FenceTag = (typeof FENCE_TAGS)[number];

// Look-alikes are matched only where they form one of our tags, so ordinary
// text is never altered (security review 2026-11-06): "<" or a look-alike
// bracket (full-width, small form, angle) or its HTML entity; invisible format
// characters (zero-width spaces, joiners, direction marks) anywhere in the tag;
// spaces or hyphens for "_" ("company-document").
const GAP = "[\\s\\p{Cf}]*";
const OPEN = "(?:<|\\uFF1C|\\uFE64|\\u3008|\\u2329|&lt;|&#0*60;|&#x0*3c;)";
const NAMES = FENCE_TAGS.map((t) =>
  [...t].map((c) => (c === "_" ? `[\\s\\p{Cf}_-]*` : `${c}\\p{Cf}*`)).join("")
).join("|");
const OUR_TAGS = new RegExp(`${OPEN}(${GAP}/?${GAP})(?:${NAMES})(?![\\w-])`, "giu");

/** The content with every one of our tags neutralised ("<" becomes "‹"). */
export function neutralise(content: string): string {
  return content.replace(OUR_TAGS, (m) => "‹" + m.replace(/^(?:<|\uFF1C|\uFE64|\u3008|\u2329|&lt;|&#0*60;|&#x0*3c;)/i, ""));
}

const attrValue = (v: string) => v.replace(/["<>\n\r]/g, " ").slice(0, 200);

/** `<tag name="…">content</tag>`, with the content neutralised. */
export function fence(tag: FenceTag, content: string, attrs: Record<string, string> = {}): string {
  const a = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${attrValue(v)}"`)
    .join("");
  return `<${tag}${a}>\n${neutralise(content)}\n</${tag}>`;
}
