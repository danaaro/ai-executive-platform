/**
 * Strips what is not part of the document from an agent's deliverable turn
 * (2026-10-30, Dana's Head of Marketing JD): the chat lead-in before the
 * title ("Got it — reports to the CEO. I'll mark the remaining items as
 * skipped and generate the Job Description now…") and the trailing JSON
 * session record the interview agent appends after a `---`. Both were saved,
 * shown on the review screen and printed in the Word/PDF export.
 *
 * Applied on save, on display and on export, so drafts saved before this fix
 * come out clean too. Pure function — safe in the browser and on the server.
 */
export function cleanDeliverable(text: string): string {
  let out = text.replace(/\r\n/g, "\n");

  // Lead-in: everything before the first Markdown heading. A document opens
  // with its title; anything above it is the agent talking to the user.
  const lines = out.split("\n");
  const firstHeading = lines.findIndex((l) => /^#{1,3} \S/.test(l.trim()));
  if (firstHeading > 0) out = lines.slice(firstHeading).join("\n");

  // Trailing data block: a ```json fence, or a bare fence opening on `{` / `[`,
  // through to the end — including an unclosed one (the saved record was cut
  // off mid-string) — when no heading follows it.
  const fence = out.search(/^```(?:json)?[ \t]*(?:\n\s*)?[{[]/m);
  if (fence >= 0 && !/^#{1,3} \S/m.test(out.slice(fence))) out = out.slice(0, fence);

  // A divider or blank lines left dangling where the record was.
  return out.replace(/(?:\n\s*(?:-{3,}|\*{3,}|_{3,})\s*)+\s*$/, "").trimEnd() + "\n";
}
