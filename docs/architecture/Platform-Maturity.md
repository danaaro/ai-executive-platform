# AI Executive Platform - Maturity Dashboard

> STATUS: 🟢 LIVE — authoritative implementation status. Regenerate at the end of every sprint by re-inspecting the repository. Everything below is inferred from actual code, docs, and config as of the stated date — no aspirational content.

## Executive Summary

- **Repository Version:** `0.1.0` (package.json) · git `main` @ `a6e8105`; work below sits on branch **`feat/jd-board-flow`**, not yet merged or deployed. **Two remotes:** `origin` → `github.com/danaaro/ai-executive-platform` (private, canonical architecture history) and `susiesbrain` → `github.com/danaaro/SusiesBrain` (deploy source — Vercel auto-deploys from this one).
- **Last Updated:** 2026-07-26 — **Pipeline board + draft-&-approve + sharing + chaining (ADR-008)**: the *AI Hiring Workspace* wireframes (direction 1b) are implemented for the Job Description flow end to end. New surfaces: `/projects` Home split into "Owned by you" / "Shared with you" with a 4-node stage indicator per card (`#4b`), `/projects/[id]` pipeline board on a dot-grid canvas with stage cards, hand-off connectors and a right-hand work drawer (`#1b`), a New Position dialog that invites collaborators at creation (`#4c`), the four intake methods over one shared 20-section progress meter (`#3a`), flexible gating with a soft warning (`#3b`), and the full review → request-changes → approve loop with an oversight trail (`#3d`). Susan Pike & Partners brand implemented (Tailwind v4 + SPP tokens + Roboto/Roboto Slab, Clerk card themed to match). **Authorization was refactored off `createdBy` onto per-project membership** across all eight API handlers plus `appendTurns`. Chaining works: approving the JD flips Competency Builder's card and injects the approved JD into its first turn, server-side.
- **Current Sprint:** F — SaaS-first build (parent `TODO.md` §F.1: steps 1 "Database", 2 "Sessions", 3 "Projects" done; **step 4 "Draft-&-approve" and step 4b "Agent chaining" close with this work**; step 5 "Evals" partial; step 6 "Tenancy" next)
- **Current Goal:** Susan + Dana's testing round on the board in a browser — walk one real role from intake through approval into Competency Builder, and verify sharing with two accounts. Migration is done; the server-side chain is verified by `npm run test:approval`.
- **Overall Completion:** ~62% — one fully productionized agent (JD: text + voice + persistence + progress meter + evals) now inside a real product shell with governance: versioned artifacts, explicit human approval with an append-only audit trail, per-project sharing with three roles, and working agent-to-agent chaining. Nine more agents runnable behind the same runtime and the same board. Not done: streaming replies, tenancy (Clerk Orgs), inline draft comments, per-method intake provenance, downloads/export, observability. Business docs still placeholders.

