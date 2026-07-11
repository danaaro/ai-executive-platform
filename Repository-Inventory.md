# Repository Inventory

> Descriptive architecture inventory of the **AI Executive Platform** repository.
> Purpose: let an external AI architect review the project structure without reading every file.
> Generated: 2026-07-11 · Repo state: 71 markdown files, 2 root config files (`.gitignore`, `LICENSE`), 23 `.gitkeep` placeholders, **0 source-code files**. Git: `main`, 3 commits, remote `github.com/danaaro/ai-executive-platform` (private).

---

## Repository Overview

The AI Executive Platform is the single source of truth for a multi-product SaaS being built by **SusanDana Co**, a joint venture between Susan Pike-Gubler and Dana Aronovich. The platform sells **AI executives and specialist agents** to customer companies. It is deliberately scoped to the *sellable product* only; the venture's internal-efficiency and company-operations agents are a separate, currently parked track that lives in the parent workspace (`../` — the `SusanDana Co` planning folder) and is intentionally excluded from this repository.

The repository is at the **scaffolding stage**. It contains a complete, deliberately-designed folder topology, a full set of README and placeholder documents that define the purpose and rules of every folder, and the first product's initial specification work. No runtime source code exists yet; nothing has been built in `src/`. This is by design: the project follows a documentation-first, architecture-first methodology in which a folder's contract and an agent's specification exist before any code implements them.

The core architectural decision (recorded in ADR-001) is a **platform + declarative product verticals** structure. A single shared runtime lives in `src/` and is product-agnostic. Each sellable product is a self-contained, mostly-declarative folder under `products/<product>/` containing agent definitions, prompts, schemas, docs, examples, and evals — but no code. Adding a new product is therefore an additive operation (a new folder of the same shape) rather than a structural change, which is what lets the portfolio scale over years without rework.

The **first product** is `products/interview-intelligence/` — an AI-powered hiring-transformation offering. "interview-intelligence" is an internal working name only; the public brand is undecided and quarantined (ADR-002) because the name originates with previous owners. The product's first sellable agent is the **Job Description agent**, a conversational agent that interviews a hiring manager and produces an evidence-based job description plus a reusable structured intake record. That agent's PRD and question bank are the most developed content in the repository.

The company/business layer (mission, vision, business model, etc.) is scaffolded under `docs/company-blueprint/` as placeholders, each pointing to a specific seed source in the parent workspace's 28-section `foundation/` blueprint. These are intended to be migrated and de-branded, not authored from scratch. As of this inventory, that migration has not started — the business docs and technical architecture docs are all placeholders.

---

## Directory Tree

