# Repository Inventory — Architecture Readiness

> Descriptive architecture inventory of the **AI Executive Platform** repository.
> Purpose: let an external AI architect review the structure and its readiness without reading every file. Implementation/sprint status lives in `docs/architecture/Platform-Maturity.md` (authoritative); this doc covers structure, contracts, decisions, and readiness.
> Regenerated: **2026-07-19** · Repo state: deployed multi-agent Next.js app (~25 TS/TSX source files), 1 product vertical with 10 agents (1 productionized, 9 runnable-but-untested), Postgres persistence, live eval harness, 6 ADRs. Git: `main` @ `a6c0fe3`, 22 commits. **Two remotes**: `origin` → `github.com/danaaro/ai-executive-platform` (canonical), `susiesbrain` → `github.com/danaaro/SusiesBrain` (Vercel deploy source).

---

## Repository Overview

The AI Executive Platform is the multi-product SaaS being built by **SusanDana Co** (Susan Pike-Gubler + Dana Aronovich). It sells **AI executives and specialist agents** to customer companies. Internal company-OS agents are a separate, parked track in the parent workspace and are excluded here.

The repo has moved from a single-vertical prototype to a **deployed, multi-agent, persistent product**: all 10 of Susan's production agents run behind a shared guardrails layer and generic orchestrator; the Job Description agent is the flagship — text + real-time voice, DB-anchored conversation continuity, a live progress meter, and the platform's first eval harness. The app is live at `https://susies-brain.vercel.app`, invitation-only, with Dana and Susan as admins. The architecture claim — platform + declarative product verticals (ADR-001) — is now exercised at n=10 agents within one product, though still n=1 at the *product* level.

Methodology is docs-first / architecture-first: every folder carries a README contract, hard decisions get ADRs, and agent content is declarative Markdown loaded by a product-agnostic runtime.

---

## Architecture Readiness at a Glance

