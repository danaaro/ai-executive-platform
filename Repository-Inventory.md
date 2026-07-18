# Repository Inventory — Architecture Readiness

> Descriptive architecture inventory of the **AI Executive Platform** repository.
> Purpose: let an external AI architect review the structure and its readiness without reading every file. Implementation/sprint status lives in `docs/architecture/Platform-Maturity.md` (authoritative); this doc covers structure, contracts, decisions, and readiness.
> Regenerated: **2026-07-17** · Repo state: working Next.js app (~15 TS/TSX source files), 1 product vertical with a live agent, 5 ADRs. Git: `main` @ `7143958`, 12 commits, remote `github.com/danaaro/ai-executive-platform` (private).

---

## Repository Overview

The AI Executive Platform is the multi-product SaaS being built by **SusanDana Co** (Susan Pike-Gubler + Dana Aronovich). It sells **AI executives and specialist agents** to customer companies. Internal company-OS agents are a separate, parked track in the parent workspace and are excluded here.

The repo has moved from scaffolding to a **working single-vertical prototype**: the Job Description agent runs end-to-end as a login-protected Next.js app with text chat and real-time voice (first live spoken intake completed 2026-07-16). The architecture claim — platform + declarative product verticals (ADR-001) — is implemented but proven only at n=1 (one product, one agent, one hardcoded path).

Methodology is docs-first / architecture-first: every folder carries a README contract, hard decisions get ADRs, and agent content is declarative Markdown loaded by a product-agnostic runtime.

---

## Architecture Readiness at a Glance

| Layer | Readiness | Evidence |
|---|---|---|
| Repository topology (ADR-001) | 🟢 Decided & built | Fixed tree, platform/product split enforced by CLAUDE.md rules |
| Runtime stack (ADR-003) | 🟢 Decided & built | Next.js 15 App Router + TS + `@anthropic-ai/sdk`; dev port 3010 |
| Authentication (ADR-004) | 🟢 Decided & built | Clerk: middleware, sign-in/up pages, deterministic API 401s. No authz/orgs/tenancy |
| Voice architecture (ADR-005) | 🟢 Decided & built | ElevenLabs Agents (WebRTC) + custom-LLM SSE adapter keeping Claude as the brain; `Voice.md` is the first 🟢 READY architecture doc. Verified live + automated 16/16-turn harness |
| Product naming (ADR-002) | 🟡 **Open** | "interview-intelligence" internal-only; public brand undecided — only ADR touching customer-facing surfaces |
| Deployment | 🔴 Decided, not executed | Vercel designated (ADR-003); nothing deployed, no CI. Voice currently rides a laptop ngrok tunnel |
| Persistence / database | 🔴 Not decided | Deliberately deferred in ADR-004; now the biggest undecided architectural question (history, tenants, evals all need it) |
| Evaluation | 🔴 Not built | Eval bar defined in JD PRD §8; `evals/` empty; a proven E2E voice harness exists in scratchpad form, unproductized |
| Observability / logging | 🔴 Not built | `console.error` only; architecture doc placeholder |
| Knowledge / memory | 🔴 Not built | Empty scaffolds + placeholder docs |

**Architecture docs:** 1 of 8 real (`Voice.md` 🟢); the other 7 (`HighLevelArchitecture`, `Authentication`, `MemoryArchitecture`, `KnowledgeArchitecture`, `Communication`, `Observability`, `Deployment`) are 🔴 placeholders — the substance currently lives in the 5 ADRs and the code.

---

## Directory Tree (real content only; scaffold dirs marked)

