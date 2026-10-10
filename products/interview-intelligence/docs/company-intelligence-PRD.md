# PRD — Company Intelligence Agent (internal)

> STATUS: 🟡 draft — v3 (Exec10X cockpit) 2026-10-09; v1 built 2026-09-26.

**Audience:** Dana and Susan only (Clerk admins). It is never customer-facing.
**Decision record:** `../../../docs/adrs/ADR-009-Company-Intelligence-Agent.md`
**Seed:** Susan's originals in `../../../../input/company-intel/`; the original BUILD-PLAN.md + company-intel-package are archived (fully migrated) in `../../../../_archive/2026-10-10-cleanup/zombies/`

## Purpose
**v3 (2026-10-09) — current.** The report is Susan's **Exec10X Company Intelligence Cockpit** (`../prompts/company-intel/exec10x-master-prompt.md`). It answers one question: what does it take for an executive to succeed at this company, under these conditions? It has three tabs:
1. **Executive Dashboard:** snapshot, business & strategy, organisation & decision rights, a culture map across the relevant national cultures, transformation, competitors, the Executive Success Environment, and intelligence confidence.
2. **Contextual Skills:** 5–6 ranked capabilities. Each has behavioural markers, evidence to look for, red flags and an interview question.
3. **Questions to ask:** the 10–12 priority validation questions, then every open point (Unknown, Hypothesis, Partner input, or a claim whose source couldn't be traced), grouped by section.

It is written from the **saved research**; the writing step does no web search. Persona photos are not part of v3. See ADR-009 §18. The v1/v2 description below is kept for history.

This is independent research ahead of client work. Given a company, it delivers **one** analyzed document (changed 2026-09-26 from a separate brief and culture profile): a single analyzed **Company Intelligence Report** covering the bottom line, the company at a glance, where it stands now, the last 12 months, culture, gaps between what the company says and what it does, risks, conversation angles, and questions for the client. It includes **key personas** (the 4–6 decision-makers who matter, with background, public focus, why they matter and how to approach them, plus an official photo when one can be matched to their name; otherwise initials are shown), and it is shown as a **visual executive page** with charts, a timeline and persona cards. The company's logo appears next to its name in the report header and in the past-research list. It can be saved as a PDF or downloaded as one `.md`. The raw research stays behind a collapsed fact-check panel. Its template is `../schemas/company-intel/company-report.md`.

It is not connected to any other agent. Pasting a report into a JD session, or anywhere else, is a manual choice.

## User flow (`/internal/company-intel`)
1. **Company name.** If the company has been researched before, the page shows each research area's date and freshness. **Saved research is always reused.** Only areas never researched run automatically. Tick **Refresh** on any area you know has changed or was missing. With nothing ticked, **Rewrite report only** rebuilds the report from saved research (about $1.20).
2. **Existing documents.** Upload (PDF, DOCX, MD, TXT) or paste anything the company has already shared: decks, handbooks, Glassdoor exports, meeting notes. You can also skip this step. Documents rank above web sources in trust (see `company-intel-inputs-guide.md`).
3. **Run.** Choose the scope:
   - **Culture only** runs module 05, then writes a culture-focused report.
   - **Full research** runs modules 01–05, then writes the full report.

   A live progress view shows the modules running in parallel. The results show on screen, can be downloaded as `.md` files, and are saved to the database.
4. **Past research.** Open any company to see its latest report, save it as a PDF, or download it. **Update research** goes back through documents and Run. Fresh research is reused, and anything the report lacks, such as the current format or photos, is rebuilt without new web searches.

## Research modules
Brief files live in `../prompts/company-intel/briefs/`.

| # | Module | Shelf life |
|---|---|---|
| 01 | Identity & ownership | 365 days |
| 02 | Financial health | 90 days |
| 03 | Recent activity (12 months) | 30 days |
| 04 | People & structure | 180 days |
| 05 | Culture & employee voice | 365 days |
| 06 | Group & portfolio (parent, major companies and their leaders) | 180 days |
| 07 | Business model & strategy (v2) | 90 days |
| 08 | Performance, talent & external ecosystem (v2) | 180 days |

**v2 (2026-10-01):** the report answers the **Company Context framework** (`company-context-framework.md`): 15 categories, each answer Found, Inferred or Unknown. Unknowns go to **Include these questions in your interview**. The page is grouped by category. See ADR-009 §17.

Before the modules run, the platform reads the company's own website (team, companies, about, news, careers) and gives it to every module as a primary source dated that day.

## Non-negotiables (from the package; not to be changed without Dana's approval)
- Every fact carries a source and a date. "Not found" is a valid result, and gaps are never filled with guesses.
- Facts (research modules) and interpretation (the report) are kept separate.
- No demographic data about employees, even when a source displays it.
- Stakeholders: public professional information only.
- No logged-in scraping. Deeper material, such as Glassdoor reviews, comes only from documents we upload.
- Culture traits are observable behaviors, never personality types or demographic proxies.

## Phases (adapted from BUILD-PLAN.md)
- **Phase 0, Setup:** ✅ built.
- **Phase 1, Culture MVP:** run "Culture only" on 2 test companies (one large public company Dana knows from the inside, one small private company). Review both with `../evals/company-intel/review-checklist.md`, then tune brief 05, the template, or the synthesizer. 🛑 Gate 1: do not move on until the profiles are genuinely useful.
- **Phase 2, Remaining modules:** run "Full research" on the same 2 companies and check coverage, gaps, and how "not found" is handled. 🛑 Gate 2.
- **Phase 3, Cache:**
  1. Run a third company from scratch.
  2. Re-run company 1: every module should show fresh and nothing should re-run.
  3. Run with "refresh everything".
  4. Test staleness by backdating module 03.
  5. Report run time and cost. 🛑 Gate 3.

## Non-goals
Connection to the JD agent or the pipeline board · CRM features · reviewer subagent · department-level profiles · paid company-data APIs · scheduled refreshes · automated LLM-as-judge evals.
