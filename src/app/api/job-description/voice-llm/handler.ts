import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { asc, and, eq, lt, max } from "drizzle-orm";
import { buildJobDescriptionSystemPrompt } from "@/orchestrator/job-description-orchestrator";
import { getAnthropicClient, DEFAULT_MODEL } from "@/shared/anthropic-client";
import { extractVoiceGrant } from "@/shared/voice-grant";
import { INTAKE_START } from "@/shared/intake-openers";
import {
  createIntakeBlockFilter,
  recordIntakeAnswers,
  splitIntakeBlock,
} from "@/shared/intake-answers";
import { dbEnabled } from "@/shared/current-user";
import { db, tables } from "@/db";

/**
 * Appended only on the voice channel: the same agent brain, but replies are
 * spoken aloud by TTS, so they must sound like speech, not read like a doc.
 *
 * This note used to carry the ONE-QUESTION rule as a named override, because
 * the operative prompt's Phase 1 mandated bundling 2–4 questions per turn and a
 * milder clause here lost to it every time (Dana 2026-08-13). Phase 1 now
 * mandates one question per turn on every channel (2026-09-05), so the override
 * is gone — an override that names an instruction which no longer exists is
 * worse than none, since the model is left reconciling a rule it cannot find.
 * What remains is a short reinforcement: voice is where a second question does
 * the most damage, because a listener cannot re-read the turn and will only
 * answer the last thing they heard.
 */
const VOICE_CHANNEL_NOTE =
  "\n\n---\n\n# Channel note: LIVE VOICE\n\n" +
  "This is a LIVE VOICE conversation — the user is speaking to you and your reply is " +
  "spoken aloud via text-to-speech. Live voice IS fully supported; never say it is " +
  "unavailable or planned for later.\n\n" +
  "## One question per turn matters most here\n\n" +
  "Your instructions already require exactly one question per turn. On voice this is " +
  "unforgiving, so verify it before every reply:\n" +
  "- Your entire spoken turn must contain EXACTLY ONE question mark character. Zero is " +
  "allowed when you are only acknowledging something. Two or more is always wrong — " +
  "rewrite the turn until one remains.\n" +
  "- A listener cannot re-read what you said and will only answer the last thing they " +
  "heard, so a second question does not get a second answer — it costs you the first one.\n\n" +
  "## Speaking style\n\n" +
  "Short conversational sentences. No markdown, no bullet lists, no headings, no numbering — " +
  "every character you emit is read aloud. Keep each turn to a few sentences at most: brief " +
  "acknowledgement of what they just said, then the single next question.\n\n" +
  "When you reach the final job description and intake record, offer to continue in text chat " +
  "so the user can read and copy them, rather than reading long documents aloud.";

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
 *
 * `prefix` is the pre-session context hydrated from the DB (voice-continuity
 * fix 2026-07-19): everything persisted before this voice session started —
 * earlier text chat and earlier (possibly dropped) voice sessions. In-session
 * turns arrive in `messages` from ElevenLabs, so the two never overlap.
 */
export function toAnthropicMessages(
  messages: OpenAIMessage[],
  prefix: { role: "user" | "assistant"; content: string }[]
): { role: "user" | "assistant"; content: string }[] {
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  const push = (role: "user" | "assistant", text: string) => {
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) {
      prev.content += "\n" + text;
    } else {
      turns.push({ role, content: text });
    }
  };
  for (const m of prefix) {
    if (m.content.trim()) push(m.role, m.content);
  }
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = contentToText(m.content).trim();
    if (!text) continue;
    push(m.role, text);
  }
  if (turns.length === 0 || turns[0].role !== "user") {
    turns.unshift({ role: "user", content: INTAKE_START });
  }
  return turns;
}

/**
 * Loads pre-session context for a verified voice grant: messages persisted
 * before the session's baseSeq. Failure here must never fail the voice turn.
 */
export async function loadVoicePrefix(
  body: Record<string, unknown>
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  if (!dbEnabled()) return [];
  const grant = extractVoiceGrant(body);
  if (!grant) return [];
  try {
    const rows = await db()
      .select({ role: tables.messages.role, content: tables.messages.content })
      .from(tables.messages)
      .where(
        and(
          eq(tables.messages.conversationId, grant.conversationId),
          lt(tables.messages.seq, grant.baseSeq)
        )
      )
      .orderBy(asc(tables.messages.seq));
    if (rows.length > 0) {
      console.log(
        `[voice-llm] hydrated ${rows.length} pre-session turns for conversation ${grant.conversationId}`
      );
    }
    return rows;
  } catch (err) {
    console.error("[voice-llm] prefix hydration failed (turn continues):", err);
    return [];
  }
}

