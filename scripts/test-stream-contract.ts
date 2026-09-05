import { parseJson, readAgentStream } from "../src/lib/api";
import { encodeAgentStreamEvent, type AgentStreamEvent } from "../src/shared/agent-stream";

/**
 * Fast, offline guards for the two client-side contracts whose failure produced
 * the "The string did not match the expected pattern." report (2026-08-13).
 *
 * A. parseJson must never let a browser's internal JSON.parse message reach the
 *    user. When something upstream of our API answers — a gateway timeout page,
 *    a 502, an empty body — the user is entitled to a sentence that names what
 *    happened, not WebKit's phrasing for "that wasn't JSON".
 *
 * B. readAgentStream must reassemble NDJSON across arbitrary chunk boundaries.
 *    Network chunks split mid-object routinely; a reader that parses per chunk
 *    works in dev and corrupts long documents in production.
 *
 * No network, no model, no cost — run it on every change: npm run test:stream
 */

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function response(body: string, init: ResponseInit = {}): Response {
  return new Response(body, init);
}

async function expectThrow(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function partA() {
  console.log("\nA. parseJson never surfaces a raw JSON.parse error\n");

  // The exact shape of a serverless gateway timeout: HTML body, 504 status.
  const gatewayHtml =
    "<!DOCTYPE html><html><head><title>504: GATEWAY_TIMEOUT</title></head>" +
    "<body>An error occurred with your deployment: FUNCTION_INVOCATION_TIMEOUT</body></html>";

  const timeoutMsg = await expectThrow(() =>
    parseJson(response(gatewayHtml, { status: 504, statusText: "Gateway Timeout" }))
  );
  check("504 HTML gets a human explanation", timeoutMsg.length > 0 && /too long/i.test(timeoutMsg), timeoutMsg);
  check(
    "504 HTML does NOT leak the browser's parser wording",
    !/did not match the expected pattern|Unexpected token|not valid JSON/i.test(timeoutMsg),
    timeoutMsg.slice(0, 60)
  );
  check("504 message tells the user their work is safe", /saved/i.test(timeoutMsg));

  const badGateway = await expectThrow(() => parseJson(response("<html>502</html>", { status: 502 })));
  check("502 HTML also explained, not leaked", /too long/i.test(badGateway), badGateway.slice(0, 50));

  const empty = await expectThrow(() => parseJson(response("", { status: 200 })));
  check("empty 200 body reports emptiness", /empty/i.test(empty), empty);

  const emptyErr = await expectThrow(() => parseJson(response("", { status: 500, statusText: "Internal Server Error" })));
  check("empty error body reports the status", /500/.test(emptyErr), emptyErr);

  const htmlOk = await expectThrow(() => parseJson(response("<html>hi</html>", { status: 200 })));
  check("non-JSON 200 is still an explained failure", /Unexpected response/i.test(htmlOk), htmlOk);

  // Our own API errors must pass their message straight through.
  const apiErr = await expectThrow(() =>
    parseJson(response(JSON.stringify({ error: "You have view-only access to this position" }), { status: 403 }))
  );
  check("our API's own error text is preserved verbatim", apiErr === "You have view-only access to this position", apiErr);

  const good = await parseJson<{ id: string }>(
    response(JSON.stringify({ id: "abc" }), { status: 200 })
  );
  check("valid JSON parses normally", good.id === "abc");
}

async function partB() {
  console.log("\nB. readAgentStream reassembles NDJSON across chunk boundaries\n");

  const events: AgentStreamEvent[] = [
    { type: "open" },
    { type: "heartbeat", elapsedMs: 10_000 },
    { type: "delta", text: "# Job Description\n\n" },
    { type: "delta", text: "Head of DevOps — a very long line of prose that a chunk will split." },
    { type: "delta", text: "\n\nMore text with a \"quoted\" segment and a \\ backslash." },
    { type: "done", conversationId: "conv-1" },
  ];
  const wire = events.map(encodeAgentStreamEvent).join("");

  /** Feeds the payload in fixed-size slices, cutting objects wherever they fall. */
  async function readWithChunkSize(size: number) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(wire);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += size) {
          controller.enqueue(bytes.slice(i, i + size));
        }
        controller.close();
      },
    });
    const received: AgentStreamEvent[] = [];
    await readAgentStream(new Response(stream), (e) => received.push(e));
    return received;
  }

  for (const size of [1, 3, 7, 64, 100_000]) {
    const received = await readWithChunkSize(size);
    const text = received
      .filter((e): e is { type: "delta"; text: string } => e.type === "delta")
      .map((e) => e.text)
      .join("");
    const expectedText = events
      .filter((e): e is { type: "delta"; text: string } => e.type === "delta")
      .map((e) => e.text)
      .join("");
    const done = received.find((e) => e.type === "done");
    check(
      `chunk size ${size}: all ${events.length} events, text intact, done seen`,
      received.length === events.length && text === expectedText && done !== undefined,
      `${received.length} events, ${text.length}/${expectedText.length} chars`
    );
  }

  // A corrupt line must not abort an otherwise fine turn.
  const withGarbage =
    encodeAgentStreamEvent({ type: "delta", text: "before" }) +
    "{not json at all}\n" +
    encodeAgentStreamEvent({ type: "delta", text: "after" }) +
    encodeAgentStreamEvent({ type: "done", conversationId: null });
  const received: AgentStreamEvent[] = [];
  await readAgentStream(new Response(withGarbage), (e) => received.push(e));
  const text = received
    .filter((e): e is { type: "delta"; text: string } => e.type === "delta")
    .map((e) => e.text)
    .join("");
  check("one malformed line is skipped, the turn survives", text === "beforeafter" && received.length === 3, text);

  // A stream that stops without `done` must be detectable — that is how the
  // client knows to fall back to DB recovery instead of showing a half document.
  const truncated = encodeAgentStreamEvent({ type: "delta", text: "half a document" });
  const partial: AgentStreamEvent[] = [];
  await readAgentStream(new Response(truncated), (e) => partial.push(e));
  check(
    "a stream with no done event is distinguishable",
    !partial.some((e) => e.type === "done"),
    "client treats this as a dropped turn"
  );
}

async function main() {
  await partA();
  await partB();
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
