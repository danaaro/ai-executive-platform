# Brief 02 — Financial Health
**Shelf life:** 90 days · **Output:** `research/02-financial-health.md`

## Goal
Capture the company's financial situation and direction: growing, stable, or under
pressure. This strongly shapes culture (investment mode vs cost-cutting mode).

## Questions to answer
1. **Revenue:** last 3 fiscal years plus the latest quarter if available. Growth trend.
2. **Profitability:** operating/net margin trend, or profitable / not profitable.
3. **Guidance & outlook:** what management says about the coming year.
4. **Cost actions:** restructurings, layoffs, cost-reduction programs, with dates.
5. **Investment signals:** big bets, R&D emphasis, acquisitions, new markets.
6. **Private companies:** funding rounds (date, amount, investors), valuation if
   reported, revenue estimates only if published by a credible source.
7. **Market signals (public):** share-price trend over 12 months, notable analyst themes.

## Sources, in priority order
1. **Official company website: the source of truth.** `company-website-*.md` in `inputs/`
   (read by the platform today) plus the site's
   live pages: investor relations, results. When it disagrees with
   any other source about the company itself, the website wins; record the conflict.
2. **Documents we uploaded** (other files in `inputs/`)
3. Annual reports, quarterly earnings releases, investor presentations
4. Regulatory filings
5. Reputable financial and business press
Sources from 3 on are found by web search: use them only after 1 and 2, and never over them.

## Module-specific rules
- Every number includes: **period** (FY2025, Q2 2026), **currency**, and source.
- Never calculate or estimate figures yourself. Report only published numbers.
- For private companies, mark third-party figures as "estimate (source)". If nothing
  credible exists, say so. That's a normal result.