```
ai-executive-platform/
├── README.md
├── CLAUDE.md
├── LICENSE
├── .gitignore
├── Repository-Inventory.md          (this file)
│
├── docs/
│   ├── README.md
│   ├── company-blueprint/           (12 placeholder .md + README)
│   │   ├── Mission.md  Vision.md  NorthStars.md  CorePrinciples.md
│   │   ├── Values.md  Governance.md  BusinessStrategy.md  BusinessModel.md
│   │   ├── StrategicGoals.md  OperatingModel.md  SuccessMetrics.md  DecisionPrinciples.md
│   │   └── README.md
│   ├── builders-handbook/           (6 placeholder .md + README)
│   │   ├── 00-Roadmap.md  01-Mindset.md  02-Claude-Code.md
│   │   ├── 03-GitHub.md  04-First-Agent.md  05-Platform.md
│   │   └── README.md
│   ├── platform-architecture/       (7 placeholder .md + README)
│   │   ├── HighLevelArchitecture.md  Authentication.md  MemoryArchitecture.md
│   │   ├── KnowledgeArchitecture.md  Communication.md  Observability.md  Deployment.md
│   │   └── README.md
│   ├── agent-specifications/        (3 draft templates + README)
│   │   ├── ADS-Template.md  Executive-Template.md  Specialist-Template.md
│   │   └── README.md
│   ├── adrs/
│   │   ├── ADR-001-Repository-Structure.md  ADR-002-Product-Naming.md  README.md
│   ├── implementation/              (README only)
│   └── assets/                      (README + .gitkeep)
│
├── agents/                          (cross-product scaffolding only)
│   ├── README.md
│   ├── templates/                   (README + .gitkeep)
│   └── shared/                      (README + .gitkeep)
│
├── prompts/                         (cross-product only)
│   ├── README.md
│   ├── system/                      (README + .gitkeep)
│   └── shared/                      (README + .gitkeep)
│
├── schemas/                         (README + .gitkeep — platform-wide contracts)
│
├── src/                             (shared runtime — ALL README + .gitkeep, no code)
│   ├── README.md
│   ├── api/  orchestrator/  memory/  knowledge/
│   ├── authentication/  evaluation/  shared/
│
├── products/
│   ├── README.md
│   └── interview-intelligence/
│       ├── README.md
│       ├── agents/
│       │   ├── README.md
│       │   ├── executives/          (README + .gitkeep)
│       │   └── specialists/         (README + .gitkeep)
│       ├── prompts/                 (README + .gitkeep)
│       ├── schemas/                 (README + .gitkeep)
│       ├── docs/
│       │   ├── README.md
│       │   ├── job-description-PRD.md
│       │   └── job-description-question-bank.md
│       ├── examples/                (README + .gitkeep)
│       └── evals/                   (README + .gitkeep)
│
├── tests/                           (README + .gitkeep)
├── generated/                       (README + .gitkeep)
├── scripts/                         (README + .gitkeep)
└── examples/                        (README + .gitkeep)
```

---

## Major Folders

| Folder | Purpose | What belongs there | Status |
|---|---|---|---|
| `docs/` | All non-code knowledge; documentation leads code | Business blueprint, handbook, architecture, agent specs, ADRs, plans, assets | **In Progress** (structure + specs done; most content placeholder) |
| `docs/company-blueprint/` | The SaaS venture's business layer | Mission, vision, model, metrics, governance | **Empty** (12 placeholders, each names a seed source) |
| `docs/builders-handbook/` | Onboarding + build methodology | Roadmap, mindset, tooling, first-agent walkthrough | **Empty** (6 placeholders) |
| `docs/platform-architecture/` | Technical architecture of the shared platform | One file per concern (auth, memory, knowledge, comms, observability, deployment) | **Empty** (7 placeholders) |
| `docs/agent-specifications/` | Canonical definition of what an agent is | ADS spec + executive/specialist templates | **In Progress** (drafted with real content) |
| `docs/adrs/` | Architecture Decision Records | One numbered file per hard-to-reverse decision | **In Progress** (2 ADRs written) |
| `docs/implementation/` | Platform-level implementation plans | Plans + index to product PRDs | **Empty** (README only) |
| `docs/assets/` | Diagrams, source docs, glossary, brand assets | Non-doc reference material | **Empty** |
| `agents/` | Cross-product agent scaffolding **only** | `templates/` (skeletons), `shared/` (reused behaviours) | **Empty** |
| `prompts/` | Cross-product prompts **only** | `system/` (guardrails/persona), `shared/` (fragments) | **Empty** |
| `schemas/` | Platform-wide data contracts | Agent-definition schema, message envelope, eval-result schema | **Empty** |
| `src/` | The one shared runtime; products contain no code | api, orchestrator, memory, knowledge, authentication, evaluation, shared | **Empty** (skeleton dirs only) |
| `products/` | The portfolio; one folder per sellable product | Declarative product verticals | **In Progress** (1 product) |
| `products/interview-intelligence/` | First product — hiring transformation | Agents, prompts, schemas, docs, examples, evals | **In Progress** (PRD + question bank; no agents built) |
| `tests/` | Tests for runtime code in `src/` | Unit + integration tests (not agent-output quality) | **Empty** |
| `generated/` | Machine-generated artifacts | Compiled prompts, generated reports (git-ignored contents) | **Empty** |
| `scripts/` | Operational/build scripts | Setup, prompt compilation, eval runners | **Empty** |
| `examples/` | Platform-level runnable examples | API/orchestration demos | **Empty** |