> **Verification status (2026-07-26).** Migration **run against live Supabase** — `project_members` + `artifact_approvals` created, 2 owner rows backfilled for the 2 existing projects, re-run confirmed idempotent (0 rows on second pass). Production data intact and unchanged afterwards: 2 projects, 6 artifacts, 6 conversations, 53 messages (matches ADR-007's recorded migration counts exactly).
>
> Guards passing: **`npm run test:approval`** — 23 checks walking the real governance chain against the live DB on a throwaway project (empty board → draft → approve → re-derive → inherit → revision supersedes → trail), including the two rules most likely to rot: *a draft upstream is never inheritable*, and *an unapproved v2 does not displace an approved v1*. **`npm run test:voice`** — 18/18 (a pre-existing 1-in-16 flake in the tampered-signature check fixed here). Assembled system prompts proven byte-identical to `main` for all 10 agents, so this refactor cannot have moved eval scores. Route smoke test: `/` → sign-in, `/projects` → sign-in unauthenticated, all APIs 401 without a session.
>
> **Still unexercised:** the two-identity sharing test — Susan seeing a position under "Shared with you", a viewer being refused approval, an editor appending to a shared thread rather than forking it.
>
> **Two bugs found by Dana in the first browser session (2026-07-26/27), both fixed and guarded by `npm run test:drawer` (15 checks):**
> 1. **"Save draft" stored the wrong message.** It saved the agent's *last* turn, which mid-interview is a follow-up question — so a question was being stored as v1 of the job description. Inherited from the legacy chat page, but made critical here because Save is the gateway into the approve loop. Now `findDeliverable()` locates the actual generated document (validated against every artifact and all 32 assistant turns in the live DB), and when no document exists yet the button offers **"Generate … draft"** instead of silently saving a chat line. Note: four of the seven artifacts already in the database are historic question-saves from this bug.
> 2. **The intake meter went backwards** (7.5 → 6.5) when the conversation merely continued. Not data loss — the scorer re-judges all 20 sections from scratch each turn with `claude-haiku-4-5`, and a fast model wobbles. Coverage is now ratcheted (`src/shared/coverage.ts`): a section never regresses, because the transcript only grows and information cannot be un-said. Separately, the prompt-bounding tail-slice would have dropped the OLDEST turns on a very long session — it now preserves every hiring-manager answer and trims agent turns instead.

> **Four more findings from Dana's testing (2026-08-13), all reproduced, fixed and guarded.** This was a targeted fix pass, not a full re-inspection — the completion figures above are unchanged.
>
> 1. **Supabase Security Advisor: 7 × "RLS Disabled in Public" was a real data-exposure path, not lint noise.** `anon` held full CRUD on all seven tables with RLS off, so the project's *publishable* anon key could read and delete every conversation, message and artifact through PostgREST. ADR-006 had deferred RLS on the premise that "no client talks to the DB" — true of our runtime, false of Supabase's always-on REST layer. Fixed by `npm run secure:rls`: RLS enabled with zero policies (default-deny) plus grants and default privileges revoked from `anon`/`authenticated`. Runtime is unaffected (connects as `postgres`: owner + `BYPASSRLS`). Recorded as an amendment to ADR-006.
> 2. **Live voice bundled several questions into one spoken turn.** The operative prompt's *mandatory* Phase-1 rule says bundle 2–4; the voice channel note's milder counter-instruction lost to it on every turn. Rewritten as a named override with a mechanical rule the model can actually check (exactly one `?` per spoken turn) and a ban on trailing option-menus, which double turn length and lead the witness. JD prompt → v1.2, bundling now explicitly scoped to text chat. Guard: **`npm run test:voice-questions`** drives five real spoken turns and counts questions.
> 3. **"Generate job description draft" produced nothing at all.** The button asked for an interim draft — which the JD agent's own Phase-2 rule forbids until the checklist is resolved — so the guardrails answered with the flat refusal sentence. No document meant `findDeliverable()` matched nothing, so the Save button never rendered and the click looked inert. Fixed at the platform layer rather than per-agent: `prompts/system/guardrails.md` now sanctions a `[PLATFORM ACTION: INTERIM DRAFT]` marker (covering all ten agents), `generateDraftPrompt()` emits it, and JD Phase 2 documents the exception. Guard: **`npm run test:jd`** checks that the model produces the document *and* that the detector accepts it — the two independent ways this path can look broken.
> 4. **PDF upload failed every time while DOCX/TXT worked.** pdf-parse v2 wraps pdfjs-dist, which webpack cannot bundle — it threw `Object.defineProperty called on non-object` at *import* time, before a byte was parsed, and the route's blanket `catch` turned that into a generic "Could not parse the file". Fixed with `serverExternalPackages: ["pdf-parse", "mammoth"]`; per-format error handling now distinguishes scanned/no-text-layer PDFs, password-protected PDFs and legacy `.doc`.
>
> Also: `maxDuration` raised 120 → 300 on both agent routes. A full JD interim draft measures 90–120s end to end, which was sitting on the old ceiling and would have intermittently 504'd in production.

> **Fix pass #2 — text chat now streams (2026-08-13 late). Debt #7 is resolved.**
>
> Finding 3 above was reported fixed on the strength of a guard that called the orchestrator directly — skipping the HTTP route, the response contract and the client entirely. Dana then hit the real failure in exactly those skipped layers: **two minutes of waiting ending in "The string did not match the expected pattern."** Document generation measures **109–133s**, so it outlived the 120s function budget, the platform substituted a gateway HTML page, and the browser's `res.json()` threw. The lesson is recorded here deliberately: *a guard that bypasses the transport cannot verify a transport bug*, and the passing guard actively delayed the real diagnosis.
>
> - **Streaming protocol** (`src/shared/agent-stream.ts`) — NDJSON with `open` / `heartbeat` / `delta` / `reset` / `done` / `error`. Both orchestrators gained `stream*Turn` variants; both text-agent routes return `agentStreamResponse`. The truncation-retry guard survives via `reset`, which tells the client to discard partial text before the retry re-sends.
> - **The non-obvious half of the bug:** streaming alone did not fix it. Measured, `fetch` did not resolve its headers for **54.8s** — Next.js withholds them until the first chunk is written, and claude-sonnet-5 spends that long in adaptive thinking before emitting any text. The socket was therefore idle for ~55s of a 109s request, which is what gateways reap. An `open` event is now emitted *before* the model call (headers in **657ms**) and a heartbeat every 10s covers the thinking phase.
> - **`parseJson()`** (`src/lib/api.ts`) replaces bare `res.json()` at every call site. Any non-JSON body — 504, 502, empty, HTML — now produces a sentence that names the timeout and says the work is saved. The browser's internal parser wording can no longer reach a user.
> - **The legacy `/agents` page was carried, not abandoned** — it called the same routes with `res.json()` and would have broken with the identical error. It now reads the stream and paints tokens as they arrive.
> - **Guards:** `npm run test:document` drives the real endpoint over HTTP through the real client reader and asserts headers <5s, heartbeat coverage of the thinking phase, a complete 19,324-char document, a terminating `done`, and that `findDeliverable()` accepts the result so the Save button renders. `npm run test:stream` adds 16 offline checks — every non-JSON body shape, NDJSON reassembly at chunk sizes 1/3/7/64/100k, a malformed line mid-stream, and a stream that ends without `done`.
>
> **Measured across three real end-to-end runs** (dev server, real model, real client reader): headers flush at **589-660ms**; first text token at **~39-76s** (adaptive thinking); **max idle gap between events 10.0s**, exactly the heartbeat interval; total turn **93s / 133s / 158s**. That spread is the whole story of the bug — the 158s run alone is 38s past the old 120s ceiling, and even the fastest run would have been at risk on a 60s-capped plan.
>
> `npm run test:document` boots its own throwaway dev server via `scripts/run-document-test.sh`, using a **dev-only** middleware bypass (`ALLOW_UNAUTHED_AGENT_ROUTES=1`) so the guard needs no Clerk session and no hand-editing of `src/middleware.ts`. The bypass is double-gated on `NODE_ENV !== "production"` plus the flag; **verified inert** — a production build with the flag explicitly set still returns 401 on both routes.
>
> **Verified:** streaming over real HTTP on both routes, full document generation, the client reader, the error surfaces, the production-inertness of the test bypass, plus build, typecheck and all four pre-existing suites (`test:drawer` 16, `test:voice` 18, `test:approval` 23, `test:stream` 16). **Not verified:** the authenticated DB-enabled path in a browser with a real Clerk session (project gating → persistence → Save → approve), and whether the deployed Vercel plan honours `maxDuration = 300`. Both need a signed-in browser session on the deployment.
>
> **Process note worth keeping.** The first version of the liveness check inferred idle time from a heartbeat *count* and failed on a perfectly healthy run. Measuring the largest gap between consecutive events directly — the property that actually matters, since an idle socket is what gets reaped — both passed and produced a number worth reading. A guard that infers its property rather than measuring it produces false alarms and, worse, false confidence.
>
> **Full eval re-run after the guardrails edit — 88.1% agent quality, guardrails 6/6 (100%)** (`generated/evals/run-2026-08-13-21-18/`). This is the strongest full run on record (the two prior full runs scored 73.3% and 79.6%) and the first in which all ten cases completed with 100% structural — the earlier 10-case run had two cases erroring out at 0%. Editing the guardrails did not weaken refusal: both off-scope and prompt-extraction probes pass on all three probed agents. **This also settles part of debt #22 in the wrong direction:** the "88% baseline" cited since 2026-07-20 does not correspond to any single logged full run, so today's number should be treated as the first trustworthy baseline rather than a confirmation of the old one.
>
> **Newly revealed, not newly broken: Interview System Builder is the weakest agent at judge 50%** (45% on an immediate re-run, so it is real, not judge wobble). It **fabricates interviewer names and competency titles** rather than carrying through the panel design and competency framework it was handed — the judge could not trace "Marta Ilves/CTO" or "Executive Stakeholder Translation" back to any input. It scored 0% (errored) in the only prior 10-case run, so it had never actually been measured. Prompt 04 needs an input-fidelity rule before this stage is shown to Susan; logged in the parent `TODO.md` §F.

---

# Business Capabilities

Capabilities are the product catalog of `products/interview-intelligence/` (internal name only — ADR-002).

| Capability | Status | Backend | UI | Conversation | API | Tests | Notes |
|---|---|---|---|---|---|---|---|
| Job Description | 🟢 Production (v1.1) | ✅ Orchestrator: guardrails + Susan's prompt + questionnaire + document-ingest | ✅ Chat UI, live voice, **live intake-progress meter**, Save artifact | ✅ Conversational bundling over 20-section questionnaire; text + voice, cross-session continuity | ✅ `/api/job-description` (+voice-llm+voice-token) · `/api/conversations/[id]/messages` · `/api/conversations/[id]/coverage` · save | ✅ 10 golden cases + 3 guardrail probes, run 2026-07-19 | Only agent with a dedicated route (voice depends on it) and evals; latest judge run flags the JD's section structure/word count as not yet matching Susan's exact spec (score 3/10 on that one dimension — see Remaining) |
| Competency Builder (2) | 🟡 Runnable, untested | ✅ Generic orchestrator | ✅ Via agent picker | ✅ Paste-JD → framework | ✅ `POST /api/agents/competency-builder` (+ save) | 🟡 Guardrail probes only (no golden case) | Awaiting Dana's conversation tests |
| Panel Designer (3) | 🟡 Runnable, untested | ✅ Generic orchestrator | ✅ Via agent picker | ✅ | ✅ `/api/agents/panel-designer` | ❌ | — |
| Interview System Builder (4) | 🟡 Runnable, untested | ✅ Generic orchestrator | ✅ Via agent picker | ✅ | ✅ `/api/agents/interview-system-builder` | ❌ | — |
| Feedback Form Builder (5) · Hiring Rationale (6) · Success Blueprint (7) · Interview Coach (8) | 🟡 Runnable, untested — Phase 2 (personal data) | ✅ Generic orchestrator | ✅ Via agent picker | ✅ | ✅ `/api/agents/<slug>` | ❌ | Human-decision boundaries enforced in-prompt (no scores/recommendations for candidates; coach scores interviewers, not candidates) |
| Recruiter Evaluation Report (A1) | 🟡 Runnable, untested — Phase 2 | ✅ | ✅ | ✅ | ✅ | 🟡 Guardrail probe only | Independent assistant |
| Recruiter Screening Guide (A2) | 🟠 Draft prompt (v0.9) | ✅ | ✅ | ✅ | ✅ | ❌ | Source was a prompt *description*, not the prompt itself — still needs Susan's actual text (flagged in frontmatter + picker) |
| AI Head of Talent Acquisition (executive layer) | ⚪ Named only | ❌ | ❌ | ❌ | ❌ | ❌ | Planned |
| Susan Brain | ⚫ Not defined | ❌ | ❌ | ❌ | ❌ | ❌ | Belongs (if anywhere) to the parent workspace track |

---

# Platform Components

| Component | Status | Notes |
|---|---|---|
| Authentication | 🟢 Working | Clerk (ADR-004). Middleware protects everything; invitation-only sign-up (Susan invited and active); sign-in/up cards branded "SusieBrain" |
| Authorization | 🟢 Per-project membership (ADR-008, 2026-07-26) | `project_members` is the authorization unit: `owner` / `editor` / `viewer` per position, plus platform `admin` from Clerk publicMetadata. `getProjectAccess()` in `src/shared/current-user.ts` is the single choke point; all eight API handlers and `appendTurns` were converted off `createdBy`. Writes need owner/editor/admin; viewers are strictly read-only. Invites are by email and bind to a Clerk id on first sign-in. Migrated and live; **the two-identity sharing test is still pending** |
| Organizations (Tenants) | 🔴 Not started | Clerk Organizations unused; single shared tenant. Prerequisite for a second customer company (queue step 6) |
| Projects | 🟢 LIVE (ADR-007) + **shared & boarded** (ADR-008, 2026-07-26) | The unique key everything hangs off. `/projects` Home splits owned vs shared with a 4-node stage indicator; `/projects/[id]` is the pipeline board (stage cards, hand-off connectors, work drawer). Stage state (`done`/`active`/`warning`/`not-started`), the one-thread-per-stage rule, gating warnings and inheritance are all derived server-side by `src/orchestrator/stages.ts` — one function shared by both endpoints, so Home and the board cannot disagree. **Chaining now works**: `inherit: true` injects the approved upstream artifact into a downstream agent's first turn, assembled server-side so it cannot be substituted |
| Dashboard | 🟡 Partial | `/projects` Home + the `/projects/[id]` board + the two-pane `/artifacts` library are real surfaces now, and draft-&-approve has a UI. Still no cross-project reporting and no export |
| Conversation UI | 🟢 Working — now inside the stage drawer | Primary surface is the board's work drawer (`src/components/board/StageDrawer.tsx`), driven by `useIntakeSession` — the voice/dictation/upload/coverage machinery lifted intact out of the old single-page chat. The former page survives at `/agents` for the independent assistants and Phase-2 agents, which have no board home yet. **Four input modes:** 📎 document upload (PDF/DOCX/MD/TXT) · typed chat · 🎤 dictation (Web Speech API) · 🎙 live voice (JD only). **Live intake-progress meter (new)**: a bar over the JD chat scoring each of the 20 questionnaire sections covered/partial/missing, recomputed via `claude-haiku-4-5` over the persisted transcript whenever new messages land — verified live (rich brief upload → 12/20 covered instantly) |
| Voice Interface | 🟢 Working, production-anchored | ElevenLabs Agents over WebRTC (ADR-005), Claude as the brain via custom-LLM callback — **now pointed at `https://susies-brain.vercel.app/api/job-description/voice-llm`, not a laptop tunnel.** Rebuilt for continuity (2026-07-19): every voice turn persists to Postgres the instant it's transcribed; sessions are anchored to a DB conversation via a signed HMAC "voice grant" (`src/shared/voice-grant.ts`) passed through ElevenLabs' `custom_llm_extra_body` — the callback verifies the signature and hydrates only pre-session history (no duplication), which survives dropped calls, restarts, and different serverless instances. Call duration cap raised 600s → 3600s; UI shows a "Resume voice" banner on drops. Root cause: calls were being force-terminated at the old 10-min default and the previous in-memory handoff (`voice-handoff.ts`, now deleted) couldn't recover across instances. **Verification status:** `npm run test:voice` (18-check automated regression guard) passes; a real human dropped-call resume test by Dana/Susan is still pending. Separately, Susan's earlier "agent doesn't answer" reports (2026-07-19, 15:16–15:47) were diagnosed as hitting the pre-repoint window — no bug, just old laptop-tunnel timing |
| Persistence (DB) | 🟢 LIVE (ADR-006 + ADR-007); 🟡 two tables pending migration (ADR-008) | Supabase Postgres (eu-central-1) + Drizzle. Tables: users (Clerk mirror + role), **projects** (the primary entity, 2026-07-21), conversations, messages, artifacts, plus **`project_members` and `artifact_approvals`, both created in the live DB 2026-07-26** via `npm run migrate:sharing` (idempotent; 2 owner rows backfilled, re-run clean) — conversations and artifacts both require a `project_id` now; artifact versioning is per-project. Role-scoped agents persist; candidate-scoped agents stay ephemeral (zero personal data in DB, by design, until Phase 2 retention). Verified: live CRUD + cascade delete + the live-data migration into per-owner Legacy projects |
| History | 🟢 Working | Conversations persist for role-scoped agents; resume-a-session in chat; admins see all users' sessions; voice sessions now included (see Voice Interface) |
| Draft-&-approve | 🟢 Built (ADR-008, 2026-07-26) | Save creates version N as `draft`; the wide review drawer (640px, a deliberate departure from the wireframe's 300px — a 700-word JD is unreadable narrow) shows the artifact plus its oversight trail with Approve / Request changes. Approve writes `artifact_approvals` (append-only, EU AI Act human-oversight record) and only ever on a slot's latest version. Request-changes logs a note and replays it to the agent, whose revision saves as version N+1. Verified against the live DB by `npm run test:approval` (23 checks); the drawer UI itself is still untested in a browser |
| Settings | 🔴 Not started | Nothing user-configurable beyond the voice toggle |
| Knowledge Base | 🔴 Not started | `src/knowledge/` is README + `.gitkeep`; architecture doc is a placeholder |
| Prompt Management | 🟡 Partial | Prompt assembled at request time from product markdown per ADR-001 — works, but still module-cached (restart to pick up edits), unversioned, no compile step |
| Observability | 🔴 Not started | `console.error` only; `docs/platform-architecture/Observability.md` is a placeholder |
| Evaluation | 🟢 LIVE | `npm run evals` (`scripts/run-evals.ts`) runs 10 golden cases (`products/interview-intelligence/evals/cases/cases.json`) + 3 guardrail probes (off-scope smalltalk, prompt-extraction) across job-description, competency-builder, recruiter-evaluation-report, against the real runtime. 8 runs so far (2026-07-19): first two full-suite runs caught real bugs (25% — the max_tokens/thinking truncation bug; then a **first clean full run: 88% combined, structural 100% on all 10 cases, judge 65–88%, guardrails 6/6**). The remaining runs were targeted single-case reruns while fixing specific findings, not full-suite scores — one of those (JD document-ingest case) still flags the JD's section structure/word count as not matching Susan's exact spec (3/10 on that dimension) — open, not yet fixed |
| Logging | 🔴 Not started | No structured logging, no log schema |
| Monitoring | 🔴 Not started | Nothing deployed, nothing monitored |
| Deployment | 🟢 LIVE | **https://susies-brain.vercel.app** — project `susies-brain`, Dana's own Vercel account (`danaaronovich-5847` / team `danasusie`), Git-linked to `danaaro/SusiesBrain` main, auto-deploy confirmed (~44s builds). Ten prod env vars set via CLI token (Aviv's account never touched after the incident below). History: first deploy (2026-07-18) went to the wrong account (`crispyisland` = Aviv's) — rolled back same day, account-separation rule now in permanent memory. Old misspelled domain (`susiesbrain.vercel.app`, no hyphen) removed; one canonical URL |

---

# AI Capabilities

## Job Description Agent (flagship — the only agent with a dedicated route, evals, and voice)

- **Purpose:** interview a hiring manager conversationally against Susan's 20-section Job Discovery Questionnaire, crediting answers from typed/spoken/uploaded input as they arrive, then synthesize an evidence-based job description plus a fully tagged coverage record for downstream agents.
- **Current maturity:** production-live behind login, text + voice, DB-persisted, first real eval signal. Known open gap: output structure/length doesn't yet strictly match Susan's exact section headers and 500–700 word target (surfaced by the eval judge, not yet fixed).
- **Input:** chat turns via `POST /api/job-description` (text) or the ElevenLabs voice leg (`voice-llm`, `voice-token`, both DB-anchored via `voice-grant.ts`); free-form brief, pasted/uploaded Company Info or an existing JD draft. Intake contract: `job-description.intake.schema.json` (includes the per-question `coverage[]` array).
- **Output:** conversational replies; on completion, the JD as Markdown plus the intake record as JSON — both inline in chat, and explicitly saveable via the Save-artifact flow to the `artifacts` table.
- **Prompt version:** v1.1 (2026-07-19) — mandatory document-ingest: an uploaded/pasted brief is swept against the full questionnaire, extracted answers credited as `source=document`, and the interview continues only from the gaps (covered by an eval case). Assembled at runtime by `job-description-orchestrator.ts`, shared by text and voice. Model: `claude-sonnet-5`, `max_tokens: 16384`; a second model, `claude-haiku-4-5`, now also runs — cheap, cached coverage scoring for the progress meter, separate from the main conversation model.
- **Schema version:** JSON Schema draft 2020-12, effectively v1.

## The other 9 agents

Prompt + agent definition + input/output schemas exist for all of them (imported 2026-07-18 from Susan's production prompts, one description-only exception — Screening Guide). They run through the same generic orchestrator and guardrails layer as the JD agent, are reachable via the agent picker, and can Save artifacts — but none has a dedicated route, a golden eval case, or Dana's conversational review yet. That review round is the current goal.

---

# Repository Progress

| Area | Completion | Evidence |
|---|---|---|
| Company Blueprint | ░░ 0% | All 12 `docs/company-blueprint/*.md` carry `🔴 PLACEHOLDER`; not started |
| Builder's Handbook | ░░ 0% | All 6 files (incl. `00-Roadmap.md`) are `🔴 PLACEHOLDER` |
| Platform Architecture | ▓▓ 20% | `Voice.md` is the only `🟢 READY` architecture doc; 7 remain `🔴 PLACEHOLDER`. Substance lives in 6 ADRs (001, 003, 004, 005, 006 accepted; 002 proposed) |
| Agent Specifications | ▓▓▓▓▓▓ 60% | ADS + Executive + Specialist templates real but still `🟡 DRAFT`; 10 real agent definitions now conform to the Specialist template (was 1) |
| Backend | ▓▓▓▓▓▓▓ 68% | `orchestrator/` (generic + JD-specific + **`stages.ts`** stage derivation + **`inheritance.ts`** chaining), `shared/` (membership authorization, voice-grant, anthropic client), `db/` (schema + client), full `app/api/` surface incl. voice SSE adapter, conversations/messages/coverage, artifacts + **approve / request-changes**, project PATCH/invite/remove, upload-parse; `memory/`, `knowledge/`, `authentication/` module dirs still empty scaffolds |
| Frontend | ▓▓▓▓▓▓▓ 70% | Tailwind v4 + SPP brand tokens + a small hand-rolled shadcn-style primitive set (Radix only for Dialog/Sheet). Home (`#4b`), pipeline board + work drawer (`#1b`), New Position dialog (`#4c`), shared intake progress panel (`#3a`), soft gating warning (`#3b`), wide review panel with approve / request-changes / oversight trail (`#3d`), two-pane artifacts library. Legacy chat retained at `/agents`. Still no streaming replies, no downloads/settings, no cross-project reporting |
| Authentication | ▓▓▓▓▓▓▓▓ 80% | Fully working login/route-protection/invitation-only signup via Clerk; missing orgs/tenancy |
| Persistence | ▓▓▓▓▓▓▓ 70% | Supabase + Drizzle live; users/projects/conversations/messages/artifacts real and verified, project entity landed (ADR-007); no retention policy for Phase 2 personal data |
| Knowledge | ░░ 0% | Empty scaffold + placeholder doc |
| Memory | ░░ 0% | Empty scaffold + placeholder doc |
| Deployment | ▓▓▓▓▓▓▓ 70% | Live + Git auto-deploy + voice repointed; dev Clerk keys, no custom domain, no CI checks before deploy |
| Testing / Evaluation | ▓▓▓▓ 45% | Eval harness built and run 8x against the real runtime; `test:voice` (18 checks, passing — a 1-in-16 flake in the tampered-signature check fixed 2026-07-26). Prompt assembly proven byte-identical to `main` for all 10 agents, so this sprint's refactor cannot have moved eval scores. **`test:approval` (23 checks) covers the approval/inheritance chain and **`test:drawer`** (15) covers deliverable detection + meter monotonicity, both against the live DB.** Still no CI wiring, no `tests/` unit coverage, and no automated coverage of the *authorization* paths specifically (viewer-cannot-approve, editor-appends-not-forks) — that needs two identities and is the highest-value remaining test gap |

---

# Current Tech Stack

Detected from `package.json`, config, and code — all actually installed and in use:

- **Framework:** Next.js ^15.1 (App Router, TypeScript ^5.7, React ^19), dev server pinned to port **3010**
- **AI:** `@anthropic-ai/sdk` ^0.111 — `claude-sonnet-5` for all agent conversation turns, `claude-haiku-4-5` for the new coverage/progress-meter scoring; non-streaming text chat, streaming (SSE) voice adapter; prompt caching on the shared system prompt (~97% of prompt tokens cached)
- **Auth:** `@clerk/nextjs` ^7.5 (middleware + prebuilt components) + shared-secret bearer auth for ElevenLabs' server-to-server callback + HMAC-signed voice grants (`voice-grant.ts`) for cross-instance session correlation
- **Voice:** ElevenLabs Agents (`@elevenlabs/react` ^1.10) — WebRTC, streaming STT/TTS, turn-taking, barge-in, 3600s max call duration; agent configured manually in their dashboard (not IaC)
- **Persistence:** Supabase Postgres (eu-central-1) + `drizzle-orm` + `postgres` client; `drizzle-kit push` for schema
- **Document parsing:** `mammoth` (docx), `pdf-parse` (pdf, v2 class API)
- **Contracts:** JSON Schema draft 2020-12 (20 schemas, 10 agents)
- **Agent content:** declarative Markdown in `products/`, loaded via `node:fs` at request time (ADR-001), explicitly traced into the Vercel bundle via `outputFileTracingIncludes`
- **Eval runner:** `tsx scripts/run-evals.ts` — golden cases + LLM-judge rubric + guardrail probes against the live runtime
- **Styling:** inline React style objects + CSS variables in `globals.css` — no CSS framework
- **Hosting:** Vercel, live (`susies-brain.vercel.app`)
- **Not present:** test framework for code-level unit tests, linter config, CI, containerization

---

# Current Sprint

**Goal (from here):** Susan + Dana's testing round on the live app, feeding prompt iteration; then build queue step 3 — roles/requisitions (chains agent outputs, kills copy-paste, brings the dashboard mockup to life).

**Completed this stretch (2026-07-21):**
- **Project as primary entity (ADR-007)**: `projects` table; conversations/artifacts require `project_id`; versioning moved from (owner, agent) to (project, agent); live data migrated (nothing lost); `/projects` + `/projects/[id]` pages; chat page project-gates the five persistable agents; `/artifacts` groups by project

**Completed the prior stretch (2026-07-18 → 2026-07-19):**
- Agent suite import: Susan's 10 production prompts + definitions + schemas, platform guardrails layer, generic agent runtime + picker, save-artifact flow
- Four input modes (upload/type/dictate/voice) with context continuity across mode switches
- Vercel production deploy — including the wrong-account incident, rollback, and the account-separation rule now permanently in memory
- Persistence layer (ADR-006): Supabase + Drizzle, versioned artifacts, sessions for role-scoped agents, admin/member RBAC
- ElevenLabs repointed to the production URL; Clerk sign-in/up branding fixed to "SusieBrain"
- Eval harness built and run 8 times against the live runtime; JD upgraded to v1.1 (document-ingest) directly off eval findings (max_tokens truncation, missing usage chunk)
- **Voice continuity rebuilt**: DB-anchored HMAC voice grants replace the old in-memory singleton handoff; every voice turn persists immediately; call duration cap raised — a dropped or restarted call no longer loses the conversation
- **Intake-progress meter**: live coverage bar over the JD chat, scored by a second cheap model (`claude-haiku-4-5`) over the persisted transcript

**Remaining:**
- **Agent-to-agent auto-fill within a project** (queue step 4b) — the project entity exists now, but opening Competency Builder from a project still doesn't pre-load the JD; copy-paste between agents is not actually killed yet
- Human-verify one real dropped-call voice resume (Dana/Susan) — the continuity fix has an automated regression guard (`test:voice`, 18 checks passing) but no live human test yet
- Fix the JD's output structure/word count to match Susan's exact section spec (eval judge is catching this consistently — not yet addressed)
- Draft-&-approve states + approval log (queue step 4)
- Reconcile the two git remotes (`origin` = architecture history, `susiesbrain` = deploy source) — currently fine but a latent confusion risk (see Risks)
- Dana + Susan per-agent conversational testing for agents 2–10 (none reviewed yet)
- Get Susan's actual Recruiter Screening Guide prompt (still a description-derived draft)
- ADR-002: public brand decision (still open)
- CI wiring for evals; unit test framework for code-level tests (neither exists)

**Blockers:**
- None hard-technical. ADR-002 (brand) blocks only customer-facing artifacts. Business-layer content (pricing, contracts) is blocked on the parent-workspace track, not this repo.

---

# Next Recommended Sprint

**Sprint: Agent chaining — the platform's first real multi-agent workflow.**

**Why this one:** the project entity (ADR-007) now exists, but it's still just a filing system — every agent from 2 onward requires copy-pasting the previous agent's output into the next chat by hand. The exact "declarative products, shared runtime" claim (ADR-001) hasn't been tested end-to-end as a *chain*. Auto-filling agent inputs from a project's approved artifacts is what turns 10 independent chat agents into one workflow — and it's the piece the original UX mockup's two-zone board was designed around but the app still doesn't have.

**Expected deliverables:**
1. Agent input auto-fill: opening Competency Builder from a project with an approved JD pre-loads it as context — no paste step
2. Same for Panel Designer (competency framework + JD) and Interview System Builder (competency framework + panel)
3. Fix the JD structural/word-count gap the evals surfaced, and re-run the golden set to confirm the fix actually moves the judge score
4. This dashboard + `Repository-Inventory.md` refreshed again once chaining lands

---

# Technical Debt

Temporary implementations, hardcoded values, missing abstractions, and known issues found in code:

1. ~~**Spec/runtime contradiction in the agent definition.**~~ **Resolved** — JD agent definition no longer instructs file-writing; runtime note and definition agree.
2. **Module-level system-prompt cache** (`cachedSystemPrompt` in the orchestrator): edits to prompts/question bank are invisible until server restart; pins stale content per serverless instance.
3. **Orchestrator still has a JD-specific path alongside the generic one.** `job-description-orchestrator.ts` remains separate from `agent-orchestrator.ts` (by design — voice depends on the dedicated route) but this is two code paths to keep in sync as JD evolves.
4. **Runtime `fs.readFileSync` from `process.cwd()`** to load product content — now proven to work on Vercel via `outputFileTracingIncludes`, but still a bespoke config rather than a build-time compile step.
5. **Hardcoded values:** dev port 3010; model names duplicated across routes (no per-agent config file); sentinel string `"Start the NEW JOB intake session."` still appears in multiple places.
6. **Text API route leaks raw internal error messages** to the client — fine for dev, not for production.
7. ~~**No streaming in text chat**~~ — **Resolved 2026-08-13** (`src/shared/agent-stream.ts`). Was not merely a UX nicety: the non-streaming turn outlived the function budget and produced an unparseable gateway response in the browser.
8. **Whole prompt content stuffed into every system prompt** — mitigated by prompt caching (~97% cache hit) but still unversioned and monolithic.
9. **No prompt/schema version fields** anywhere; versioning is by markdown STATUS headers, frontmatter `version:` strings, and git only.
10. ~~`Repository-Inventory.md` is stale~~ — resolved by this regeneration (2026-07-19).
11. **Placeholder debt:** 25 placeholder docs (12 blueprint + 7 architecture + 6 handbook); `00-Roadmap.md` referenced by CLAUDE.md is empty.
12. **`.clerk/.tmp/keyless.json`** and `tsconfig.tsbuildinfo` loose in the repo root — should be confirmed gitignored.
13. **No lint/format config, no code-level test runner installed** — `npm run evals` tests agent *output quality*, nothing tests the TypeScript itself.
14. **ElevenLabs agent config is not version-controlled** (accepted in ADR-005): voice choice, turn-detection tuning, custom-LLM URL/secret, and now the 3600s duration cap all live only in their dashboard.
15. **No usage/budget guard on voice or the new haiku coverage calls** — nothing in code caps session length or spend on either model.
16. ~~**Voice transcripts are display-only.**~~ **Resolved** — every voice turn now persists to Postgres the moment it's transcribed.
17. ~~**Voice reachability is a laptop-bound ngrok tunnel.**~~ **Resolved** — ElevenLabs custom-LLM URL points at the production Vercel deploy.
18. ~~**Voice-token route is unusable without the tunnel host being up.**~~ **Resolved** — same fix as #17.
19. ~~**Voice context handoff was a module-level singleton.**~~ **Resolved (2026-07-19)** — replaced by `voice-grant.ts`: signed HMAC grants anchor a voice session to a DB conversation, verified server-side, safe across instances and dropped calls.
20. **Dictation uses the browser Web Speech API** — Chrome/Safari only, `en-US` hardcoded; no server-side transcription fallback.
21. **New: two git remotes for one repo** (`origin` = `ai-executive-platform`, `susiesbrain` = `SusiesBrain`, the deploy source) — works today because commits get pushed to both, but nothing enforces that; a push to only one remote silently desyncs architecture history from what's actually deployed.
22. **New: only one full-suite eval run exists so far** (88% combined) — the other 7 runs logged under `generated/evals/` were narrower debugging reruns of specific cases (some scoring much lower, e.g. 25% while a real bug was still present), not repeat measurements of the same thing. Judge-score stability run-to-run on an unchanged agent is still unknown; needs a second clean full-suite run to check before evals can gate changes with confidence. **Partly addressed 2026-08-13:** a second clean full-suite run landed (88.1%, guardrails 100%), and a same-case repeat scored 50% → 45% on interview-system-builder — close enough to treat a ~5-point swing as noise and a 30-point gap as signal. But it also showed the long-cited "88% baseline" matches no logged full run, so **treat 2026-08-13 as the first real baseline** and discard comparisons to the earlier figure.
23. **New: coverage/progress-meter caching is per-conversation-row, not time-boxed** — recomputes on new messages only; if the haiku call fails silently the bar could show stale coverage with no visible error state.
24. **New: no project deletion/archive UI** (ADR-007) — a project can only be created and moved between open/filled/archived by direct DB edit; the `status` field is pre-wired but nothing sets it from the app.
25. **New: candidate-level structure is deferred, not designed** (ADR-007 scope cut) — Phase-2 agents (feedback, rationale, blueprint, coach, recruiter-evaluation-report) still sit outside the project model entirely; when Phase 2 lands, fitting candidates under a project will likely mean another schema pass, not a drop-in extension.
26. **New (2026-08-13): the interim-draft contract is a string match across three files.** `INTERIM_DRAFT_MARKER` in `deliverable.ts` must stay identical to the marker sanctioned in `prompts/system/guardrails.md` and referenced in the JD prompt's Phase 2. Nothing enforces the match — a typo in any one of them silently restores the refusal behaviour, and only `npm run test:jd` would catch it.
27. **New (2026-08-13): the voice one-question rule is prompt-enforced, not code-enforced.** The handler asks the model to emit exactly one `?` per spoken turn; nothing validates the reply before it reaches TTS. `npm run test:voice-questions` samples five turns against a live model, so it is a sampling guard against a stochastic behaviour, not a guarantee — a regression could pass one run and fail the next.
28. **New (2026-08-13): agent turns still run 109–133s**, now streamed and heartbeated so the connection cannot be reaped, and budgeted at 300s. Two residual risks: a Vercel plan whose ceiling is below 300s would still cut the tail of a long write, and ~55s of every long turn is adaptive thinking during which the user sees only the elapsed counter — no text yet. Shortening that means constraining thinking, which trades measured output quality for perceived speed; not attempted.

---

# Risks

Architectural risks visible in the current state (observations, not prescriptions):

1. **The declarative-products claim is still unproven at true n=2.** All 10 agents share one orchestrator and one product folder; a genuinely second *product* (not just a second agent within interview-intelligence) hasn't been attempted.
2. **The project layer exists but doesn't chain yet.** ADR-007 gives every project-scoped agent a shared home with real version history, but agents 2–4 still require manual copy-paste from the previous agent's output — the project is a filing cabinet, not yet a pipeline. This is the immediate next sprint.
3. **Quality is measured but only from one full-suite data point.** Evals exist now (progress from zero) and the first clean run scored 88% — but with only one full-suite run logged, it's not yet known whether a re-run of the *same* unchanged agent reproduces that score or swings — see debt #22.
4. **Two git remotes for one working tree** is a live risk, not just a debt item: whichever remote gets forgotten in a future push silently diverges architecture history from the deployed app.
5. **Brand quarantine (ADR-002) is one demo away from being violated** — the app is now live and demoable to Susan; the moment it's shown to an actual prospect with "interview-intelligence" visible anywhere, the internal-name rule leaks.
6. **Auth is real but tenancy is not.** Every signed-up user shares the same data space (RBAC by role, not by org) — fine for a two-person pilot, structurally wrong the moment a second customer company appears.
7. **The voice path now depends on three systems staying in sync**: ElevenLabs' dashboard config (not IaC), the HMAC grant secret, and the DB — a config drift in any one silently breaks voice without a code change to point to.
8. **Doc-code drift recurred once already** — this exact regeneration was needed because two shipped features (voice continuity rebuild, progress meter) landed without the dashboards being updated. Nothing enforces the "update at end of sprint" rule except discipline.

---

# Milestone Timeline

```
Architecture (structure + 6 ADRs; two real arch docs)
██████▓░░░ 65%

Platform (shared runtime + persistence + eval harness)
█████▓░░░░ 55%

Authentication
████████░░ 80%

Conversation (text + live voice, DB-anchored, progress meter)
█████████▓ 95%

Persistence (projects, conversations, artifacts, messages)
███████░░░ 70%

Knowledge
░░░░░░░░░░ 0%

Memory
░░░░░░░░░░ 0%

Deployment (live, Git auto-deploy, voice repointed to prod)
███████▓░░ 75%

Testing / Evaluation (harness live, run 8x, high variance)
███░░░░░░░ 30%

Projects / Multi-agent workflow (entity + UI live, chaining not built)
████░░░░░░ 40%

Production Readiness
██▓░░░░░░░ 25%
```

---

*Maintenance rule: update this document at the end of every sprint by re-inspecting the repository (code, git log, doc STATUS headers, config). If this dashboard and the repo disagree, the repo wins and this file gets fixed. (This regeneration is itself an example of the rule being enforced late — two shipped sprints had gone undocumented.)*
