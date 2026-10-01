# Brief 03 — Recent Activity (last 12 months)
**Shelf life:** 30 days · **Output:** `research/03-recent-activity.md`
**Version:** 2

## Goal
Build a dated picture of what the company has done and what has happened to it in the
last 12 months, counted back from today's date.

## What to capture
- Product launches and major releases
- Partnerships, big customer wins or losses
- M&A (acquisitions, divestments)
- Leadership changes (C-suite, board, business-unit heads)
- Restructurings, layoffs, reorganizations, office openings or closures
- Strategic announcements (new strategy, rebrand, AI initiatives, market entries)
- Awards, rankings, controversies, legal or regulatory issues
- Company blog themes: what topics they publish about repeatedly
- Major events: conferences they host or feature at, keynotes

## Output format
1. **Timeline table:** date | event | category | source (newest first, max ~25 rows)
2. **Recurring themes:** 3–6 bullets of patterns visible across events
   (a factual pattern, e.g. "4 AI-related launches in 12 months")

## Company Context questions (added in v2; see the framework §2)
- Extend the window to **24 months** for **pivots, transformations, turnarounds, IPO or exit steps, mergers and integrations**. These are the signals of which chapter the company is in.
- Record every **leadership departure** as well as every arrival, with dates. Turnover at the top is evidence for the talent-philosophy section.
- Each finding keeps the module's normal rule: **[source, date]** on every fact. If a question
  can't be answered from public sources, list it under "Not found". **Never fill it with a guess.**
  Most of these are only partly public, and "not found" is the expected, useful answer.

## Sources, in priority order
1. **Official company website: the source of truth.** `company-website-*.md` in `inputs/`
   (read by the platform today) plus the site's
   live pages: newsroom, press releases, blog. When it disagrees with
   any other source about the company itself, the website wins; record the conflict.
2. **Documents we uploaded** (other files in `inputs/`)
3. Company newsroom / press releases / blog
4. Reputable news and industry media
5. Company LinkedIn page (public posts)
Sources from 3 on are found by web search: use them only after 1 and 2, and never over them.

## Module-specific rules
- Exclude events older than 12 months, except one line of context if essential.
- Deduplicate: one story covered by 10 outlets = one row with the best source.
- Rumors and unconfirmed reports are labeled "reported, unconfirmed".
