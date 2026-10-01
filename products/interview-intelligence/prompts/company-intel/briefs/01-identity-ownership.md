# Brief 01 — Identity & Ownership
**Shelf life:** 365 days · **Output:** `research/01-identity-ownership.md`
**Version:** 2

## Goal
Establish what this company is, where it came from, who owns it, and where it sits in
its industry.

## Questions to answer
1. **History:** founding year, founders, origin story, major milestones, pivots.
2. **Legal status:** public or private? If public: exchange(s) and ticker.
3. **Group structure:** part of a larger group or holding company? Parent company?
   Major subsidiaries or brands? Recent spin-offs?
4. **Owners & shareholders:**
   - Public: largest shareholders from filings or the investor-relations site
     (institutional holders, founders, insiders), plus the date of that data.
   - Private: founders, investors, private-equity owners, funding stage.
5. **M&A history:** acquisitions made and by whom it was acquired, with dates.
6. **Industry position:** industry, core products/services, main customers or segments,
   main competitors, market position claims (and who makes those claims).

## Company Context questions (added in v2, 2026-10-01; see `docs/company-context-framework.md` §1)
1. **Ownership model:** which of the framework's types fits, with the evidence? The types are founder-owned, family-owned, private institutional, VC-backed, growth-equity-backed, PE-backed, publicly listed, subsidiary of a public company, state-owned, sovereign-wealth-fund-backed, government-controlled strategic, joint venture, consortium, cooperative/member, foundation/trust, employee-owned, or hybrid. Name the hybrid parts.
2. **Ownership concentration:** the stakes held by the largest owners, with an "as of" date.
3. **Board composition:** chair, number of members, independent vs owner-appointed, founder or investor seats.
4. **Shareholder involvement:** board seats, operating partners, shared services, public statements about the plan.
5. **Investment horizon and exit:** deal date, fund vintage if public, IPO or sale talk, labelled "reported, unconfirmed" where applicable.
6. **Return expectations and owner priorities:** what the owner has *said* it wants (growth, EBITDA, cash, dividends, strategic or national interest), quoted with its source.
7. **Governance intensity:** reporting obligations, regulators, listing rules.
8. **Founder and activist influence:** founder still in an executive or board role? Any activist stakes or campaigns?
- Each finding keeps the module's normal rule: **[source, date]** on every fact. If a question
  can't be answered from public sources, list it under "Not found". **Never fill it with a guess.**
  Most of these are only partly public, and "not found" is the expected, useful answer.

## Sources, in priority order
1. **Official company website: the source of truth.** `company-website-*.md` in `inputs/`
   (read by the platform today) plus the site's
   live pages: About, History, Investor Relations. When it disagrees with
   any other source about the company itself, the website wins; record the conflict.
2. **Documents we uploaded** (other files in `inputs/`)
3. Regulatory filings (stock exchange / securities regulator)
4. Reputable press and business media
5. Wikipedia: for leads only; confirm key facts elsewhere
Sources from 3 on are found by web search: use them only after 1 and 2, and never over them.

## Module-specific rules
- Market-position claims made by the company itself are recorded as "company claim".
- Shareholder percentages always come with the "as of" date.