```
ai-executive-platform/
├── README.md · CLAUDE.md · LICENSE · Repository-Inventory.md (this file)
├── docs/
│   ├── adrs/                        5 ADRs (001,003,004,005 accepted; 002 proposed)
│   ├── architecture/                Platform-Maturity.md (🟢 LIVE dashboard)
│   ├── platform-architecture/       Voice.md 🟢; 7 placeholders
│   ├── agent-specifications/        ADS + Executive + Specialist templates (🟡 Draft)
│   ├── company-blueprint/           12 placeholders (seed: parent foundation/)
│   ├── builders-handbook/           6 placeholders (incl. empty 00-Roadmap.md)
│   └── implementation/ assets/      empty
├── src/                             the shared runtime (working code)
│   ├── app/                         Next.js App Router
│   │   ├── page.tsx                 chat UI (text + live-voice modes)
│   │   ├── layout.tsx · globals.css · sign-in/ · sign-up/
│   │   └── api/job-description/
│   │       ├── route.ts             text chat endpoint (non-streaming)
│   │       ├── voice-llm/           OpenAI-compatible SSE adapter for ElevenLabs
│   │       │   ├── handler.ts · route.ts · chat/completions/route.ts
│   │       └── voice-token/route.ts Clerk-gated ElevenLabs token minting
│   ├── middleware.ts                Clerk route protection
│   ├── orchestrator/job-description-orchestrator.ts   prompt assembly from product markdown
│   ├── shared/anthropic-client.ts   model + client config (claude-sonnet-5, hardcoded)
│   └── api/ memory/ knowledge/ authentication/ evaluation/   empty scaffolds
├── products/
│   └── interview-intelligence/      (internal name only — ADR-002)
│       ├── agents/specialists/job-description.md        agent definition (conforms to Specialist template)
│       ├── docs/  job-description-PRD.md (v1) · question-bank (v1) · pitch-deck-feature-map.md (NEW 2026-07-17)
│       ├── schemas/ intake + output JSON Schemas (draft 2020-12)
│       ├── examples/ CIO golden example (JD + intake JSON)
│       ├── prompts/ · evals/        empty
│       └── agents/executives/       empty (AI Head of TA planned)
├── agents/ prompts/ schemas/ tests/ generated/ scripts/ examples/   empty scaffolds
└── package.json                     next ^15.1, react ^19, @anthropic-ai/sdk ^0.111,
                                     @clerk/nextjs ^7.5, @elevenlabs/react ^1.10, TS ^5.7
```

---

## Architecture Decisions

| ADR | Title | Status | Essence |
|---|---|---|---|
| 001 | Repository Structure | **Accepted** | Platform + declarative product verticals; code only in `src/`; products are declarative folders; 7 structural rulings |
| 002 | Product Naming & Branding | **Proposed (open)** | `interview-intelligence` internal-only; no INT²/"Interview Intelligence" in customer-facing artifacts; decide before first external demo |
| 003 | Runtime Stack | **Accepted** | Next.js (TS, App Router) + Anthropic SDK; Vercel as first deploy target (not yet executed) |
| 004 | Authentication Provider | **Accepted** | Clerk for login/user management; database decision explicitly deferred |
| 005 | Voice Conversation Provider | **Accepted** | ElevenLabs Agents for the real-time voice leg; Claude stays the brain via custom-LLM callback; dashboard-config accepted as non-IaC debt |

**Next ADRs implied by the current state:** persistence/database choice; ADR-002 resolution; (later) prompt versioning/compile step if `generated/` gets used.

---

## Contracts & Specifications

- **Agent spec framework:** `docs/agent-specifications/` — ADS + Executive + Specialist templates, real content, still 🟡 Draft while the first agent already ships against them (drift risk).
- **Implemented agent:** Job Description specialist — definition file + PRD v1 + question bank v1 + intake/output JSON Schemas + 1 golden example. Unevaluated (no evals run); prompt assembled at request time from the product markdown, unversioned.
- **Planned agents (named only):** Competency Model, Interview Kit/Panel Design, Scorecard & Debrief, Screening, AI Head of TA (executive). `docs/pitch-deck-feature-map.md` (2026-07-17) now maps the market-validated feature surface from the original INT² deck onto this catalog — including the four claimed moats (context-based skills definition, red flags + interview continuity, skill-by-skill evidence, final rationale + ask-LLM) and table-stakes parity items.
- **Platform-wide schemas** (`schemas/`): still empty — message envelope, agent-definition schema, eval-result schema not yet needed at n=1.

---

## Readiness Risks (what an architect should know before building on this)

1. **Declarative-products claim unproven at n=2** — orchestrator is hardcoded to one product path; agent #2 will force the generic loader abstraction.
2. **Serverless/fs mismatch on the critical path** — runtime `fs.readFileSync` of `products/**` is untested under Vercel bundling; first deploy may need `outputFileTracingIncludes` or a build-time prompt-compile step.
3. **No persistence layer** while every next feature (history, export, tenants, evals) needs one — deferred decision is compounding.
4. **Quality unmeasured** — the sellable value is output quality; zero evals means every prompt/model change is blind. PRD §8 defines the bar; nothing runs it.
5. **Voice reachability is laptop-bound** (ngrok tunnel + dev server) until deployed; ElevenLabs agent config lives only in their dashboard (not version-controlled).
6. **Brand quarantine one demo from violation** — app is demoable with the internal name visible (ADR-002 open).
7. **Doc-code drift starting** — Draft templates behind a shipped agent, empty Roadmap, 25 placeholder docs, agent definition still instructs file-writing the runtime forbids.

Full technical-debt register (18 items) and sprint plan: `docs/architecture/Platform-Maturity.md`.

---

*Maintenance: regenerate alongside the Platform-Maturity dashboard when the repo's structure or decisions change. If this doc and the repo disagree, the repo wins.*
