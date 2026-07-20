import { NextRequest, NextResponse } from "next/server";
import { eq, max } from "drizzle-orm";
import { buildJobDescriptionSystemPrompt } from "@/orchestrator/job-description-orchestrator";
import { getAnthropicClient, DEFAULT_MODEL } from "@/shared/anthropic-client";
import { requireUser, dbEnabled, assertProjectAccess } from "@/shared/current-user";
import { signVoiceGrant, type VoiceGrant } from "@/shared/voice-grant";
import { db, tables } from "@/db";

/**
 * Fire-and-forget cache pre-warm (see shared prompt-caching guidance):
 * max_tokens: 0 runs prefill only — it writes the Anthropic prompt cache at
 * the system-block breakpoint and returns without generating. By the time
 * the user has heard the greeting and finished their first answer, the
 * first LLM turn reads a warm cache instead of paying ~3-6s of cold
 * prompt processing against ElevenLabs' per-attempt timeout.
 */
function prewarmPromptCache() {
  getAnthropicClient()
    .messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 0,
      system: [
        {
          type: "text",
          text: buildJobDescriptionSystemPrompt(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: "warmup" }],
    })
    .catch((err) => console.warn("prompt-cache prewarm failed (non-fatal):", err?.message));
}

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Mints a short-lived ElevenLabs conversation token AND anchors the voice
 * session to a persisted DB conversation (voice-continuity fix, 2026-07-19):
 * - ensures a conversation row exists for the signed-in user (creating one
 *   and persisting the browser's chat-so-far if needed);
 * - returns a signed voice grant (see src/shared/voice-grant.ts) the client
 *   passes to ElevenLabs as custom_llm_extra_body, so every LLM callback can
 *   hydrate pre-session context from the DB — across serverless instances,
 *   dropped calls, and restarts. The old in-memory handoff is gone.
 */
export async function POST(req: NextRequest) {
  let messages: Msg[] = [];
  let requestedConversationId: string | null = null;
  let projectId: string | null = null;
  try {
    const body = await req.json();
    if (Array.isArray(body?.messages)) messages = body.messages;
    if (typeof body?.conversationId === "string") requestedConversationId = body.conversationId;
    if (typeof body?.projectId === "string") projectId = body.projectId;
  } catch {
    // no body — fresh session
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) {
    return NextResponse.json(
      {
        error:
          "Voice is not configured: set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in .env.local (see .env.local.example) and restart the dev server.",
      },
      { status: 503 }
    );
  }

  // Job description is a project-scoped agent (ADR-007) — voice sessions
  // need a project the same way text turns do.
  if (dbEnabled()) {
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required to start a voice session" }, { status: 400 });
    }
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await assertProjectAccess(projectId, user))) {
      return NextResponse.json({ error: "Project not found or not accessible" }, { status: 403 });
    }
  }

  // Anchor the session to a persisted conversation (skip silently if the DB
  // is not configured — voice still works, minus durability).
  let conversationId: string | null = null;
  let extraBody: VoiceGrant | null = null;
  if (dbEnabled()) {
    try {
      const user = await requireUser();
      if (user) {
        const d = db();

        if (requestedConversationId && projectId) {
          const [conv] = await d
            .select({
              id: tables.conversations.id,
              createdBy: tables.conversations.createdBy,
              projectId: tables.conversations.projectId,
            })
            .from(tables.conversations)
            .where(eq(tables.conversations.id, requestedConversationId))
            .limit(1);
          if (conv && conv.createdBy === user.id && conv.projectId === projectId) conversationId = conv.id;
        }

        if (!conversationId && projectId) {
          const title =
            messages.find((m) => m.role === "user")?.content.replace(/\s+/g, " ").slice(0, 80) ||
            "Voice intake session";
          const [row] = await d
            .insert(tables.conversations)
            .values({ projectId, agentSlug: "job-description", createdBy: user.id, title })
            .returning({ id: tables.conversations.id });
          conversationId = row.id;
          // A brand-new conversation may carry unpersisted context from the
          // browser (e.g. chat typed while the DB was briefly down) — keep it.
          if (messages.length > 0) {
            await d.insert(tables.messages).values(
              messages.map((m, i) => ({
                conversationId: conversationId!,
                seq: i,
                role: m.role,
                content: m.content,
              }))
            );
          }
        }

        if (conversationId) {
          const [agg] = await d
            .select({ maxSeq: max(tables.messages.seq) })
            .from(tables.messages)
            .where(eq(tables.messages.conversationId, conversationId));
          const baseSeq = agg.maxSeq === null ? 0 : agg.maxSeq + 1;
          extraBody = signVoiceGrant(conversationId, baseSeq);
        }
      }
    } catch (err) {
      console.error("[voice-token] conversation anchoring failed (voice continues):", err);
    }
  }

  prewarmPromptCache();

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": apiKey }, cache: "no-store" }
  );

  if (!res.ok) {
    console.error("ElevenLabs token request failed:", res.status, await res.text());
    return NextResponse.json(
      { error: "Could not start a voice session (ElevenLabs token request failed)." },
      { status: 502 }
    );
  }

  const data = await res.json();
  return NextResponse.json({ token: data.token, conversationId, extraBody });
}