/**
 * Server-side persistence of voice turns (2026-09-05).
 *
 * Before this, the ONLY writer of spoken turns was the browser
 * (`persistVoiceTurn` in use-intake-session.ts). That made durability
 * conditional on the tab staying alive: a crashed browser, a slept laptop or
 * a closed window mid-call lost everything said since the last successful
 * POST — minutes of talking, which is exactly what the 2026-07-19 continuity
 * work was supposed to end. ElevenLabs calls this route server-to-server for
 * every turn, so the transcript can be captured here instead, independent of
 * the client entirely. The client write is now gone; this is the sole writer.
 *
 * Seq allocation is append-only rather than index-based:
 *   persistedInSession = (max(seq) + 1) - baseSeq
 * and only `history.slice(persistedInSession)` is written, at
 * `baseSeq + persistedInSession + j`. That makes an ElevenLabs retry of the
 * same turn slice to empty (a no-op), and if ElevenLabs ever trims its own
 * history for context it appends the tail rather than overwriting earlier
 * seqs. `onConflictDoNothing()` on the unique (conversation_id, seq) index is
 * the backstop for concurrent callbacks.
 */
type Turn = { role: "user" | "assistant"; content: string };

/**
 * The RAW in-session history, filtered to real turns only.
 *
 * Deliberately NOT `toAnthropicMessages()`: that merges consecutive same-role
 * turns and unshifts an intake-start sentinel, so its indices would drift from
 * what ElevenLabs sends on the next callback and seq allocation would skew.
 */
export function historyTurns(messages: OpenAIMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = contentToText(m.content).trim();
    if (!text) continue;
    turns.push({ role: m.role, content: text });
  }
  return turns;
}

/**
 * Appends turns that are not yet stored. Returns the seq the next turn would
 * take, so the caller can persist the assistant reply after the stream ends.
 * Never throws — a persistence failure must not fail a live voice turn.
 */
export async function persistVoiceTurns(
  grant: { conversationId: string; baseSeq: number },
  turns: Turn[]
): Promise<number | null> {
  if (!dbEnabled()) return null;
  try {
    const d = db();
    const [agg] = await d
      .select({ maxSeq: max(tables.messages.seq) })
      .from(tables.messages)
      .where(eq(tables.messages.conversationId, grant.conversationId));
    const nextSeq = agg.maxSeq === null ? 0 : agg.maxSeq + 1;
    const persistedInSession = Math.max(0, nextSeq - grant.baseSeq);

    const pending = turns.slice(persistedInSession);
    if (pending.length === 0) return nextSeq;

    await d
      .insert(tables.messages)
      .values(
        pending.map((t, j) => ({
          conversationId: grant.conversationId,
          seq: grant.baseSeq + persistedInSession + j,
          role: t.role,
          content: t.content.slice(0, 20_000),
        }))
      )
      .onConflictDoNothing();
    await d
      .update(tables.conversations)
      .set({ updatedAt: new Date() })
      .where(eq(tables.conversations.id, grant.conversationId));

    console.log(
      `[voice-llm] persisted ${pending.length} turn(s) for conversation ${grant.conversationId} from seq ${grant.baseSeq + persistedInSession}`
    );
    return grant.baseSeq + persistedInSession + pending.length;
  } catch (err) {
    console.error("[voice-llm] turn persistence failed (turn continues):", err);
    return null;
  }
}