---

## Markdown Documents

**Substantive documents** (authored content) are listed individually. **Boilerplate** — 46 folder `README.md` files and 28 placeholder stubs (see note below) — is summarized in grouped rows to keep this table architect-readable, per the "review without reading every file" intent.

| File | Purpose | Status | Short Summary |
|---|---|---|---|
| `README.md` | Repo front door | Complete | Purpose, org table, dev workflow, docs-first/architecture-first philosophy, lineage from parent workspace |
| `CLAUDE.md` | Build rules for AI sessions | Complete | Structure rules, docs-lead-code, ADR discipline, naming quarantine, current focus |
| `LICENSE` | Legal | Complete | Proprietary / all rights reserved (SusanDana Co) |
| `docs/adrs/ADR-001-Repository-Structure.md` | Records the topology decision | Accepted | Platform + declarative product verticals; 7 structural rulings; supersedes flat proposal |
| `docs/adrs/ADR-002-Product-Naming.md` | Records naming constraint | Proposed | interview-intelligence internal-only; public brand TBD; no "INT²" in customer artifacts |
| `docs/agent-specifications/ADS-Template.md` | Canonical agent spec | Draft | Required fields for any agent; file format; per-agent definition-of-done |
| `docs/agent-specifications/Executive-Template.md` | Executive-agent spec | Draft | Function owned, specialists orchestrated, escalation, persona, client-memory scope |
| `docs/agent-specifications/Specialist-Template.md` | Specialist-agent spec | Draft | One task + hard I/O contract; no-invention; failure behaviour; standalone-runnable |
| `products/interview-intelligence/README.md` | Product overview | In Progress | Product intent, planned ~5–6 agent catalog, layout, per-agent DoD, vision-doc = reference-only |
| `products/interview-intelligence/docs/job-description-PRD.md` | JD agent contract | Draft v1 | Interaction model, inputs, dual outputs (JD file + intake record), guardrails, eval bar, phasing |
| `products/interview-intelligence/docs/job-description-question-bank.md` | JD interview questions | v1 | Themes A–I, branch logic, public/internal tags, manual-entry blocks, changelog |
| `docs/company-blueprint/*.md` (12 files) | Business layer | **Placeholder** | Mission, Vision, NorthStars, CorePrinciples, Values, Governance, BusinessStrategy, BusinessModel, StrategicGoals, OperatingModel, SuccessMetrics, DecisionPrinciples — each names a `foundation/` seed source |
| `docs/builders-handbook/*.md` (6 files) | Build methodology | **Placeholder** | 00-Roadmap … 05-Platform |
| `docs/platform-architecture/*.md` (7 files) | Technical architecture | **Placeholder** | HighLevelArchitecture, Authentication, MemoryArchitecture, KnowledgeArchitecture, Communication, Observability, Deployment |
| Folder `README.md` files (46) | Per-folder purpose + boundary rules | Complete | Each explains what belongs in its folder and the rules enforcing the platform/product split |

> **Placeholder note:** placeholder stubs carry a `> STATUS: 🔴 PLACEHOLDER` header, a one-line purpose, and (for blueprint/architecture files) an explicit seed-source pointer into the parent workspace. They contain no real content yet.

---

## Agent Specifications

No agents are implemented yet. The specification framework exists; the first agent is specified but not built.

