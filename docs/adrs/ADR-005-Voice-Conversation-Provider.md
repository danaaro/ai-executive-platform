# ADR-005 — Voice Conversation Provider

Date: 2026-07-11 | Status: **accepted**

## Title
ElevenLabs Agents (Conversational AI) as the real-time voice leg for the Job Description agent, with Claude kept as the LLM via a custom-LLM endpoint.

## Context
The JD agent's existing voice support (ADR-003) is a bolt-on: browser `SpeechRecognition` transcribes an utterance, the text is POSTed to `/api/job-description` as one blocking turn, the full reply comes back, then `speechSynthesis` reads it aloud. Dana wants a natural, ChatGPT-Advanced-Voice-style conversation — talk and be talked to in real time, with the agent able to be interrupted — which this pipeline cannot produce. That experience requires streaming STT, voice-activity-based turn detection, barge-in, and low-latency streaming TTS, coordinated over a persistent real-time connection (WebRTC). None of that fits a stateless Next.js API route on Vercel.

Constraints considered:
- **Claude must stay the brain.** Text chat and voice must run the identical agent — same system prompt assembled by `src/orchestrator/job-description-orchestrator.ts` from `products/interview-intelligence/`. Two different LLMs behind two different UIs for the same agent would break ADR-001's single-source-of-truth model and silently diverge intake quality between channels.
- **No persistent-connection infrastructure exists.** Building the real-time leg in-house (LiveKit/Pipecat-style) means running a long-lived worker process — a new deployment target this repo doesn't have yet (ADR-003 assumes serverless Next.js/Vercel only).
- **Speed to a working experience.** Per ADR-003's original goal ("experience the agent as a real SaaS app fast"), a managed platform that owns STT/VAD/interruption/TTS end-to-end gets to a genuine live conversation in days, not a multi-week pipeline build.
- **Scope discipline (ADR-001 "no speculative infrastructure").** Only the Job Description agent exists; this decision is scoped to it, not to a general "voice runtime" for a catalog of agents that don't exist yet.

Options considered:
1. **ElevenLabs Agents, custom LLM endpoint** — ElevenLabs runs STT/VAD/interruption/TTS over WebRTC; our own Next.js route serves as the "LLM" via an OpenAI-compatible custom-LLM contract, internally calling Claude with the orchestrator's system prompt. Chosen.
2. **ElevenLabs Agents, Claude configured natively in their dashboard** — faster to set up, but the system prompt would have to be copy-pasted into ElevenLabs' config instead of assembled by the orchestrator, creating a second, manually-synced copy of the agent's brain. Rejected — directly breaks the single-source-of-truth requirement above.
3. **OpenAI Realtime (native speech-to-speech)** — genuinely simplest architecture (one model does STT+reasoning+TTS), but replaces Claude entirely for voice. Rejected — splits the agent's brain across providers depending on channel, which is worse than the drift risk it would remove.
4. **Vapi / Retell** — equivalent managed real-time platforms, more phone/telephony-oriented. Not chosen; no phone requirement exists today, ElevenLabs' text-to-speech is already the most natural-sounding option Dana evaluated informally, and adding a second voice vendor to compare offered no clear win. Revisit if telephony intake becomes a requirement.
5. **LiveKit Agents / Pipecat (self-hosted pipeline)** — full control, best unit economics at scale, but requires standing up and operating a persistent worker. Rejected for now as premature infrastructure ahead of any proven need; reconsider only if per-minute ElevenLabs costs or platform limits become a real constraint.

## Decision
- **Provider:** ElevenLabs Agents (Conversational AI) handles the entire real-time voice leg: WebRTC transport, streaming STT, voice-activity-based turn-taking, interruption/barge-in, and streaming TTS.
- **LLM routing:** custom-LLM endpoint. ElevenLabs is configured (in their dashboard) to call our own OpenAI-compatible endpoint — `POST /api/job-description/voice-llm` — instead of using a natively-integrated model. That endpoint is a thin adapter: it discards whatever system message ElevenLabs sends, injects `buildJobDescriptionSystemPrompt()` from the existing orchestrator, converts the remaining turns into Anthropic's message format, streams a Claude (`claude-sonnet-5`) completion, and reformats the stream as OpenAI-compatible SSE chunks. Text chat and voice therefore run the exact same prompt-assembly code path; only the transport differs.
- **Client integration:** `@elevenlabs/react`'s `useConversation` hook, added as a second mode on the existing JD chat page (`src/app/page.tsx`) — not a separate route, not a replacement for text chat.
- **Auth model, two different mechanisms for two different callers:**
  - Browser → our backend (`/api/job-description/voice-token`): stays behind the existing Clerk middleware, exactly like `/api/job-description` today. Mints a short-lived ElevenLabs conversation token server-side (using a server-only `ELEVENLABS_API_KEY`) so the ElevenLabs Agent itself stays private/non-public.
  - ElevenLabs → our backend (`/api/job-description/voice-llm`): this call has no Clerk session (it's server-to-server from ElevenLabs' infrastructure), so it is added to the middleware's public-route exemption and instead authenticated by a shared secret (`ELEVENLABS_CUSTOM_LLM_SECRET`) sent as a Bearer token, configured on both sides. This is the same "secret API key" mechanism ElevenLabs' custom-LLM feature is documented to use — the secret is not a real OpenAI key, just a shared token.
- **Scope:** implementation lives entirely under `src/app/api/job-description/` and the existing orchestrator — no generic `src/voice` runtime is built. When a second agent needs voice, the reusable shape (custom-LLM adapter pattern, token-minting pattern) gets extracted then, from what by then will be two real examples instead of a guess.
- **The ElevenLabs Agent object itself (voice, name, turn-taking settings) is configured once, manually, in the ElevenLabs dashboard** — not provisioned by code. This repo does not hold ElevenLabs infrastructure-as-code; only the two API routes and the client integration.

## Consequences
- Two new API routes (`voice-llm`, `voice-token`) and a new external dependency (`@elevenlabs/react`) land in `src/app/api/job-description/` and `package.json`.
- `src/middleware.ts` grows a second, differently-authenticated public exemption — the first case in the repo of an API route that isn't Clerk-gated. Future server-to-server integrations should follow the same shared-secret pattern rather than inventing new ones.
- Adds ElevenLabs as a paid, usage-billed dependency (per-minute, billed on conversation duration) sitting directly on the product's core UX path — a real vendor-lock and cost-scaling consideration once usage grows past prototype volume.
- The system prompt is now served from two entry points (`/api/job-description` and `/api/job-description/voice-llm`) that must stay behaviorally identical; both call the same `buildJobDescriptionSystemPrompt()`, so drift can only happen if one call site is edited without the other — worth a comment marker in both files.
- Voice quality (turn-taking feel, interruption handling, latency) now depends on ElevenLabs' platform tuning, not code in this repo — debugging a bad conversation may mean adjusting ElevenLabs dashboard settings (voice, turn-detection sensitivity) rather than shipping a code change.
- The ElevenLabs Agent's dashboard configuration (voice choice, turn-detection settings, first message) is *not* version-controlled — a gap consistent with "no IaC" above but worth naming: recreating the agent from scratch requires re-entering that config by hand.
