# AI Executive Platform - Maturity Dashboard

> STATUS: 🟢 LIVE — authoritative implementation status. Regenerate at the end of every sprint by re-inspecting the repository. Everything below is inferred from actual code, docs, and config as of the stated date — no aspirational content.

## Executive Summary

- **Repository Version:** `0.1.0` (package.json) · git `main` @ `7143958`, 12 commits, remote `github.com/danaaro/ai-executive-platform` (private). Uncommitted: voice `thinking: disabled` fix in `voice-llm/handler.ts` (described below, verified live), this dashboard's 07-16/07-17 updates, new `pitch-deck-feature-map.md`
- **Last Updated:** 2026-07-18 — **agent-prompt import sprint**: Susan's 10 production prompts normalized into `products/interview-intelligence/prompts/` (+ definitions + 20 I/O schemas); platform guardrails layer (`prompts/system/guardrails.md` — scope lockdown, hard refusal, non-disclosure) prepended to every agent; JD upgraded to v2 (20-section Job Discovery Questionnaire, coverage record, conversational bundling); **generic agent runtime** (`agent-orchestrator.ts`, `/api/agents/[slug]`, UI agent picker) — pays down debt #3; **save-artifact flow** (`/api/agents/[slug]/save` → `generated/outputs/` with DB-ready JSON envelope); debt #1 (file-writing agent definition) resolved
- **Current Sprint:** F — SaaS-first build: Job Description agent vertical slice (parent `TODO.md` §F, CLAUDE.md "Current focus")
- **Current Goal:** experience the Job Description agent as a real, browser-accessible, login-protected SaaS app end-to-end — now including a natural real-time voice conversation (ADR-005)
- **Overall Completion:** ~25% — one authenticated, working E2E vertical (JD agent) with real-time voice architecture built and verified server-side; no persistence, no deployment, no tests/evals, business docs still placeholders

---

# Business Capabilities

Capabilities are the product catalog of `products/interview-intelligence/` (internal name only — ADR-002).

| Capability | Status | Backend | UI | Conversation | API | Tests | Notes |
|---|---|---|---|---|---|---|---|
| Job Description | 🟢 Working prototype (v2 2026-07-18) | ✅ Orchestrator: guardrails + Susan's prompt + questionnaire | ✅ Chat UI w/ live voice mode + Save artifact | ✅ Conversational bundling over 20-section questionnaire; text + voice | ✅ `POST /api/job-description` + `voice-llm` + `voice-token` + save | ❌ No evals | Susan's production prompt imported; coverage record (per-question status) in intake schema v2; PRD no longer in runtime prompt |
| Competency Builder (2) | 🟡 Runnable, untested | ✅ Generic orchestrator | ✅ Via agent picker | ✅ Paste-JD → framework | ✅ `POST /api/agents/competency-builder` (+ save) | ❌ | Prompt+def+schemas imported 2026-07-18; awaiting Dana's conversation tests |
| Panel Designer (3) | 🟡 Runnable, untested | ✅ Generic orchestrator | ✅ Via agent picker | ✅ | ✅ `/api/agents/panel-designer` | ❌ | Same import batch |
| Interview System Builder (4) | 🟡 Runnable, untested | ✅ Generic orchestrator (4096 tokens) | ✅ Via agent picker | ✅ | ✅ `/api/agents/interview-system-builder` | ❌ | Same import batch |
| Feedback Form Builder (5) · Hiring Rationale (6) · Success Blueprint (7) · Interview Coach (8) | 🟡 Runnable, untested — Phase 2 (personal data) | ✅ Generic orchestrator | ✅ Via agent picker | ✅ | ✅ `/api/agents/<slug>` | ❌ | Prompts enforce human-decision boundaries (no scores/recommendations for candidates; coach scores interviewers) |
| Recruiter Evaluation Report (A1) | 🟡 Runnable, untested — Phase 2 | ✅ | ✅ | ✅ | ✅ | ❌ | Independent assistant |
| Recruiter Screening Guide (A2) | 🟠 Draft prompt (v0.9) | ✅ | ✅ | ✅ | ✅ | ❌ | Source was a prompt *description* — needs Susan's actual prompt (flagged in frontmatter + picker) |
| AI Head of Talent Acquisition (executive layer) | ⚪ Named only | ❌ | ❌ | ❌ | ❌ | ❌ | Planned |
| Susan Brain | ⚫ Not defined | ❌ | ❌ | ❌ | ❌ | ❌ | Belongs (if anywhere) to the parent workspace track |