| Name | Role | Current maturity | Files |
|---|---|---|---|
| **Job Description agent** | Specialist (product: interview-intelligence). Conversational intake of a hiring manager → evidence-based JD file + structured intake record | **Specified (PRD v1), not built.** No definition file, prompt, or schema yet | `products/interview-intelligence/docs/job-description-PRD.md`, `products/interview-intelligence/docs/job-description-question-bank.md` |
| *(planned)* Competency Model, Interview Kit / Panel Design, Scorecard & Debrief, Screening | Specialists | **Named only** (in product README catalog) | — |
| *(planned)* AI Head of Talent Acquisition | Executive persona | **Named only** | — |

**Specification templates** (the contract agents are defined against, not agents themselves): `docs/agent-specifications/ADS-Template.md` (base), `Executive-Template.md`, `Specialist-Template.md` — all **Draft**.

---

## Prompt Inventory

**No prompts exist yet.** The prompt folders are scaffolded and empty (`.gitkeep` only):

- `prompts/system/` — platform-level system prompts (guardrails, safety, baseline persona) — *empty*
- `prompts/shared/` — reusable cross-product prompt fragments — *empty*
- `products/interview-intelligence/prompts/` — product/agent-specific prompts (JD agent prompt will land here) — *empty*

Intended versioning approach (from README/CLAUDE rules): prompts treated as versioned artifacts using a base-template + injection model (seed concept in parent workspace `foundation/26`).

---

## Schemas

**No schemas exist yet.** Two schema locations are scaffolded and empty:

- `schemas/` (platform-wide) — intended for the agent-definition schema, inter-agent message envelope, and evaluation-result schema — *empty*
- `products/interview-intelligence/schemas/` — product I/O contracts — *empty*

Planned (per JD PRD): `job-description.intake.schema.json` (the structured Role Intake Record) and a JD output schema.

---

## Source Code

**No source code exists.** `src/` contains only skeleton directories (`README.md` + `.gitkeep` each), intended to hold the one shared, product-agnostic runtime:

| Module | Intended responsibility | Status |
|---|---|---|
| `src/api` | Public API surface (endpoints, request/response, versioning) | Empty |
| `src/orchestrator` | Agent/workflow execution; loads product agent definitions + prompts | Empty |
| `src/memory` | Memory tiers (company/operational/knowledge/learning), per-tenant | Empty |
| `src/knowledge` | Knowledge base + retrieval/grounding | Empty |
| `src/authentication` | Identity, multi-tenancy, API keys, authorization | Empty |
| `src/evaluation` | Eval harness; runs `products/*/evals/` golden sets against rubrics | Empty |
| `src/shared` | Shared utilities/types across the runtime | Empty |

Design intent (ADR-001): the runtime is built product-agnostic and kept a thin skeleton until the first agent slice requires it — no speculative infrastructure.

---

## Architecture Decisions

| ADR | Title | Status | Essence |
|---|---|---|---|
| ADR-001 | Repository Structure | **Accepted** | Platform + declarative product verticals. Shared runtime in `src/`; products are code-free declarative folders. Includes 7 rulings: no new top-level folders; product docs live under `products/*/docs/`; `tests/`=code vs `products/*/evals/`=agent quality; agent-spec is canonical over templates; parent `foundation/` stays canonical for the company while this repo is canonical for the platform |
| ADR-002 | Product Naming & Branding | **Proposed** | `interview-intelligence` is an internal name only; public brand undecided; "INT²"/"Interview Intelligence" barred from customer-facing artifacts until cleared |

Additional implicit decisions documented in `README.md` / `CLAUDE.md`: documentation-first and architecture-first working models; live-voice for the JD agent deferred to Phase 2 (in JD PRD); dual-output design for the JD agent (JD file + reusable intake record).

---

## Current Progress

**Completed**
- Repository topology and the platform/product-vertical architecture (ADR-001)
- Root contracts: README, CLAUDE.md, LICENSE, .gitignore
- Per-folder README contracts for every folder (purpose + boundary rules)
- Agent-specification framework (ADS + executive + specialist templates, draft)
- Two ADRs; git initialized and pushed to a private remote

