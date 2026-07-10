# ADR-001 — Repository Structure

Date: 2026-07-11 | Status: **accepted**

## Title
Platform + declarative product verticals repository structure.

## Context
SusanDana Co is building a sellable multi-agent SaaS. Two architectures were on the table:

1. **Flat single-product tree** (original external proposal): `agents/{executives,specialists}`, `prompts/{executives,specialists}` at top level — models exactly one product.
2. **Platform + product verticals**: one shared runtime, each sellable offering a self-contained declarative folder.

Known facts driving the decision:
- The portfolio will hold **multiple products** (hiring transformation first, a training offering already planned, ~5–6 sellable agents in product #1 alone).
- Every product shares the same machinery: orchestration, auth/tenancy, memory, knowledge, evaluation, observability.
- The company's internal-efficiency agents (BizDev engine, facilitators) are a **separate track** and are explicitly excluded from this repo.
- Substantial prior work exists in the parent workspace (`foundation/` 28-section blueprint, product vision doc) and must seed — not duplicate — this repo.

## Decision
Adopt **platform + declarative product verticals**:

1. **One shared runtime** in `src/` (api, orchestrator, memory, knowledge, authentication, evaluation, shared). Products contain **no code**.
2. **`products/<product>/`** = one sellable offering, always the same shape: `README, agents/{executives,specialists}, prompts/, schemas/, docs/, examples/, evals/`.
3. Top-level `agents/` and `prompts/` hold **cross-product scaffolding only** (`templates/`, `shared/`, `system/`). The original proposal's top-level `agents/executives|specialists` and `prompts/executives|specialists` are removed as dead duplicate paths.
4. **Docs placement rule:** product-specific docs (incl. PRDs) → `products/<product>/docs/`; `docs/implementation/` holds platform-level plans + an index only.
5. **Quality vs. tests rule:** `tests/` = runtime code tests; `products/*/evals/` = golden sets + rubrics for agent output quality (replaces per-product `tests/`).
6. **Spec vs. template rule:** `docs/agent-specifications/` is canonical; `agents/templates/` are derived skeletons.
7. **Source-of-truth rule:** this repo is canonical for the platform; the parent `foundation/` stays canonical for the JV company. Blueprint files name their seed source; content is migrated de-branded, never blind-copied.

## Consequences
- Adding product #2 (training) = one new folder in `products/`, zero code duplication, no restructuring.
- The runtime must be built product-agnostic (loads agent definitions/prompts/schemas from product folders) — slightly more upfront design in `src/orchestrator`, paid once.
- Two-level docs (platform vs. product) require the placement rule above to be enforced in review.
- The repo can be `git init`-ed / extracted standalone at any time; it is self-contained (own README, CLAUDE.md, LICENSE, .gitignore).
- Supersedes the flat structure from the original external proposal; all its required files are preserved under the new topology.
