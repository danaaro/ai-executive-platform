import fs from "node:fs";
import path from "node:path";

/**
 * End-to-end check of the "Generate job description draft" path (Dana
 * 2026-08-13: "generating of the JD file is not working").
 *
 * That button does NOT call a generator endpoint — it sends
 * generateDraftPrompt() as an ordinary chat turn, and the resulting document
 * only becomes savable if findDeliverable() recognises it. So there are two
 * independent ways for it to look broken to the user:
 *   1. the model never produces the document (or truncates at max_tokens);
 *   2. the model produces it but the structural detector rejects it, so no
 *      "Save draft & review" button ever appears and the click seems inert.
 * This exercises both against a real model call.
 *
 * ⚠ NOT SUFFICIENT ON ITS OWN. This calls the orchestrator directly, so it
 * proves nothing about the HTTP route, the streaming protocol, or the client.
 * Passing here while the feature was still broken in the browser is exactly
 * what happened on 2026-08-13: the generation outlived the function budget, the
 * platform returned a gateway HTML page, and the browser threw an opaque parse
 * error — all in the layers this script skips. **`npm run test:document` is the
 * authoritative guard**; keep this one only as the cheap, server-free check of
 * prompt behaviour and deliverable detection.
 *
 * Run: npm run test:jd
 */

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}
loadEnv();

/** A realistic partial intake — the state a user is actually in when they hit the button. */
const INTAKE: { role: "user" | "assistant"; content: string }[] = [
  { role: "user", content: "Start the NEW JOB intake session." },
  {
    role: "assistant",
    content: "Happy to help. Tell me about the role and its purpose in your own words.",
  },
  {
    role: "user",
    content:
      "We're hiring a Head of DevOps at Northwind Payments, a fintech of about 400 people based in Tel Aviv, hybrid three days on site. " +
      "It's a new role. They'll own the whole delivery pipeline and manage twelve engineers across CI/CD, platform and SRE, reporting to me, the CTO. " +
      "The trigger is that our release cadence is too slow — we ship every three weeks and it should be daily. That's costing us customer commitments. " +
      "Budget for the function is around two million dollars a year. In the first ninety days I'd want a full audit of the pipeline and a credible plan to get to daily releases. " +
      "Success at one year means daily deploys, change failure rate under fifteen percent, and the team retained. " +
      "They need to have done this transformation before at a regulated company — PCI DSS matters here. " +
      "The hardest part of the job is that our engineering culture resists process, so they must lead change without authority. " +
      "Someone would fail here if they only knew tooling and couldn't influence senior engineers. " +
      "Comp is up to 950k ILS base plus equity. We benchmark against Payoneer, Rapyd and Melio.",
  },
];

async function main() {
  const { runAgentTurn } = await import("../src/orchestrator/agent-orchestrator");
  const { findDeliverable, generateDraftPrompt } = await import(
    "../src/components/review/deliverable"
  );

  const draftPrompt = generateDraftPrompt("job-description", "Job Description");
  console.log("Sending the same turn the 'Generate job description draft' button sends…\n");

  const started = Date.now();
  const reply = await runAgentTurn("job-description", [
    ...INTAKE,
    { role: "user", content: draftPrompt },
  ]);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`Model replied in ${seconds}s — ${reply.length} chars\n`);
  if (!reply.trim()) {
    console.log("✗ EMPTY REPLY — the model returned nothing at all.");
    process.exit(1);
  }

  console.log("--- first 20 lines of the reply ---");
  console.log(reply.split("\n").slice(0, 20).join("\n"));
  console.log("\n--- last 25 lines ---");
  console.log(reply.split("\n").slice(-25).join("\n"));
  console.log("--- end excerpt ---\n");

  // Now the second failure mode: does the UI consider this savable?
  const messages = [...INTAKE, { role: "user", content: draftPrompt }, { role: "assistant" as const, content: reply }];
  const deliverable = findDeliverable(messages as never);

  const checks: [string, boolean, string][] = [
    ["model produced a document", reply.length > 700, `${reply.length} chars`],
    [
      "reply contains the JD structure",
      /Our Team and You/i.test(reply) && /A Little Bit About You/i.test(reply),
      "required sections present",
    ],
    ["reply contains the Intake & Coverage Record", /```json/.test(reply), "JSON block present"],
    [
      "findDeliverable() detects it (Save button appears)",
      deliverable !== null,
      deliverable ? `detected at message ${deliverable.index}` : "NOT DETECTED — Save button never renders",
    ],
  ];

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} ${name} — ${detail}`);
  }

  if (!deliverable) {
    // The most useful diagnostic when detection fails: which structural rule rejected it.
    const body = reply.trim();
    const headings = (body.match(/^#{1,3} \S/gm) ?? []).length;
    const lines = body.split("\n").filter((l) => l.trim());
    const questionLines = (body.match(/^.*\?\s*$/gm) ?? []).length;
    console.log("\nWhy detection failed:");
    console.log(`  length ${body.length} (needs ≥700)`);
    console.log(`  headings ${headings} (needs ≥2, or ≥3 when using the long-doc path)`);
    console.log(`  opens with a Markdown title: ${/^#{1,3} \S/.test(lines[0] ?? "")}`);
    console.log(`  first line: ${JSON.stringify((lines[0] ?? "").slice(0, 100))}`);
    console.log(`  question-line ratio ${(questionLines / lines.length).toFixed(2)} (rejected above 0.35)`);
  }

  console.log(failed ? `\nFAILED — ${failed} check(s) failed.` : "\nPASSED — JD generation and detection both work.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
