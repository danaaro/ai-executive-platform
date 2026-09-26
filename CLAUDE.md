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

## Company Intelligence Agent (internal — ADR-009)
**Internal tool for Dana + Susan (Clerk admins) only — never customer-facing, no link to the JD agent or the board.**

Researches a company and produces a company brief + culture profile.
- UI: `/internal/company-intel` (name → optional documents → run). API: `/api/company-intel/*`. Every route/page checks `requireAdmin()`; the header link renders only for admins.
- Structure: page orchestrates → step 0 reads the company's own site into a dated `company-website-*.md` input → up to 6 parallel `company-researcher` runs (one per brief in `products/interview-intelligence/prompts/company-intel/briefs/`, Sonnet + web_search/web_fetch) → `company-synthesizer` (Opus). Runtime: `src/orchestrator/company-intel.ts`.
- Facts live in `company_research` (sourced, dated). Interpretation lives in `company_outputs` as ONE final report (`kind = report`, template `schemas/company-intel/company-report.md`) — the only thing shown/downloaded; brief/culture rows are pre-report history. The report is structured data (`company_outputs.data`, schema `src/shared/company-report.ts`, delivered via a `save_report` tool call) rendered by `src/components/company-intel/ReportView.tsx`; chart marks use the validated `--chart-mark` token. Uploaded docs in `company_inputs`. These tables are the interim seed of the future CRM company record.
- No review/approval state in the UI (ADR-009 §11). `products/interview-intelligence/evals/company-intel/review-checklist.md` remains the manual quality checklist for tuning prompts.
- Slugs: lowercase, hyphenated, no legal suffix ("Acme Corp Ltd." → `acme`).
- AI cost: `src/shared/ai-cost.ts` (list-price table + pre-run estimate) feeds the results-page cost line; every step stores its usage. Update the price table when Anthropic pricing changes.
- Source order (Dana): official website → uploaded documents → web search; employee voice stays separate evidence for lived culture.
- Non-negotiables (don't edit the prompts' core rules without Dana's approval): no scraping behind logins; no demographic data about employees; stakeholders limited to public professional info; every fact carries source + date; facts vs interpretation stay separate.
