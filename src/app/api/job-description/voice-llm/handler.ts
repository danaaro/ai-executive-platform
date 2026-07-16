import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildJobDescriptionSystemPrompt } from "@/orchestrator/job-description-orchestrator";
import { getAnthropicClient, DEFAULT_MODEL } from "@/shared/anthropic-client";

/**
 * Appended only on the voice channel: the same agent brain, but replies are
 * spoken aloud by TTS, so they must sound like speech, not read like a doc.
 */
const VOICE_CHANNEL_NOTE =
  "\n\n---\n\n# Channel note: LIVE VOICE\n\n" +
  "This is a LIVE VOICE conversation — the user is speaking to you and your reply is " +
  "spoken aloud via text-to-speech. Live voice IS fully supported; never say it is " +
  "unavailable or planned for later. Speak naturally: short conversational sentences, " +
  "one question at a time, no markdown, no bullet lists, no headings. When you reach " +
  "the final job description and intake record, offer to continue in text chat so the " +
  "user can read and copy them, rather than reading long documents aloud.";

/**
 * Shared cached prefix + voice-only suffix. The base prompt block carries the
 * cache breakpoint and is byte-identical to the text channel's system block,
 * so voice and text turns read the same Anthropic prompt-cache entry; the
 * voice note sits AFTER the breakpoint and doesn't invalidate it.
 */
function buildVoiceSystemBlocks() {
  return [
    {
      type: "text" as const,
      text: buildJobDescriptionSystemPrompt(),
      cache_control: { type: "ephemeral" as const },
    },
    { type: "text" as const, text: VOICE_CHANNEL_NOTE },
  ];
}

/**
 * Custom-LLM adapter for ElevenLabs Agents (ADR-005): an OpenAI-compatible
 * /chat/completions endpoint that ElevenLabs calls server-to-server for every
 * voice turn. It injects the SAME system prompt the text-chat route uses
 * (buildJobDescriptionSystemPrompt), so voice and text run one agent brain.
 *
 * This route is NOT Clerk-gated (the caller is ElevenLabs' infrastructure,
 * not a browser session) — it is exempted in src/middleware.ts and
 * authenticated by the ELEVENLABS_CUSTOM_LLM_SECRET bearer token instead.
 */

type OpenAIContentPart = { type: string; text?: string };
type OpenAIMessage = {
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content: string | OpenAIContentPart[] | null;
};

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ELEVENLABS_CUSTOM_LLM_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    // Masked diagnostic: enough to see WHICH secret the caller sent, never the whole value.
    console.warn(
      `voice-llm 401: received ${token ? `token ${token.slice(0, 6)}…(len ${token.length})` : "no bearer token"}, expected …(len ${secret.length}) starting ${secret.slice(0, 6)}`
    );
  }
  return ok;
}

function contentToText(content: OpenAIMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => p.text ?? "").join("");
  return "";
}

/**
 * OpenAI-format turns → Anthropic turns: drop system/tool messages (our own
 * system prompt is injected separately), merge consecutive same-role turns
 * (Anthropic requires strict alternation), and guarantee the conversation
 * starts with a user turn — using the same intake-start sentinel as the
 * text chat UI so a voice session opens the interview identically.
 */
function toAnthropicMessages(
  messages: OpenAIMessage[]
): { role: "user" | "assistant"; content: string }[] {
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = contentToText(m.content).trim();
    if (!text) continue;
    const prev = turns[turns.length - 1];
    if (prev && prev.role === m.role) {
      prev.content += "\n" + text;
    } else {
      turns.push({ role: m.role, content: text });
    }
  }
  if (turns.length === 0 || turns[0].role !== "user") {
    turns.unshift({ role: "user", content: "Start the NEW JOB intake session." });
  }
  return turns;
}

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function chunk(
  id: string,
  created: number,
  model: string,
  delta: Record<string, unknown>,
  finishReason: string | null
) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

export async function handleVoiceLlm(req: NextRequest): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const requestedModel: string = body.model ?? "job-description-agent";
  const anthropicMessages = toAnthropicMessages(body.messages ?? []);
  const id = `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const created = Math.floor(Date.now() / 1000);
  const maxTokens = Math.min(Number(body.max_tokens) || 2048, 8192);
  // NOTE: body.temperature is deliberately ignored — claude-sonnet-5 rejects the param.
  // ElevenLabs' OpenAI client sends stream_options.include_usage and expects
  // a final usage chunk (empty choices) before [DONE]; omitting it fails the turn.
  const includeUsage: boolean = body.stream_options?.include_usage === true;

  try {
    if (body.stream === false) {
      const response = await getAnthropicClient().messages.create({
        model: DEFAULT_MODEL,
        max_tokens: maxTokens,
        system: buildVoiceSystemBlocks(),
        messages: anthropicMessages,
      });
      const text = response.content.find((b) => b.type === "text");
      return NextResponse.json({
        id,
        object: "chat.completion",
        created,
        model: requestedModel,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: text && text.type === "text" ? text.text : "",
            },
            finish_reason: "stop",
          },
        ],
      });
    }

    const anthropicStream = await getAnthropicClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      system: buildVoiceSystemBlocks(),
      messages: anthropicMessages,
      stream: true,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(
              sse(chunk(id, created, requestedModel, { role: "assistant", content: "" }, null))
            )
          );
          let inputTokens = 0;
          let outputTokens = 0;
          let cachedTokens = 0;
          for await (const event of anthropicStream) {
            if (event.type === "message_start") {
              const u = event.message.usage;
              cachedTokens = u.cache_read_input_tokens ?? 0;
              // Total prompt = uncached + cache-write + cache-read tokens.
              inputTokens =
                u.input_tokens + (u.cache_creation_input_tokens ?? 0) + cachedTokens;
            } else if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta" &&
              event.delta.text
            ) {
              controller.enqueue(
                encoder.encode(
                  sse(chunk(id, created, requestedModel, { content: event.delta.text }, null))
                )
              );
            } else if (event.type === "message_delta") {
              outputTokens = event.usage.output_tokens;
            }
          }
          controller.enqueue(
            encoder.encode(sse(chunk(id, created, requestedModel, {}, "stop")))
          );
          if (includeUsage) {
            controller.enqueue(
              encoder.encode(
                sse({
                  id,
                  object: "chat.completion.chunk",
                  created,
                  model: requestedModel,
                  choices: [],
                  usage: {
                    prompt_tokens: inputTokens,
                    prompt_tokens_details: { cached_tokens: cachedTokens },
                    completion_tokens: outputTokens,
                    total_tokens: inputTokens + outputTokens,
                  },
                })
              )
            );
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          controller.error(err);
          return;
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Voice LLM turn failed" }, { status: 500 });
  }
}