/** Appends one spoken assistant reply at a known seq. Never throws. */
export async function persistAssistantTurn(
  conversationId: string,
  seq: number,
  content: string
): Promise<void> {
  if (!dbEnabled() || !content.trim()) return;
  try {
    const d = db();
    await d
      .insert(tables.messages)
      .values({ conversationId, seq, role: "assistant", content: content.slice(0, 20_000) })
      .onConflictDoNothing();
    await d
      .update(tables.conversations)
      .set({ updatedAt: new Date() })
      .where(eq(tables.conversations.id, conversationId));
  } catch (err) {
    console.error("[voice-llm] assistant persistence failed (turn continues):", err);
  }
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
  const prefix = await loadVoicePrefix(body);
  const anthropicMessages = toAnthropicMessages(body.messages ?? [], prefix);

  // Capture the transcript server-side before generating, so what the user
  // already said is durable even if this turn fails outright. A grant that
  // fails verification persists nothing — the signature is what proves the
  // caller may write to this conversation.
  const grant = extractVoiceGrant(body);
  const assistantSeq = grant
    ? await persistVoiceTurns(grant, historyTurns(body.messages ?? []))
    : null;
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
        thinking: { type: "disabled" },
        system: buildVoiceSystemBlocks(),
        messages: anthropicMessages,
      });
      const text = response.content.find((b) => b.type === "text");
      const raw = text && text.type === "text" ? text.text : "";
      // Strip the bookkeeping block before ElevenLabs sees it — on this
      // channel every character that reaches the caller is READ ALOUD.
      const { visibleText: reply, answers } = splitIntakeBlock(raw);
      if (grant && assistantSeq !== null) {
        await persistAssistantTurn(grant.conversationId, assistantSeq, reply);
        await recordIntakeAnswers(grant.conversationId, answers, "voice");
      }
      return NextResponse.json({
        id,
        object: "chat.completion",
        created,
        model: requestedModel,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: reply },
            finish_reason: "stop",
          },
        ],
      });
    }

    const encoder = new TextEncoder();
    // The Anthropic call happens INSIDE the stream so the first SSE bytes
    // (the role chunk) flush to ElevenLabs immediately — their per-attempt
    // first-byte timeout otherwise races Claude's prompt-processing time.
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (data: unknown) => controller.enqueue(encoder.encode(sse(data)));
        emit(chunk(id, created, requestedModel, { role: "assistant", content: "" }, null));

        let inputTokens = 0;
        let outputTokens = 0;
        let cachedTokens = 0;
        // What the user actually HEARS — persisted verbatim below, recovery
        // line included, so the stored transcript matches the conversation
        // and the agent doesn't repeat a question it already asked aloud.
        let spoken = "";
        // Withheld from the audio stream as it arrives: the [INTAKE ANSWERS]
        // block is bookkeeping, and anything emitted here is spoken aloud.
        // `spoken` keeps the raw text so the block can still be read off it.
        const filter = createIntakeBlockFilter();
        try {
          const anthropicStream = await getAnthropicClient().messages.create({
            model: DEFAULT_MODEL,
            max_tokens: maxTokens,
            // Voice is latency-critical: claude-sonnet-5 runs adaptive thinking
            // by default, and its (discarded) deliberation delays the first
            // audible sentence past ElevenLabs' per-attempt cutoff. Disabled
            // here; the text channel keeps the default for quality.
            thinking: { type: "disabled" },
            system: buildVoiceSystemBlocks(),
            messages: anthropicMessages,
            stream: true,
          });
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
              spoken += event.delta.text;
              const audible = filter.push(event.delta.text);
              if (audible) emit(chunk(id, created, requestedModel, { content: audible }, null));
            } else if (event.type === "message_delta") {
              outputTokens = event.usage.output_tokens;
            }
          }
        } catch (err) {
          // Headers are already sent — fail the TURN gracefully, not the
          // session: speak a short recovery line instead of surfacing an
          // "LLM Cascade Error" that kills the whole conversation.
          console.error("voice-llm upstream error:", err);
          const recovery = "Sorry, I hit a brief hiccup on my side — could you say that again?";
          spoken += recovery;
          emit(chunk(id, created, requestedModel, { content: recovery }, null));
        }

        // Release whatever the filter was holding back against a partial
        // marker that never completed.
        const tail = filter.flush();
        if (tail) emit(chunk(id, created, requestedModel, { content: tail }, null));

        // The reply is spoken; store it. Done here rather than on the next
        // callback because a user who hangs up straight after hearing it
        // would otherwise leave the last turn unrecorded. What is stored is
        // what was SPOKEN — the bookkeeping block goes to intake_answers.
        if (grant && assistantSeq !== null) {
          const { visibleText, answers } = splitIntakeBlock(spoken);
          await persistAssistantTurn(grant.conversationId, assistantSeq, visibleText);
          await recordIntakeAnswers(grant.conversationId, answers, "voice");
        }

        emit(chunk(id, created, requestedModel, {}, "stop"));
        if (includeUsage) {
          emit({
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
          });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
