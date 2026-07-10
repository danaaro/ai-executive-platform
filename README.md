# AI Executive Platform

The single source of truth for the **AI Executive Platform** — a multi-product SaaS by SusanDana Co that sells AI executives and specialist agents to customer companies. First product: **interview-intelligence** (internal name; public brand TBD — ADR-002), an AI-powered hiring transformation whose first sellable agent is the **Job Description agent**.

## What this repository is

- The platform's **business layer** (`docs/company-blueprint/`)
- Its **technical architecture** (`docs/platform-architecture/`)
- The **canonical agent specification** and templates (`docs/agent-specifications/`)
- The **shared runtime** every product runs on (`src/`)
- The **product portfolio** — declarative verticals of agents, prompts, schemas, and evals (`products/`)

## Repository organization

| Path | Holds | Rule |
|---|---|---|
| `docs/` | All non-code knowledge | Docs lead code — nothing is built without its doc |
| `agents/`, `prompts/`, `schemas/` | **Cross-product** scaffolding only | Real sellable agents live per product |
| `src/` | The ONE shared runtime | Products contain no code (ADR-001) |
| `products/<product>/` | One sellable offering: agents, prompts, schemas, docs, examples, evals | Adding a product = adding a folder, zero code duplication |
| `tests/` | Runtime code tests | Agent output quality lives in `products/*/evals/` |
| `generated/` | Machine-generated artifacts | Never hand-edited |
| `scripts/`, `examples/` | Ops scripts, platform demos | — |

## Development workflow

1. **Decide** — significant, hard-to-reverse choices get an ADR in `docs/adrs/` first.
2. **Document** — write/extend the relevant doc (`platform-architecture/`, product PRD).
3. **Specify** — define the agent against `docs/agent-specifications/`; instantiate from `agents/templates/`.
4. **Build** — schema → prompt → agent definition → thin runtime slice → example.
5. **Evaluate** — golden set + rubric in `products/<product>/evals/` before anything is called done.

## Philosophy

**Documentation-first.** The doc is the contract; code implements it. If they diverge, the doc is fixed first.

**Architecture-first.** Structure decisions are made deliberately (ADRs), not accreted. The platform/product split exists so year-3 products drop in without restructuring.

**Products are declarative.** A product is content — agent definitions, prompts, schemas, evals — loaded by the shared runtime. That is what makes the portfolio scale.

## Lineage

This platform grew out of the SusanDana Co planning workspace (parent folder). The parent `foundation/` remains canonical for the JV company; this repo is canonical for the platform. Blueprint placeholders name their exact seed source.
