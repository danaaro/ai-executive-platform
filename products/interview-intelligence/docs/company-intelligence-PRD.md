# PRD — Company Intelligence Agent (internal)

> STATUS: 🟡 draft — built 2026-09-26; Gate 1 (culture-profile quality review) pending.

**Audience:** Dana and Susan only (Clerk admins). It is never customer-facing.
**Decision record:** `../../../docs/adrs/ADR-009-Company-Intelligence-Agent.md`
**Seed:** `../../../../Company Intelligent Agent/` (BUILD-PLAN.md + company-intel-package)

## Purpose
This is independent research ahead of client work. Given a company, it delivers **one** analyzed document (changed 2026-09-26 from a separate brief and culture profile): a single analyzed **Company Intelligence Report** covering the bottom line, the company at a glance, where it stands now, the last 12 months, culture, gaps between what the company says and what it does, risks, conversation angles, and questions for the client. It includes **key personas** (the 4–6 decision-makers who matter, with background, public focus, why they matter and how to approach them, plus an official photo when one can be matched to their name; otherwise initials are shown), and it is shown as a **visual executive page** with charts, a timeline and persona cards. It can be saved as a PDF or downloaded as one `.md`. The raw research stays behind a collapsed fact-check panel. Its template is `../schemas/company-intel/company-report.md`.

It is not connected to any other agent. Pasting a report into a JD session, or anywhere else, is a manual choice.

## User flow (`/internal/company-intel`)
1. **Company name.** If the company has been researched before, the page shows each module's freshness. Fresh modules are reused. A "refresh everything" option forces a full re-run.
2. **Existing documents.** Upload (PDF, DOCX, MD, TXT) or paste anything the company has already shared: decks, handbooks, Glassdoor exports, meeting notes. You can also skip this step. Documents rank above web sources in trust (see `company-intel-inputs-guide.md`).
3. **Run.** Choose the scope:
   - **Culture only** runs module 05, then writes a culture-focused report.
   - **Full research** runs modules 01–05, then writes the full report.

   A live progress view shows the modules running in parallel. The results show on screen, can be downloaded as `.md` files, and are saved to the database.
4. **Past research.** Open any company to see its latest report, download it, mark it reviewed, or **Re-analyze** it. Re-analyzing rebuilds the report from saved research without new web searches.

## Research modules
Brief files live in `../prompts/company-intel/briefs/`.

| # | Module | Shelf life |
|---|---|---|
| 01 | Identity & ownership | 365 days |
| 02 | Financial health | 90 days |
| 03 | Recent activity (12 months) | 30 days |
| 04 | People & structure | 180 days |
| 05 | Culture & employee voice | 365 days |

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
