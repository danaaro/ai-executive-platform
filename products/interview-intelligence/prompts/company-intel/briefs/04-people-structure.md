# Brief 04 — People & Structure
**Shelf life:** 180 days · **Output:** `research/04-people-structure.md`
**Version:** 2

## Goal
Understand how the company is organized, where its people are, and who leads it.

## Questions to answer
1. **Headcount:** total employees and trend (growing / shrinking), with dates.
2. **Geographic distribution:** HQ, main offices, R&D and delivery centers, countries of
   operation, and where the largest employee populations are (if published).
3. **Org design:** business units or divisions, and whether it's organized by product,
   region, function, or customer. Any recent reorganizations.
4. **Team structure signals:** from job postings and announcements. Which functions are
   hiring, in which locations, and at what seniority? Remote/hybrid/office policy if published.
5. **Key stakeholders:** up to ~10 people: CEO, C-suite, board chair, and leaders of the
   business units most relevant to hiring. For each: name, role, time in role, prior
   background (from official bio), and 1–2 notable public statements or themes they
   speak about (with source).

## Company Context questions (added in v2; see the framework §5–8, §10, §13)
1. **Structural archetype as stated or evidenced:** functional, divisional, geographic, product-led, customer-led, business units, holding company, federation, matrix, platform, or hybrid.
2. **Hierarchy as published:** shareholders → board → group CEO → group functions → business units or regions → countries.
3. **Centralisation signals by area:** strategy, budget, P&L, pricing, product, technology, sales, marketing, brand, hiring, compensation, senior hiring, CapEx, M&A, partnerships. Only record explicit evidence, for example "group-wide shared platform", "country MDs run their own P&L" or "central procurement". **Do not score; just record the evidence.**
4. **Decision signals:** who announces or signs big decisions (CEO, board, owner, regional heads). Any stated governance, such as an investment committee or regional approval.
5. **Founder / chair / long-tenure roles,** and any founder confidants named publicly in senior roles.
6. **For each executive on the leadership team:** where they came from (previous employers and their type: founder-led, PE-backed, public, corporate), and their tenure. Note leaders who left within about 18 months of joining.
7. **Management-style statements by leaders:** public quotes about how they lead or decide.
- Each finding keeps the module's normal rule: **[source, date]** on every fact. If a question
  can't be answered from public sources, list it under "Not found". **Never fill it with a guess.**
  Most of these are only partly public, and "not found" is the expected, useful answer.

## Sources, in priority order
1. **Official company website: the source of truth.** `company-website-*.md` in `inputs/`
   (read by the platform today) plus the site's
   live pages: leadership/team, locations, careers. When it disagrees with
   any other source about the company itself, the website wins; record the conflict.
2. **Documents we uploaded** (other files in `inputs/`)
3. Annual report / filings (headcount, geography, segments)
4. Company LinkedIn page (public About section only)
5. Current job postings (company careers site first)
6. Press interviews, conference talks, podcasts featuring leaders
Sources from 3 on are found by web search: use them only after 1 and 2, and never over them.

## Module-specific rules
- **Stakeholders: public professional info ONLY.** No private life, family, health,
  personal social media, home location, or anything gathered by combining scattered
  personal details.
- Do not attempt to list or profile ordinary employees.
- LinkedIn people lists require login, so don't try. Note the limitation if relevant.
- **Current roles need a current, credible source (added 2026-09-26).** The company's own
  leadership/team page (included in `inputs/` as `company-website-*.md` when it could be
  read) is the authority on who holds a role today. Org-chart and data aggregators (The Org,
  ZoomInfo, RocketReach, LeadIQ, Crunchbase people, commercial-register signatory lists) are
  leads only: a role found only there is written as "unconfirmed (aggregator only, <date>)",
  never as current. Press coverage counts when dated within the last 12 months. If the
  official page and another source disagree, the official page wins; record the conflict.
  (Why: an Aviv Group run named a 2023 register signatory as current Chief People Officer
  when the official team page listed someone else.)
