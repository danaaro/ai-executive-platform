# CLAUDE.md — AI Executive Platform

Build rules for working in this repository. These override defaults.

## What this repo is
The multi-product SaaS platform SusanDana Co sells to customers. NOT the internal company-OS agents — those live in the parent workspace and are a separate, parked track. Never mix the two.

## Structure rules (ADR-001 — read it before changing structure)
- **Do not create new top-level folders.** The tree is fixed; if something has no home, that's an ADR discussion, not an ad-hoc folder.
- **Products are declarative.** All code goes in `src/` (one shared runtime). `products/<product>/` holds only agents, prompts, schemas, docs, examples, evals.
- **Product docs (incl. PRDs) live in `products/<product>/docs/`** — never in `docs/implementation/`.
- **`tests/` = code tests. `products/*/evals/` = agent output quality.** Don't conflate them.
- **Canonical agent spec = `docs/agent-specifications/`.** `agents/templates/` are skeletons derived from it; when they disagree, fix the spec first, regenerate the skeleton.
- **`generated/` is machine-written only.** Never hand-edit anything in it.

## Working rules
- **Docs lead code.** Before building anything in `src/` or `products/`, its doc/PRD must exist. If asked to build without one, write the doc first.
- **ADR discipline.** Hard-to-reverse decisions get `docs/adrs/ADR-NNN-<slug>.md` (Title/Status/Context/Decision/Consequences) before implementation.
- **Placeholder status headers.** Docs carry `> STATUS:` lines (🔴 placeholder / 🟡 draft / 🟢 ready). Update the status when you touch the file; remove the placeholder line only when content is real.
- **Seed sources.** Blueprint files name their seed in the parent workspace (`../foundation/`, `../context/`). Migrating content = de-brand + adapt to platform scope, never blind-copy.
- **Naming:** "interview-intelligence" is an internal product/domain name only. The public brand is undecided (ADR-002) — do not use "INT²" or "Interview Intelligence" as a customer-facing brand in any artifact.

## Current focus
First vertical slice: the **Job Description agent** in `products/interview-intelligence/` — PRD → schemas → prompt → agent definition → thin `src/` slice → examples → evals. See `docs/builders-handbook/00-Roadmap.md`.
