"use client";

import type { AgentStreamEvent } from "@/shared/agent-stream";

/**
 * Client-side response handling (2026-08-13).
 *
 * Every fetch in this app used to do a bare `await res.json()`. That is fine
 * until something upstream of our code answers — a serverless gateway timeout,
 * a platform 502, an auth redirect to an HTML page — at which point `res.json()`
 * throws the *browser's* internal parse error and that string is what the user
 * reads. The real report from the field was two minutes of waiting followed by
 * "The string did not match the expected pattern." (Safari's wording for
 * JSON.parse failing), which names neither the timeout nor the operation.
 *
 * `parseJson` guarantees the caller either gets parsed JSON or an Error whose
 * message is worth showing to a person.
 */

/** Longest plausible generation, past which we stop believing the connection. */
const NON_JSON_HINT =
  "The server didn't return a proper response. This usually means the request took too long — your work is saved, so reopen this stage to pick it up.";

export async function parseJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();

  if (!text.trim()) {
    throw new Error(
      res.ok
        ? "The server returned an empty response."
        : `Request failed (${res.status} ${res.statusText || "no status text"}).`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // Not JSON — almost always an infrastructure page rather than our API.
    // Surface the status, which is the genuinely diagnostic part.
    const looksLikeTimeout = res.status === 504 || res.status === 502 || /timeout/i.test(text);
    throw new Error(
      looksLikeTimeout
        ? NON_JSON_HINT
        : `Unexpected response from the server (${res.status}). Please try again.`
    );
  }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return data as T;
}

/**
 * Reads a newline-delimited-JSON agent stream, calling `onEvent` per event.
 *
 * Chunk boundaries land anywhere, including mid-object, so a partial trailing
 * line is held in `buffer` until its newline arrives — splitting per chunk and
 * parsing eagerly would throw on perfectly valid output.
 */
export async function readAgentStream(
  res: Response,
  onEvent: (event: AgentStreamEvent) => void
): Promise<void> {
  if (!res.body) throw new Error("The server returned no response body.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const drain = (flush: boolean) => {
    const lines = buffer.split("\n");
    // Unless flushing, the last element is an incomplete line — keep it.
    buffer = flush ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line) as AgentStreamEvent);
      } catch {
        // A single malformed line must not abort a turn that is otherwise fine.
        console.warn("[agent-stream] skipped unparseable line:", line.slice(0, 200));
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    drain(false);
  }
  buffer += decoder.decode();
  drain(true);
}