---

# Platform Components

| Component | Status | Notes |
|---|---|---|
| Authentication | 🟢 Working | Clerk (ADR-004, accepted). `ClerkProvider` in layout, `/sign-in` + `/sign-up` pages, `UserButton`, real dev keys in `.env.local`. Middleware protects everything: pages redirect to `/sign-in`, APIs return deterministic 401 JSON |
| Authorization | 🟡 Basic RBAC (2026-07-19) | Two roles via Clerk publicMetadata: `admin` (Dana, Susan — see everyone's data) / `member` (own data only), enforced in every read API. No per-resource permissions yet |
| Organizations (Tenants) | 🔴 Not started | Clerk Organizations unused; no tenant concept in code, no per-tenant data (there is no data layer at all) |
| Dashboard | 🔴 Not started | Single-purpose chat page is the whole app |
| Conversation UI | 🟢 Working | `src/app/page.tsx`: agent picker (all 10 agents), session start, bubbles, error surface, auto-scroll, Save artifact. **Four input modes (2026-07-18):** 📎 document upload (PDF/DOCX/MD/TXT via `/api/upload-parse`, mammoth + pdf-parse) · typed chat · 🎤 dictation (Web Speech API → text in the box) · 🎙 live voice (JD only). Non-streaming text turns |
| Voice Interface | 🟢 Working (via ngrok tunnel) | Real-time conversation via ElevenLabs Agents over WebRTC (ADR-005): streaming STT, turn-taking, barge-in, streaming TTS; Claude stays the brain via OpenAI-compatible custom-LLM callback (`/api/job-description/voice-llm`, shared-secret auth) reusing the orchestrator's system prompt + a voice-channel note (speak naturally, no markdown). **First live spoken intake completed 2026-07-16.** Adapter is OpenAI-spec compliant incl. the `stream_options.include_usage` usage chunk (its absence caused "LLM Cascade Error" turn failures). Depends on a rotating ngrok URL until deployed |
| Persistence (DB) | 🟢 LIVE (2026-07-19, ADR-006) | Supabase Postgres (eu-central-1) + Drizzle. Tables: users (Clerk mirror + admin/member role), conversations, messages, artifacts (versioned slots, draft/approved pre-wired). Role-scoped agents persist sessions; candidate-scoped stay ephemeral (no personal data in DB). Verified: live CRUD + cascade cycle |
| History | 🟢 Working | Conversations persist for agents 1–4 + A2; resume-a-session list in chat; admins see all users' sessions |
| Downloads | 🔴 Not started | Final JD + intake JSON are emitted as chat text (runtime note explicitly forbids the agent claiming file writes). No export/download path |
| Settings | 🔴 Not started | Nothing user-configurable beyond the voice toggle |
| Knowledge Base | 🔴 Not started | `src/knowledge/` is README + `.gitkeep`; architecture doc is a placeholder |
| Prompt Management | 🟡 Partial | Prompt is assembled at request time from product markdown (agent def + question bank + PRD) per ADR-001 declarative-products model — works, but `prompts/` trees are empty, no versioning, no compile step, module-level cache |
| Observability | 🔴 Not started | `console.error` in the API route is the entire story; `docs/platform-architecture/Observability.md` is a placeholder |
| Evaluation | 🔴 Not started | `src/evaluation/` and `products/interview-intelligence/evals/` are empty scaffolds; eval dimensions are defined in the JD PRD §8 but nothing runs them |
| Logging | 🔴 Not started | No structured logging, no log schema |
| Monitoring | 🔴 Not started | Nothing deployed, nothing monitored |
| Deployment | 🟢 LIVE (2026-07-19) | **https://susies-brain.vercel.app** — project `susies-brain`, Dana's own Vercel account (`danaaronovich-5847` / team `danasusie`), **Git-linked to `danaaro/SusiesBrain` → pushes to `main` auto-deploy**. Ten prod env vars set via CLI (`--token`, Aviv session untouched). History: first deploy (2026-07-18) went to the WRONG account (`crispyisland` = AVIV) — deleted same day; RULE: verify `vercel whoami` before any deploy (memory `aviv-susandana-separation`). Clerk dev-instance keys; save-artifact 501 on Vercel (ephemeral fs); voice callback still points at ngrok, not the deploy |

---

# AI Capabilities

## Job Description Agent (the only implemented AI capability)

- **Purpose:** interview a hiring manager about a new role ("NEW JOB" intake session), gap-analyze the open brief against a canonical question bank (themes A–I + Company Info / Function Description blocks), ask only what's missing one question at a time, then synthesize an evidence-based public job description plus a fully tagged structured intake record for downstream agents.
- **Current maturity:** working prototype, unevaluated. E2E flow proven locally behind login; one golden example produced (`examples/chief-information-officer-JD.md` + `-intake.json`); zero evals or tests; output quality is anecdotal.
- **Input:** chat turns (`{role, content}[]`) via `POST /api/job-description`; the hiring manager's free-form brief plus pasted Company Info / Function Description. Intake contract: `products/interview-intelligence/schemas/job-description.intake.schema.json`.
- **Output:** conversational replies; on approval, the final JD as Markdown plus the intake record as a JSON code block — both inline in chat (runtime cannot write files). Output contract: `job-description.output.schema.json`.
- **Prompt version:** unversioned. System prompt is assembled at runtime by `src/orchestrator/job-description-orchestrator.ts` from three sources: agent definition (`agents/specialists/job-description.md`, frontmatter-stripped), question bank (🟡 v1, 2026-07-11), PRD (🟡 draft v1, 2026-07-11), plus a hardcoded runtime note. The same `buildJobDescriptionSystemPrompt()` now serves two entry points — text chat (`/api/job-description`) and the voice custom-LLM callback (`/api/job-description/voice-llm`) — so text and voice run one brain. Model: `claude-sonnet-5`, `max_tokens: 2048`, both hardcoded in `src/shared/anthropic-client.ts` / route handlers.
- **Schema version:** both schemas are JSON Schema draft 2020-12, effectively v1 — no explicit `version` field or changelog in the schema files themselves.

No other AI capability has any implementation, prompt, or schema.

---

# Repository Progress

| Area | Completion | Evidence |
|---|---|---|
| Company Blueprint | ░░ 0% | All 12 `docs/company-blueprint/*.md` carry `🔴 PLACEHOLDER`; seed sources named, migration not started |
| Builder's Handbook | ░░ 0% | All 6 files (incl. `00-Roadmap.md`) are `🔴 PLACEHOLDER` |
| Platform Architecture | ▓▓ 20% | `Voice.md` is the first `🟢 READY` architecture doc; the other 7 remain `🔴 PLACEHOLDER`. Substance also lives in 5 ADRs (001, 003, 004, 005 accepted; 002 proposed) |
| Agent Specifications | ▓▓▓▓▓▓ 60% | ADS + Executive + Specialist templates exist with real content but are `🟡 DRAFT`; one real agent definition conforms to the Specialist template |
| Backend | ▓▓▓ 25% | 3 real modules (`orchestrator/`, `shared/`, `app/api/` incl. voice-llm SSE adapter + voice-token minting) + middleware; `api/`, `memory/`, `knowledge/`, `authentication/`, `evaluation/` module dirs still empty scaffolds; single hardcoded product path |
| Frontend | ▓▓▓ 30% | One polished chat page with dual text/live-voice modes + auth pages; no dashboard, history, downloads, settings, multi-agent navigation |
| Authentication | ▓▓▓▓▓▓▓▓ 80% | Fully working login/route-protection/user management via Clerk; missing authz, orgs, tenancy |
| Knowledge | ░░ 0% | Empty scaffold + placeholder doc |
| Memory | ░░ 0% | Empty scaffold + placeholder doc; no database decision made (explicitly deferred in ADR-004) |
| Deployment | ░░ 0% | Target chosen (Vercel, ADR-003), nothing deployed, no CI/CD |
| Testing | ░░ 0% | `tests/` and `evals/` empty; no test runner even installed (no test script in package.json) |

---

# Current Tech Stack

Detected from `package.json`, config, and code — all actually installed and in use:

- **Framework:** Next.js ^15.1 (App Router, TypeScript ^5.7, React ^19), dev server pinned to port **3010**
- **AI:** `@anthropic-ai/sdk` ^0.111, server-side only; model `claude-sonnet-5`; non-streaming for text chat, streaming (SSE) for the voice custom-LLM adapter; **prompt caching** on the shared system prompt (one cache entry serves both channels — ~97% of prompt tokens cached, turn latency ~5.7s → ~1.3s)
- **Auth:** `@clerk/nextjs` ^7.5 (middleware + prebuilt components; dev-instance keys) + shared-secret bearer auth for ElevenLabs' server-to-server callback
- **Voice:** ElevenLabs Agents (`@elevenlabs/react` ^1.10) — WebRTC, streaming STT/TTS, turn-taking, barge-in; agent object configured manually in their dashboard (not IaC)
- **Contracts:** JSON Schema draft 2020-12
- **Agent content:** declarative Markdown in `products/`, loaded via `node:fs` at request time (ADR-001 model)
- **Styling:** inline React style objects + CSS variables in `globals.css` — no CSS framework
- **Hosting:** none yet (Vercel designated)
- **Not present:** database, ORM, test framework, linter config, CI, containerization

---

# Current Sprint

**Goal:** Job Description agent as a real, login-protected SaaS vertical slice (PRD → schemas → prompt → definition → thin `src/` slice → examples → evals).

**Completed** (git history, 2026-07-11):
- Repo scaffold: platform + declarative product verticals (ADR-001)
- JD agent PRD v1 + question bank v1
- Runtime stack decided and built (ADR-003): Next.js app, orchestrator, API route, chat UI
- Voice input/output + real UI pass
- Clerk authentication end-to-end (ADR-004): login, route protection, deterministic API 401s, real dev keys
- Intake + output schemas; agent definition file; one golden example (CIO JD + intake)
- Real-time voice architecture (ADR-005, 2026-07-12): docs first (`Voice.md` 🟢), then ElevenLabs custom-LLM SSE adapter + Clerk-gated token route + live voice mode in the UI, replacing the Web Speech bolt-on; server side verified with simulated ElevenLabs callbacks (auth 401s, SSE stream, non-stream JSON)

- Voice activated E2E (2026-07-16): ElevenLabs agent configured + published, ngrok tunnel, first live spoken intake session completed. Debugging trail: text-only mode flag, secret mismatch, missing OpenAI usage chunk ("LLM Cascade Error"), stale PRD making the agent deny voice support, and turn-latency failures (claude-sonnet-5's default adaptive thinking pushed first-sentence time past ElevenLabs' ~4s per-attempt cutoff → 3x retry storms → dropped sessions). Fixed by: instant SSE flush, prompt caching, cache pre-warm on session start, and `thinking: disabled` on voice turns. **Verified by an automated E2E harness** (`scratchpad/e2e-voice-qa.mjs` pattern — WebSocket conversation driver sending text turns through the full ElevenLabs→tunnel→handler→Claude→TTS loop): 4 consecutive 3-turn conversations, 16/16 turns answered in 2.2–3.4s, one LLM call per turn (no retries), zero errors. Harness should be productized into `products/interview-intelligence/evals/` in the eval sprint

- Market context ingested (2026-07-17): the original INT² pitch deck (Sept 2025) extracted to parent `context/INT2_Pitch_Deck_Sep2025.md`; `products/interview-intelligence/docs/pitch-deck-feature-map.md` maps its four product pillars → candidate agent catalog, splits unique moats (context-based skills definition, red flags + continuity, skill-by-skill evidence, rationale + ask-LLM) from table-stakes, and lists validated buyer asks (competency definition, evidence, ATS integration, GDPR). Direct input to the product-definition rewrite and agent-catalog items below. Pricing prior for the SaaS: per-interview tiered ($299 / $899 / Enterprise)

**Remaining:**
- Evals: golden set + rubric in `products/interview-intelligence/evals/` — the repo's own workflow says nothing is "done" without this
- Persist/export the outputs (currently chat-only text)
- ADR-002: public brand decision (open)
- Product definition rewrite + agent catalog (~5–6 specialists) — parent TODO §F; seed now exists (`pitch-deck-feature-map.md`)
- Finalize the ADS spec (templates still Draft while the first agent already ships against them)

**Blockers:**
- No hard technical blockers. ADR-002 (brand) blocks only customer-facing artifacts, not the build. Business-layer content is blocked on Susan's questionnaire (parent workspace track), not on this repo.

---

# Next Recommended Sprint

**Sprint: Close the Job Description vertical — evaluation + deploy.**

**Why this one:** the repo's own definition of done (README workflow step 5, PRD §8, CLAUDE.md) says an agent isn't finished until it's evaluated — and the JD agent is one step short of being the platform's first *complete* proof of the ADR-001 model. Simultaneously, ADR-003's stated purpose ("experience it as a real SaaS") is unfulfilled while the app only runs on localhost:3010, and the deploy is now doubly load-bearing: ElevenLabs' custom-LLM callback (ADR-005) needs a publicly reachable URL, so the voice conversation cannot go live without it. The first deploy also flushes out the biggest hidden technical risk (runtime `fs` reads of `products/` under Vercel's serverless bundling — see Risks). Building agent #2 or filling blueprint docs before this would stack new work on an unvalidated foundation.

**Expected deliverables:**
1. `products/interview-intelligence/evals/` — golden intake set (3–5 role briefs incl. the CIO example) + scoring rubric implementing PRD §8 dimensions (coverage, fidelity, interview quality, JD craft, measurability). Include the parked **split-model A/B** (2026-07-16, Dana's call): Sonnet 5 for live conversation turns vs. Opus 4.8 for the final JD synthesis step — let the rubric decide if the split earns its cost
2. Minimal eval runner in `scripts/` (or `src/evaluation/`) that replays a golden brief through the orchestrator and reports against the rubric
3. Live Vercel deployment with env vars configured, `products/` confirmed readable at runtime (`outputFileTracingIncludes` if needed), auth working on the deployed URL
4. Voice activated end-to-end against the deployed URL: ElevenLabs agent created, custom LLM pointed at `<deploy-url>/api/job-description/voice-llm`, first real spoken intake session completed
5. This dashboard updated (~~`Repository-Inventory.md` refresh~~ — done 2026-07-17)

---

# Technical Debt

Temporary implementations, hardcoded values, missing abstractions, and known issues found in code:

1. **Spec/runtime contradiction in the agent definition.** `job-description.md` instructs the agent to *write two files to `../../examples/`*; the orchestrator's runtime note then overrides this ("You also cannot write files to disk"). The definition describes the Claude Code authoring context, not the deployed runtime. Docs-lead-code rule says the definition should be fixed.
2. **Module-level system-prompt cache** (`cachedSystemPrompt` in the orchestrator): edits to the PRD/question bank/agent def are invisible until server restart; would also pin stale content per serverless instance.
3. **Orchestrator is single-product hardcoded.** `PRODUCT_ROOT` points at `products/interview-intelligence`; there is no generic "load agent X from product Y" abstraction yet, despite the declarative-products architecture being the repo's core claim.
4. **Runtime `fs.readFileSync` from `process.cwd()`** to load product content — untested under Vercel/serverless output tracing; likely needs explicit file inclusion config at deploy time.
5. **Hardcoded values:** model `claude-sonnet-5` and `max_tokens: 2048` (now duplicated across the text route and the voice-llm adapter — no per-agent config); dev port 3010; sentinel string `"Start the NEW JOB intake session."` triplicated (UI constant, UI filter, voice-llm fallback turn); hardcoded error-banner color `#fdecea` that ignores the CSS-variable theming.
6. **Text API route leaks raw internal error messages** to the client (`error: message` from any thrown Error) — fine for dev, not for production. (The voice-llm route already returns a generic message.)
7. **No streaming in text chat** — full-turn responses make long syntheses (the final JD) feel slow; UI shows a fake typing indicator with `animation: "none"` (dots don't actually animate). Ironically the voice adapter already streams SSE; the text UI doesn't.
8. **Whole PRD + question bank stuffed into every system prompt** — mitigated by Anthropic prompt caching (2026-07-16: ~97% of prompt tokens now read from cache at ~0.1x cost, cutting turn TTFB ~4x), but still unversioned and monolithic; `prompts/` trees exist for exactly this and are empty. Note the cache is prefix-keyed: any byte change to the agent def/question bank/PRD invalidates it (fine — 5-min TTL, self-heals).
9. **No prompt/schema version fields** anywhere; versioning is by markdown STATUS headers and git only.
10. ~~`Repository-Inventory.md` is stale~~ — **resolved 2026-07-17**: regenerated against the current repo (12 commits, runtime + voice + auth reflected).
11. **Placeholder debt:** 25 placeholder docs (12 blueprint + 7 architecture + 6 handbook); `00-Roadmap.md` is referenced by CLAUDE.md as the roadmap and is empty.
12. **`.clerk/.tmp/keyless.json` contains keys** from Clerk's keyless bootstrap; superseded by `.env.local` — should be cleaned and confirmed gitignored. `tsconfig.tsbuildinfo` is also loose in the repo root.
13. **No lint/format config, no test runner installed** — no `npm test` exists at all.
14. **ElevenLabs agent config is not version-controlled** (accepted in ADR-005): voice choice, turn-detection tuning, custom-LLM URL + secret all live only in their dashboard; recreating the agent is manual.
15. **No usage/budget guard on voice** — ElevenLabs bills per conversation-minute and Claude per token, with nothing in code capping session length or spend.
16. **Voice transcripts are display-only** — turns arrive via `onMessage` into React state; the canonical conversation lives on ElevenLabs' side during the session and is lost on refresh, same as text (no persistence layer).
17. **Voice reachability is a laptop-bound ngrok tunnel** — the ElevenLabs custom-LLM URL points at a rotating free-tier ngrok address served by a dev server on Dana's Mac; tunnel restart silently breaks voice until the dashboard URL is updated. Resolved by the Vercel deploy.
18. **Voice-token route is also unusable without the tunnel host being up** — same root cause as #17; listed separately because the failure surfaces client-side (502 on session start) vs. mid-conversation.
19. **Voice context handoff is a module-level singleton** (`src/shared/voice-handoff.ts`, 2026-07-18): fixes the text↔voice context wipe by stashing chat history at token mint and prepending it on every voice turn — but it's single-process and effectively single-concurrent-voice-user (the custom-LLM callback carries no user identity to correlate on). Proper per-session correlation lands with the database/session layer.
20. **Dictation uses the browser Web Speech API** — Chrome/Safari only, `en-US` hardcoded; no server-side transcription fallback.

---

# Risks

Architectural risks visible in the current state (observations, not prescriptions):

1. **The declarative-products claim is unproven at n=2.** One product, one agent, one hardcoded path. Whether a second agent/product truly drops in "declaratively" — per-agent model config, prompt assembly, routing — is untested, and the current orchestrator shape suggests copy-paste pressure when agent #2 arrives.
2. **Serverless/file-system mismatch.** The entire agent-content model depends on reading `products/**` markdown at request time; Vercel's bundler does not include untraced files by default. First deploy may force either config workarounds or a build-time prompt-compilation step (`generated/` exists for this but is unused). This risk sits directly on the critical path of the stated goal.
3. **No persistence layer, and everything upcoming needs one.** History, downloads, tenants, memory, per-user sessions, eval records — every next platform component implies the database decision that ADR-004 deliberately deferred. The longer the JD agent grows features, the more expensive the retrofit.
4. **Quality is unmeasured while the product *is* the output quality.** The sellable value is the JD/intake quality; with zero evals, any prompt or model change is a blind change. The PRD defines the eval bar; nothing enforces it.
5. **Doc-code drift is starting despite a docs-first constitution.** The stale Repository-Inventory, the file-writing agent definition, Draft agent-spec templates behind an already-shipped agent, and an empty Roadmap all show the documentation lagging the code — the exact failure mode the repo's philosophy exists to prevent.
6. **Brand quarantine (ADR-002) is one demo away from being violated.** The app is now demoable; the moment it's shown externally with "interview-intelligence" visible in the UI subtitle, the internal-name rule leaks. Unresolved naming is the only open ADR touching customer-facing surfaces.
7. **Auth is real but tenancy is not.** Any user who signs up gets the same single shared agent with no data isolation concept — acceptable for a prototype, structurally misleading if user counts grow before organizations/tenancy are designed.
8. **The voice path adds a second vendor on the core UX** (ADR-005, accepted knowingly): conversation quality, latency, and turn-taking feel are now tuned in ElevenLabs' dashboard, not this repo; per-minute billing scales linearly with usage; and the `voice-llm` route is the repo's first non-Clerk public endpoint, protected only by a shared secret — a new class of surface to keep correct as routes multiply.

---

# Milestone Timeline

```
Architecture (structure + 5 ADRs; first real arch doc landed)
██████▓░░░ 65%

Platform (shared runtime modules)
██▓░░░░░░░ 25%

Authentication
████████░░ 80%

Conversation (text + live voice working E2E; non-persistent)
█████████░ 90%

Knowledge
░░░░░░░░░░ 0%

Memory
░░░░░░░░░░ 0%

Deployment (live + Git auto-deploy; dev keys, no custom domain, voice not repointed)
███████░░░ 70%

Testing / Evaluation
░░░░░░░░░░ 0%

Production Readiness
█░░░░░░░░░ 10%
```

---

*Maintenance rule: update this document at the end of every sprint by re-inspecting the repository (code, git log, doc STATUS headers, config). If this dashboard and the repo disagree, the repo wins and this file gets fixed.*
