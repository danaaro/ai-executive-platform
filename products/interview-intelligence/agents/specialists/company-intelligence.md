---
name: company-intelligence-agent
description: INTERNAL ONLY (admins: Dana + Susan). Researches one company across 5 modules in parallel and synthesizes a company brief and a culture profile. Independent research tool, not part of the hiring pipeline.
---

## Agent definition (per `../../../../docs/agent-specifications/Specialist-Template.md`)

- **Name / id:** company-intelligence-agent (researcher `company-researcher` + synthesizer `company-synthesizer`)
- **Role type:** specialist pair, **internal-only**. Not in `AGENT_REGISTRY`, not on the board, never shown to customers (ADR-009).
- **Task contract:** given a company name and optional uploaded documents:
  1. Research up to 5 modules, producing factual, sourced, dated research files.
  2. Synthesize them into `company-brief` (full mode) and `culture-profile`.
- **Non-goals:** job descriptions, candidate evaluation, CRM features, feeding any other agent automatically.
- **Operative prompts:**
  - `../../prompts/company-intel/company-researcher.md`, with the module brief from `../../prompts/company-intel/briefs/`
  - `../../prompts/company-intel/company-synthesizer.md`
- **Output shapes:** `../../schemas/company-intel/research-module.md`, `company-brief.md`, `culture-profile.md`
- **Models:** researcher `claude-sonnet-5` with `web_search` + `web_fetch` server tools; synthesizer `claude-opus-5-5` with no tools.
- **Runtime:** `src/orchestrator/company-intel.ts`; API `src/app/api/company-intel/*`; UI `src/app/internal/company-intel/`.
- **Persistence:** `companies`, `company_inputs`, `company_research` (one row per run; latest wins), `company_outputs` (versioned). These are interim CRM-ready tables (ADR-009 §3).
- **Authority level:** produce-only. Output is a draft until a human marks it **reviewed**. Nothing depends on that flag.
- **Quality bar:** `../../evals/company-intel/review-checklist.md` (manual): accuracy, usefulness (competitor test, surprise test), honesty, and fairness (hard stop).
- **Failure behavior:** a missing fact is written as "not found". A failed module is reported, and the synthesizer marks the gap. Never guess.
- **Guardrails:** demographic exclusion, stakeholder privacy, source + date on every fact, facts vs interpretation, no logged-in scraping. These are embedded in the prompts and must not be changed without Dana's approval.

## Changelog
- **v1.2 (2026-09-26):** report delivered as structured data via a `save_report` tool (`src/shared/company-report.ts`) and rendered as a visual page. Adds key personas (public professional information only). Culture scale poles are stated explicitly in the schema after a run inverted one.
- **v1.1 (2026-09-26):** synthesis now outputs ONE final report (`schemas/company-intel/company-report.md`) instead of a brief plus a profile. The synthesizer rules are unchanged.
- **v1 (2026-09-26):** imported from the company-intel build package. The runtime moved from local Claude Code to SusieBrain (ADR-009). JD coupling was dropped, and `approved` was replaced with `reviewed`.