**Partially complete**
- First product (`interview-intelligence`): PRD v1 and question bank v1 for the Job Description agent; product catalog named; no agents/prompts/schemas built
- Agent-specification templates exist but are marked Draft (not finalized)

**Does not exist yet**
- Any source code (`src/` entirely empty)
- Any prompt, schema, agent definition file, example, or eval
- Company-blueprint content (12 placeholders) and platform-architecture content (7 placeholders)
- Builders-handbook content (6 placeholders)
- The migration/de-branding of the reference vision doc into product docs
- Any test, script, generated artifact, or dependency manifest

---

## Technical Stack

The repository is currently **documentation-only**; no application technology has been committed.

- **Content format:** Markdown (all substantive content), with JSON Schema planned for contracts
- **Version control:** Git; remote on GitHub (private), SSH auth
- **Build/authoring tool:** Claude Code (per `CLAUDE.md` conventions)
- **Language / framework / runtime:** **not yet chosen** — no `package.json`, `pyproject.toml`, or equivalent manifest exists
- **Planned model tier (from parent-workspace context, not yet wired):** Claude models for agent reasoning

Any implication of a specific framework elsewhere is aspirational; nothing is installed or configured.

---

## Known Technical Debt

Given the pre-code stage, "debt" here is mostly deferred work and structural risks to watch, not accumulated cruft.

- **High placeholder-to-content ratio:** 28 placeholder stubs (12 blueprint + 7 architecture + 6 handbook + 3 template files partially) carry no real content; the repo currently documents intent more than substance.
- **23 `.gitkeep` files** hold empty directories in git — normal for scaffolding, to be removed as folders gain real files.
- **Vision-doc migration debt:** the source hiring-transformation vision (parent workspace) is explicitly reference-only and must be rewritten/de-branded into product docs; nothing migrated yet.
- **Unresolved naming (ADR-002):** the product folder name is a placeholder for an undecided brand; a future decision may require a rename and de-branding sweep.
- **Two schema locations** (`schemas/` vs `products/*/schemas/`): the split is documented, but with no schemas yet the boundary is untested and could be misapplied.
- **Agent-spec templates are Draft** while the first agent (JD) is already being specified — risk that the JD agent gets defined before its spec is finalized, requiring rework.
- **No dependency/runtime decision** — the biggest open architectural gap; `src/` cannot begin until a stack is chosen.
- **No CI, no tests, no eval harness** wired — expected at this stage, listed for completeness.

Explicit TODOs live in the parent workspace `../TODO.md` (section F tracks this platform); this repo does not yet carry its own issue tracker.

---

## Recommendations

*Descriptive only — no changes implied.*

1. **Choose the runtime stack next.** The single highest-leverage unblock: nothing in `src/` can start until a language/framework is decided. This is the natural next ADR (ADR-003).
2. **Finalize the agent-spec templates before defining the JD agent** to avoid rework, since JD specification is already underway.
3. **Author the JD agent's schemas early** (intake record + output). The intake record is the durable artifact downstream agents depend on; locking its shape first de-risks the whole product line.
4. **Prioritize a minimal vertical slice over broad doc-filling.** One working JD agent (definition + prompt + schema + one example + one eval) would validate the platform/product split in practice; the 25 placeholder docs can fill in behind it.
5. **Consider a lightweight per-repo tracker or issue list.** Progress currently lives in the parent `TODO.md`; as the repo becomes standalone, an in-repo tracker would keep the platform's status self-contained.
6. **Add a top-level architecture diagram** in `docs/assets/` once the runtime stack is chosen — the request-flow through orchestrator → product agents is currently described only in prose.
7. **Resolve ADR-002 before any customer-facing artifact** (demo, deck, generated JD) is produced, to avoid brand rework and IP exposure.
8. **Define the promotion path for the parked internal-agent track** so the boundary between product and internal agents stays clean when that track is un-parked.
