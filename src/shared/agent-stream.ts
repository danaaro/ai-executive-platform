/**
 * The wire protocol for a streamed agent turn (2026-08-13).
 *
 * Replaces the single JSON response both text-agent routes used to return.
 * That design had a failure mode the user actually hit: a full artifact takes
 * 90-120s to generate, nothing at all was sent until it finished, and when the
 * generation outlived the serverless function budget the platform replaced our
 * response with its own gateway-timeout HTML page. The browser then ran
 * `res.json()` over HTML and threw a parse error with no usable text in it
 * ("The string did not match the expected pattern" on Safari) — two minutes of
 * waiting ending in a message that named neither the timeout nor the agent.
 *
 * Newline-delimited JSON, chosen over SSE because there is no browser
 * EventSource in play (the client reads the body directly) and NDJSON needs no
 * framing conventions:
 *
 *   {"type":"delta","text":"…"}                     — append to the reply
 *   {"type":"reset"}                                — discard the reply so far and start over
 *   {"type":"done","conversationId":…,"inherited":…} — turn committed
 *   {"type":"error","error":"…"}                    — turn failed mid-stream
 *
 * Two properties matter and are why this fixes the bug rather than hiding it:
 * first bytes leave within seconds so the connection is never idle long enough
 * to be timed out, and a failure *after* headers are sent still arrives as a
 * structured `error` event instead of a body the client cannot parse.
 */

export type AgentStreamEvent =
  /**
   * Sent immediately, before the model is even called. Load-bearing: measured
   * 2026-08-13, `fetch` did not resolve its headers for 54.8s because Next.js
   * holds them until the first chunk is written, and claude-sonnet-5 spends
   * that long on adaptive thinking before emitting any text. The connection was
   * therefore idle for ~55s of a 109s request — which is what a gateway kills.
   */
  | { type: "open" }
  /** Emitted while the model is thinking, so the connection is never idle. */
  | { type: "heartbeat"; elapsedMs: number }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | {
      type: "done";
      conversationId: string | null;
      inherited?: { agentSlug: string; name: string; version: number }[];
    }
  | { type: "error"; error: string };

export const AGENT_STREAM_CONTENT_TYPE = "application/x-ndjson";

/** Headers that keep proxies from buffering the stream into one lump. */
export const AGENT_STREAM_HEADERS = {
  "Content-Type": AGENT_STREAM_CONTENT_TYPE,
  "Cache-Control": "no-cache, no-transform",
  // Vercel/nginx honour this; without it an edge buffer can hold the whole
  // body and reintroduce exactly the silence this protocol removes.
  "X-Accel-Buffering": "no",
} as const;

export function encodeAgentStreamEvent(event: AgentStreamEvent): string {
  return JSON.stringify(event) + "\n";
}

/**
 * Builds the streaming Response. `run` receives an `emit` for deltas and
 * returns the final text plus whatever the `done` event should carry.
 *
 * The model call happens INSIDE the stream body, not before it, so the first
 * chunk can be flushed while the model is still thinking — the same reason the
 * voice adapter is structured this way.
 */
/** Cadence of liveness pings while the model is thinking. */
const HEARTBEAT_MS = 10_000;

export function agentStreamResponse(
  run: (emit: (event: AgentStreamEvent) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: AgentStreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeAgentStreamEvent(event)));
      };

      // FIRST, before anything slow: flush a byte so the client's fetch()
      // resolves its headers now rather than after the model's thinking phase.
      const startedAt = Date.now();
      emit({ type: "open" });

      // Keep the connection demonstrably alive through the thinking phase.
      // Without this the socket is idle from `open` until the first text token
      // — 55s on a real JD generation — and an idle socket is what proxies and
      // serverless gateways reap.
      const heartbeat = setInterval(
        () => emit({ type: "heartbeat", elapsedMs: Date.now() - startedAt }),
        HEARTBEAT_MS
      );

      try {
        await run(emit);
      } catch (err) {
        console.error("[agent-stream] turn failed:", err);
        emit({
          type: "error",
          error: err instanceof Error ? err.message : "The agent request failed",
        });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: AGENT_STREAM_HEADERS });
}
