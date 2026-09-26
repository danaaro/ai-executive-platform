# PRD — Company Intelligence Agent (internal)

> STATUS: 🟡 draft — built 2026-09-26; Gate 1 (culture-profile quality review) pending.

**Audience:** Dana and Susan only (Clerk admins). It is never customer-facing.
**Decision record:** `../../../docs/adrs/ADR-009-Company-Intelligence-Agent.md`
**Seed:** `../../../../Company Intelligent Agent/` (BUILD-PLAN.md + company-intel-package)

## Purpose
This is independent research ahead of client work. Given a company, it produces:
- **Company brief:** a one-page factual picture covering ownership, finances, the last 12 months, leadership, and implications for hiring.
- **Culture profile:** the company's "X-ness". It covers who thrives there, who struggles, where a new hire could add to the culture, six trade-off dimensions with interview probes, and open questions.

It is not connected to any other agent. Pasting a profile into a JD session, or anywhere else, is a manual choice.

## User flow (`/internal/company-intel`)
1. **Company name.** If the company has been researched before, the page shows each module's freshness. Fresh modules are reused. A "refresh everything" option forces a full re-run.
2. **Existing documents.** Upload (PDF, DOCX, MD, TXT) or paste anything the company has already shared: decks, handbooks, Glassdoor exports, meeting notes. You can also skip this step. Documents rank above web sources in trust (see `company-intel-inputs-guide.md`).
3. **Run.** Choose the scope:
   - **Culture only** runs module 05, then writes the culture profile.
   - **Full research** runs modules 01–05, then writes the brief and the profile.

   A live progress view shows the modules running in parallel. The results show on screen, can be downloaded as `.md` files, and are saved to the database.
4. **Past research.** Open any company to see its latest outputs, download them, or mark them reviewed.

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
- Facts (research modules) and interpretation (brief and profile) are kept separate.
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
