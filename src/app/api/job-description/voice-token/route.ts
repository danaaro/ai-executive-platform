import { validateChatMessages } from "@/shared/chat-limits";
import { errorSummary } from "@/shared/safe-log";
import { NextRequest, NextResponse } from "next/server";
import { eq, max } from "drizzle-orm";
import { buildJobDescriptionSystemPrompt, voiceOpeningLine } from "@/orchestrator/job-description-orchestrator";
import { getAnthropicClient, DEFAULT_MODEL, INTERVIEW_CACHE } from "@/shared/anthropic-client";
import {
  requireUser,
  dbEnabled,
  getProjectAccess,
  canWrite,
  projectCompanyId,
} from "@/shared/current-user";
import { signVoiceGrant, type VoiceGrant } from "@/shared/voice-grant";
import { adminDb, db, withTenant, tables } from "@/db";

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
          // Same TTL as the real turns, so they read the entry this writes.
          cache_control: INTERVIEW_CACHE,
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
    if (body?.messages !== undefined) {
      const checked = validateChatMessages(body.messages, { allowEmpty: true });
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
      messages = checked.messages;
    }
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
    const role = await getProjectAccess(projectId, user);
    if (!role) {
      return NextResponse.json({ error: "Project not found or not accessible" }, { status: 403 });
    }
    if (!canWrite(role)) {
      return NextResponse.json(
        { error: "You have view-only access to this position" },
        { status: 403 }
      );
    }
  }

  // Started now, awaited at the end — runs alongside the database work.
  const tokenFetch = fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": apiKey }, cache: "no-store" }
  );
  const opener = projectId && dbEnabled() ? openingLine(projectId, messages.length > 0).catch(() => null) : Promise.resolve(null);

  // Anchor the session to a persisted conversation (skip silently if the DB
  // is not configured — voice still works, minus durability).
  let conversationId: string | null = null;
  let extraBody: VoiceGrant | null = null;
  if (dbEnabled()) {
    try {
      const user = await requireUser();
      // Scoped to the user's company; closed before the ElevenLabs call below.
      if (user) await withTenant(user.companyId, async () => {
        const d = db();

        if (requestedConversationId && projectId) {
          const [conv] = await d
            .select({
              id: tables.conversations.id,
              projectId: tables.conversations.projectId,
            })
            .from(tables.conversations)
            .where(eq(tables.conversations.id, requestedConversationId))
            .limit(1);
          // Write access to the project was verified above; the remaining
          // check is coherence, not ownership — a shared stage thread can be
          // continued by voice by anyone working the position (ADR-008 §5).
          if (conv && conv.projectId === projectId) conversationId = conv.id;
        }

        const companyId = projectId ? await projectCompanyId(projectId) : null;
        if (!conversationId && projectId && companyId) {
          const title =
            messages.find((m) => m.role === "user")?.content.replace(/\s+/g, " ").slice(0, 80) ||
            "Voice intake session";
          const [row] = await d
            .insert(tables.conversations)
            .values({ companyId, projectId, agentSlug: "job-description", createdBy: user.id, title })
            .returning({ id: tables.conversations.id });
          conversationId = row.id;
          // A brand-new conversation may carry unpersisted context from the
          // browser (e.g. chat typed while the DB was briefly down) — keep it.
          if (messages.length > 0) {
            await d.insert(tables.messages).values(
              messages.map((m, i) => ({
                companyId,
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
      });
    } catch (err) {
      console.error("[voice-token] conversation anchoring failed (voice continues):", errorSummary(err));
    }
  }

  prewarmPromptCache();

  const res = await tokenFetch;

  if (!res.ok) {
    console.error("ElevenLabs token request failed:", res.status, await res.text());
    return NextResponse.json(
      { error: "Could not start a voice session (ElevenLabs token request failed)." },
      { status: 502 }
    );
  }

  const data = await res.json();
  const firstMessage = await opener;
  return NextResponse.json({ token: data.token, conversationId, extraBody, firstMessage });
}

/**
 * The agent's spoken opening line (wording in the prompt file), filled with
 * the locked role facts so the voice agent never opens by asking what the
 * role is. Only this one sentence reaches the browser — no prompt text.
 */
async function openingLine(projectId: string, continuing: boolean): Promise<string | null> {
  const [row] = await adminDb()
    .select({ title: tables.projects.title, company: tables.companies.name })
    .from(tables.projects)
    .innerJoin(tables.companies, eq(tables.companies.id, tables.projects.companyId))
    .where(eq(tables.projects.id, projectId))
    .limit(1);
  if (!row) return null;
  return voiceOpeningLine(continuing ? "continuing" : "new", row.title, row.company) || null;
}
