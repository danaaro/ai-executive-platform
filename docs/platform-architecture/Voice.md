# Voice

> STATUS: 🟢 READY — describes the real-time voice architecture as decided in ADR-005 and implemented for the Job Description agent.

**Purpose:** how a natural, real-time voice conversation (talk and be talked to, with interruption) is layered onto an agent whose brain is Claude, without duplicating the agent's prompt logic per channel.

## Why this exists

The platform's baseline interaction is text chat: browser → `POST /api/<agent>` → orchestrator assembles a system prompt from `products/<product>/` → one blocking Claude call → full reply back. That model cannot produce a live conversation — no streaming input, no turn-taking, no way to interrupt the agent mid-sentence. Voice needs a persistent, real-time connection, which a stateless serverless API route does not provide.

## Architecture

Two participants, two different jobs:

- **ElevenLabs Agents (Conversational AI)** owns the entire real-time leg: WebRTC transport, streaming speech-to-text, voice-activity-based turn detection, interruption/barge-in, and streaming text-to-speech. This repo does not implement any of that — it is bought, not built (ADR-005).
- **Our orchestrator stays the brain.** ElevenLabs is configured with a *custom LLM*: instead of using a natively-integrated model, it calls back into our own API for every conversational turn. That callback is a thin adapter over the exact same prompt-assembly code the text-chat route already uses (`buildJobDescriptionSystemPrompt()` in `src/orchestrator/job-description-orchestrator.ts`). Text and voice are therefore the same agent wearing two transports, not two agents.

```
Browser (mic/speaker)
   │  WebRTC (ElevenLabs client SDK: @elevenlabs/react)
   ▼
ElevenLabs Agents platform  ── STT, turn-taking, interruption, TTS
   │  custom-LLM callback, OpenAI-compatible /v1/chat/completions, SSE stream
   ▼
POST /api/job-description/voice-llm   (this repo)
   │  strips ElevenLabs' system message, injects buildJobDescriptionSystemPrompt(),
   │  converts turns to Anthropic format, streams claude-sonnet-5
   ▼
Anthropic API
```

A second, separate route handles getting the browser into that WebRTC session at all:

```
Browser (signed-in via Clerk)
   │  GET/POST /api/job-description/voice-token   (Clerk-protected, like every other /api route)
   ▼
this repo, server-side  ── calls ElevenLabs REST API with a server-only ELEVENLABS_API_KEY
   │  GET https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=...
   ▼
short-lived conversation token returned to the browser
   │
   ▼
useConversation().startSession({ conversationToken })  ── opens the WebRTC session above
```

## Two different auth mechanisms, on purpose

| Caller | Route | Mechanism |
|---|---|---|
| Browser (signed-in user) | `/api/job-description/voice-token` | Clerk session, same as every other `/api/*` route (`src/middleware.ts`) |
| ElevenLabs platform (server-to-server) | `/api/job-description/voice-llm` | No Clerk session exists for this caller — exempted in `src/middleware.ts`'s public-route matcher, authenticated instead by a shared secret (`ELEVENLABS_CUSTOM_LLM_SECRET`) sent as an `Authorization: Bearer` header, validated inside the route handler |

The ElevenLabs Agent itself is kept **private** (not publicly embeddable) precisely so that the only way to reach it is through our Clerk-gated token-minting route — an anonymous visitor cannot start a voice session without first authenticating to our app.

## What is code vs. what is manual configuration

- **Code (this repo):** the two API routes above, the client-side `useConversation` integration in `src/app/page.tsx`, and reuse of the existing orchestrator's prompt assembly.
- **Manual, one-time setup (ElevenLabs dashboard, not version-controlled):** creating the Agent object, choosing its voice, pointing its "Custom LLM" configuration at our `voice-llm` route URL + shared secret, and any turn-detection/sensitivity tuning. This repo holds no infrastructure-as-code for ElevenLabs; recreating the agent means re-entering that config by hand. See ADR-005 Consequences for why this tradeoff was accepted.

## Cost model (informational, not enforced in code)

ElevenLabs Agents bills per minute of conversation duration (not compute), with silence beyond ~10s heavily discounted, plus the underlying Claude token cost billed separately by Anthropic. There is no budget cap or usage guard implemented in this repo — a real gap once this moves past prototype usage (see Platform-Maturity.md Technical Debt).

## Scope boundary

This design is scoped to the Job Description agent only, per ADR-005 and ADR-001's no-speculative-infrastructure rule. There is no generic `src/voice` runtime. When a second agent needs voice, extract the reusable shape (custom-LLM adapter, token-minting route) from two real implementations instead of guessing the abstraction now.