| Layer | Readiness | Evidence |
|---|---|---|
| Repository topology (ADR-001) | 🟢 Decided & built | Fixed tree, platform/product split enforced by CLAUDE.md rules; holds at 10 agents |
| Runtime stack (ADR-003) | 🟢 Decided & built | Next.js 15 App Router + TS + `@anthropic-ai/sdk`; dev port 3010 |
| Authentication (ADR-004) | 🟢 Decided & built | Clerk: middleware, invitation-only sign-up, deterministic API 401s. No authz-per-resource/orgs/tenancy |
| Voice architecture (ADR-005) | 🟢 Decided & built, rebuilt for continuity | ElevenLabs Agents (WebRTC) + custom-LLM SSE adapter; now DB-anchored via signed HMAC voice grants (`src/shared/voice-grant.ts`) instead of an in-memory handoff — survives dropped calls and serverless instance changes |
| Persistence (ADR-006) | 🟢 Decided & built | Supabase Postgres (eu-central-1) + Drizzle; users/conversations/messages/artifacts live; role-scoped agents persist, candidate-scoped stay ephemeral by design |
| Product naming (ADR-002) | 🟡 **Open** | "interview-intelligence" internal-only; public brand undecided — only ADR touching customer-facing surfaces, and the app is now demoable |
| Deployment | 🟢 Decided & executed | Live on Vercel (`susies-brain.vercel.app`), Git auto-deploy from `danaaro/SusiesBrain` main, ~44s builds. Correct-account discipline now in permanent memory after a same-day rollback incident |
| Evaluation | 🟢 Built | `scripts/run-evals.ts`: 10 golden cases + 3 guardrail probes against the live runtime. First clean full-suite run: 88% combined, structural 100%, guardrails 6/6. Later runs were targeted single-case reruns while fixing specific findings (one still flags the JD's structure/word count as off-spec), not repeat full-suite scores |
| Roles / multi-agent workflow | 🔴 Not built | Agents 1–10 are independent chats; no entity chains one agent's approved output into the next agent's input yet (next build-queue step) |
| Observability / logging | 🔴 Not built | `console.error` only; architecture doc placeholder |
| Knowledge / memory | 🔴 Not built | Empty scaffolds + placeholder docs |

**Architecture docs:** 1 of 8 real (`Voice.md` 🟢); the other 7 (`HighLevelArchitecture`, `Authentication`, `MemoryArchitecture`, `KnowledgeArchitecture`, `Communication`, `Observability`, `Deployment`) are 🔴 placeholders — the substance lives in the 6 ADRs and the code.

---

## Directory Tree (real content only; scaffold dirs marked)

```
ai-executive-platform/
├── README.md · CLAUDE.md · LICENSE · Repository-Inventory.md (this file)
├── docs/
│   ├── adrs/                        6 ADRs (001,003,004,005,006 accepted; 002 proposed)
│   ├── architecture/                Platform-Maturity.md (🟢 LIVE dashboard)
│   ├── platform-architecture/       Voice.md 🟢; 7 placeholders
│   ├── agent-specifications/        ADS + Executive + Specialist templates (🟡 Draft)
│   ├── company-blueprint/           12 placeholders (seed: parent foundation/)
│   ├── builders-handbook/           6 placeholders (incl. empty 00-Roadmap.md)
│   └── implementation/ assets/      empty
├── src/                             the shared runtime (working code)
│   ├── app/
│   │   ├── page.tsx                 chat UI: agent picker, 4 input modes, live voice, progress meter, resume-session, save
│   │   ├── artifacts/page.tsx        artifact library: grouped by agent, versioned, admin creator column
│   │   ├── layout.tsx · globals.css · sign-in/ · sign-up/    "SusieBrain" branded
│   │   └── api/
│   │       ├── job-description/
│   │       │   ├── route.ts                       text chat endpoint (non-streaming)
│   │       │   ├── voice-llm/                      OpenAI-compatible SSE adapter for ElevenLabs
│   │       │   │   ├── handler.ts · route.ts · chat/completions/route.ts
│   │       │   └── voice-token/route.ts             Clerk-gated ElevenLabs token minting + voice-grant issuing
│   │       ├── agents/[slug]/route.ts               generic chat endpoint, all 10 agents
│   │       ├── agents/[slug]/save/route.ts          versioned artifact save
│   │       ├── conversations/route.ts · [id]/route.ts    session list + resume
│   │       ├── conversations/[id]/messages/route.ts  voice-turn persistence (owner-verified)
│   │       ├── conversations/[id]/coverage/route.ts   progress-meter scoring (claude-haiku-4-5)
│   │       ├── artifacts/route.ts                    artifact list + fetch (admin sees all)
│   │       └── upload-parse/route.ts                 txt/md/docx(mammoth)/pdf(pdf-parse)
│   ├── middleware.ts                Clerk route protection
│   ├── orchestrator/
│   │   ├── job-description-orchestrator.ts   JD-specific prompt assembly (text + voice share it)
│   │   └── agent-orchestrator.ts             generic loader: any of the 10 agents by slug
│   ├── db/
│   │   ├── schema.ts                 users, conversations, messages, artifacts (Drizzle)
│   │   └── index.ts                  lazy postgres() singleton, transaction pooler
│   ├── shared/
│   │   ├── anthropic-client.ts       model + client config
│   │   ├── current-user.ts           Clerk↔DB mirror, role resolution, persistence helpers
│   │   └── voice-grant.ts            signed HMAC grant anchoring voice sessions to DB conversations
│   └── knowledge/                    empty scaffold
├── products/
│   └── interview-intelligence/      (internal name only — ADR-002)
│       ├── prompts/                  10 normalized production prompts (01-job-description.md … 10-screening-guide.md)
│       ├── agents/specialists/       10 agent definitions (all conform to the Specialist template)
│       ├── agents/executives/        empty (AI Head of TA planned)
│       ├── schemas/                  20 JSON Schemas (input+output × 10 agents; JD uses intake+output), draft 2020-12
│       ├── docs/                     PRD, question-bank v2 (20-section Job Discovery Questionnaire), pitch-deck-feature-map
│       ├── examples/                 CIO golden example (JD + intake JSON)
│       └── evals/
│           ├── cases/cases.json      10 golden cases + guardrail-probe definitions (refusal sentence, leak markers)
│           └── fixtures/             8 markdown fixtures (brief, JD, competency framework, panel, interview guide, CV, transcript, feedback)
├── scripts/
│   ├── run-evals.ts                  eval runner (npm run evals)
│   └── test-voice-continuity.ts      voice-grant / continuity smoke test (npm run test:voice)
├── generated/evals/run-*/            8 eval run outputs (report.md, results.json, transcripts.json) — gitignored
├── agents/ prompts/ schemas/ tests/  platform-level empty scaffolds (per-product content lives under products/)
└── package.json                     next ^15.1, react ^19, @anthropic-ai/sdk ^0.111, @clerk/nextjs ^7.5,
                                     @elevenlabs/react ^1.10, drizzle-orm, postgres, mammoth, pdf-parse, TS ^5.7
```

---

## Architecture Decisions

| ADR | Title | Status | Essence |
|---|---|---|---|
| 001 | Repository Structure | **Accepted** | Platform + declarative product verticals; code only in `src/`; products are declarative folders; holds at 10 agents |
| 002 | Product Naming & Branding | **Proposed (open)** | `interview-intelligence` internal-only; no INT²/"Interview Intelligence" in customer-facing artifacts; decide before first external demo — the app is now live and demoable, raising the stakes |
| 003 | Runtime Stack | **Accepted** | Next.js (TS, App Router) + Anthropic SDK; Vercel deploy target — now executed |
| 004 | Authentication Provider | **Accepted** | Clerk for login/user management; database decision deferred here, made in ADR-006 |
| 005 | Voice Conversation Provider | **Accepted** | ElevenLabs Agents for the real-time voice leg; Claude stays the brain via custom-LLM callback; continuity mechanism rebuilt 2026-07-19 on top of ADR-006's persistence |
| 006 | Persistence Layer | **Accepted (2026-07-19)** | Supabase Postgres + Drizzle over Neon/other options; versioned artifact slots; role-scoped agents persist conversations, candidate-scoped agents don't (zero personal data until Phase 2 retention) |

**Next ADRs implied by the current state:** ADR-002 resolution (brand); a roles/requisitions data-model decision (queue step 3); eventually a tenancy model (Clerk Organizations, queue step 6).

---

## Contracts & Specifications

- **Agent spec framework:** `docs/agent-specifications/` — ADS + Executive + Specialist templates, real content, still 🟡 Draft while 10 agents already ship against them (drift risk, unchanged from before).
- **Implemented agents:** all 10 of Susan's production agents have a definition + prompt + input/output schemas. Job Description is the only one with a dedicated route, live voice, DB-anchored continuity, a progress meter, and eval coverage; the other 9 share the generic orchestrator/route and are unreviewed by Dana.
- **Guardrails layer:** `prompts/system/guardrails.md`, prepended platform-wide — scope lockdown, hard refusal ("This request cannot be answered by this assistant."), non-disclosure, methodology integrity. Verified via 3 guardrail probes in the eval harness (100% pass in the latest run) plus manual live probes during import.
- **Evals:** `products/interview-intelligence/evals/cases/cases.json` — 10 golden cases (structural regex + LLM-judge rubric) + guardrail probes across 3 agents. Runner: `scripts/run-evals.ts`. 8 runs logged under `generated/evals/`; judge variance is high enough (25–88% across runs) that a single run isn't yet a reliable gate — flagged as debt.
- **Planned agents (named only):** AI Head of Talent Acquisition (executive layer), Susan Brain. `docs/pitch-deck-feature-map.md` maps the market-validated feature surface onto the current catalog.
- **Platform-wide schemas** (`schemas/` at repo root): still empty — message envelope, agent-definition schema, eval-result schema not yet needed while everything lives under one product.

---

## Readiness Risks (what an architect should know before building on this)

1. **Declarative-products claim proven at n=10 agents, still n=1 at the product level** — the generic orchestrator now serves 10 agents cleanly, but a genuinely second *product* (separate domain, not just another agent in interview-intelligence) hasn't been attempted.
2. **No roles/chaining layer** — agents 2–10 require manually pasting the previous agent's output as input; this is the single biggest gap between the deployed app and the intended workflow, and is the next build-queue step.
3. **Two git remotes for one working tree** (`origin` = architecture history, `susiesbrain` = what Vercel actually deploys) — fine today, a real desync risk the moment a push targets only one of them.
4. **Voice continuity has an automated guard but no human verification yet** — `test:voice` (18 checks) passes, but a real dropped-call resume by Dana/Susan hasn't been tried live. Separately, quality on the JD itself is measured now (a real change from before this sprint) but only one full-suite eval run exists so far (88%); not yet enough runs to know how much the judge score naturally varies.
5. **Voice now depends on three systems staying in sync** — ElevenLabs' dashboard config (not IaC), the HMAC grant secret, and the DB; a mismatch in any one silently breaks voice.
6. **Brand quarantine one demo from violation** — the app is live and demoable to Susan today; the internal name is still exposed in the UI, and ADR-002 remains open.
7. **Doc-code drift recurred** — this regeneration exists because two already-shipped features (voice-continuity rebuild, progress meter) went undocumented for a stretch. The "regenerate at end of sprint" rule needs an enforcement mechanism, not just intent.
8. **Auth is real, tenancy is not** — single shared data space by role, not by organization; acceptable for the current two-admin pilot, not for a second customer company.

Full technical-debt register (23 items) and sprint plan: `docs/architecture/Platform-Maturity.md`.

---

*Maintenance: regenerate alongside the Platform-Maturity dashboard when the repo's structure or decisions change. If this doc and the repo disagree, the repo wins.*
