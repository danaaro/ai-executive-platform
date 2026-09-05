import fs from "node:fs";
import path from "node:path";
import { readAgentStream } from "../src/lib/api";
import { findDeliverable, generateDraftPrompt } from "../src/components/review/deliverable";

/**
 * The test that was missing when "JD generation works" was first claimed
 * (2026-08-13). The earlier guard called the orchestrator directly and so never
 * exercised the HTTP route, the streaming protocol, or the client reader — which
 * is precisely where the real failure lived: the reply arrived after the
 * function budget expired, the platform substituted a gateway HTML page, and
 * `res.json()` in the browser threw "The string did not match the expected
 * pattern." Two minutes of waiting, no usable error.
 *
 * So this drives the ACTUAL endpoint over HTTP with the ACTUAL client-side
 * stream reader, and asserts the properties that failing broke:
 *   - first byte arrives quickly (the connection is never idle long enough to
 *     be killed by a gateway);
 *   - the document arrives complete and terminated by a `done` event;
 *   - `findDeliverable()` accepts it, so the Save button actually renders.
 *
 * Setup is handled by the npm script — it starts a throwaway dev server with
 * `ALLOW_UNAUTHED_AGENT_ROUTES=1` (dev-only, see src/middleware.ts) and
 * `DATABASE_URL` cleared, so no Clerk session or project row is needed:
 *   npm run test:document
 *
 * To run against an already-running server on another port or the deployment,
 * set BASE_URL (that server must itself allow the request).
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3010";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

const INTAKE = [
  { role: "user" as const, content: "Start the NEW JOB intake session." },
  {
    role: "assistant" as const,
    content: "Happy to help. Tell me about the role and its purpose in your own words.",
  },
  {
    role: "user" as const,
    content:
      "We're hiring a Head of DevOps at Northwind Payments, a fintech of about 400 people based in Tel Aviv, hybrid three days on site. " +
      "It's a new role. They'll own the whole delivery pipeline and manage twelve engineers across CI/CD, platform and SRE, reporting to me, the CTO. " +
      "The trigger is that our release cadence is too slow — we ship every three weeks and it should be daily. That's costing us customer commitments. " +
      "Budget for the function is around two million dollars a year. In the first ninety days I'd want a full audit of the pipeline and a credible plan to get to daily releases. " +
      "Success at one year means daily deploys, change failure rate under fifteen percent, and the team retained. " +
      "They need to have done this transformation before at a regulated company — PCI DSS matters here. " +
      "The hardest part is that our engineering culture resists process, so they must lead change without authority. " +
      "Comp is up to 950k ILS base plus equity. We benchmark against Payoneer, Rapyd and Melio.",
  },
];

async function main() {
  const draftPrompt = generateDraftPrompt("job-description", "Job Description");
  const messages = [...INTAKE, { role: "user" as const, content: draftPrompt }];

  console.log(`POST ${BASE_URL}/api/job-description  (streaming)\n`);
  const started = Date.now();

  const res = await fetch(`${BASE_URL}/api/job-description`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, projectId: null, conversationId: null }),
  });

  const headersAt = Date.now() - started;
  const contentType = res.headers.get("content-type") ?? "";
  console.log(`  ${res.status} ${contentType} — headers in ${headersAt}ms`);

  if (!res.ok) {
    console.log(`✗ route rejected the request: ${await res.text()}`);
    process.exit(1);
  }

  let text = "";
  let openAt: number | null = null;
  let heartbeats = 0;
  let firstByteAt: number | null = null;
  // The property that actually matters: an idle socket is what gateways reap,
  // so measure the largest gap between consecutive events directly rather than
  // inferring liveness from a heartbeat count.
  let lastEventAt = Date.now();
  let maxGapMs = 0;
  let deltas = 0;
  let resets = 0;
  let doneSeen = false;
  let streamError: string | null = null;

  await readAgentStream(res, (event) => {
    const now = Date.now();
    maxGapMs = Math.max(maxGapMs, now - lastEventAt);
    lastEventAt = now;
    if (event.type === "open") {
      openAt = Date.now() - started;
    } else if (event.type === "heartbeat") {
      heartbeats++;
    } else if (event.type === "delta") {
      if (firstByteAt === null) firstByteAt = Date.now() - started;
      deltas++;
      text += event.text;
    } else if (event.type === "reset") {
      resets++;
      text = "";
    } else if (event.type === "done") {
      doneSeen = true;
    } else if (event.type === "error") {
      streamError = event.error;
    }
  });

  const totalMs = Date.now() - started;
  console.log(
    `  open at ${openAt}ms, first text at ${firstByteAt}ms, ${heartbeats} heartbeat(s), ` +
      `${deltas} delta events, ${resets} reset(s), ${text.length} chars, done=${doneSeen}, ` +
      `max idle gap ${(maxGapMs / 1000).toFixed(1)}s, total ${(totalMs / 1000).toFixed(1)}s`
  );
  if (streamError) console.log(`  stream error: ${streamError}`);
  console.log();

  const thread = [...messages, { role: "assistant" as const, content: text }];
  const deliverable = findDeliverable(thread);

  const checks: [string, boolean, string][] = [
    ["response is a stream, not one JSON blob", contentType.includes("x-ndjson"), contentType],
    [
      "headers flush immediately (fetch resolves in under 5s)",
      headersAt < 5_000,
      `${headersAt}ms`,
    ],
    [
      "connection never idle longer than 15s",
      maxGapMs < 15_000,
      `largest gap between events was ${(maxGapMs / 1000).toFixed(1)}s`,
    ],
    ["streamed incrementally (many events, not one)", deltas > 20, `${deltas} events`],
    ["terminated with a done event", doneSeen, doneSeen ? "yes" : "NO — client would treat as dropped"],
    ["no stream error", streamError === null, streamError ?? "none"],
    ["document is complete", /A Little Bit About You/i.test(text), "final JD section present"],
    ["JD structure present", /Our Team and You/i.test(text), "required sections"],
    [
      "findDeliverable() accepts it (Save button renders)",
      deliverable !== null,
      deliverable ? `detected at index ${deliverable.index}` : "NOT DETECTED",
    ],
  ];

  let failed = 0;
  for (const [name, ok, detail] of checks) {
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} ${name} — ${detail}`);
  }

  // The coverage record is emitted inconsistently on interim drafts; report it
  // rather than failing the run, since the JD and the Save path do not depend
  // on it. Tracked in the parent TODO.
  console.log(
    `${/```json/.test(text) ? "✓" : "○"} Intake & Coverage Record present — ${
      /```json/.test(text) ? "yes" : "absent this run (known variance, not a gate)"
    }`
  );

  console.log(failed ? `\nFAILED — ${failed} check(s).` : "\nPASSED — document creation works end to end.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
