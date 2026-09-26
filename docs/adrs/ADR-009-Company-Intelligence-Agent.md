# ADR-009 — Company Intelligence Agent (internal research tool)

Date: 2026-09-26 | Status: **accepted** (Dana, 2026-09-26)

## Title
Run the Company Intelligence agent inside SusieBrain as an **internal, admin-only** research tool, with no link to the customer-facing agents, and keep its results in four interim tables that the future CRM will absorb.

## Context
Dana and Susan need a repeatable way to research a company before client conversations. They need a factual brief, plus a culture profile that defines who thrives at the company (its "X-ness", in the way Google talks about "Googleyness"). A build package was designed for this (`../Company Intelligent Agent/company-intel-package/`, including its own architecture ADR). It assumed a **local Claude Code workflow**: a `/research-company` slash command, subagents, and a git-ignored `companies/` folder on one laptop.

That design doesn't fit how the tool will be used:
- **Both partners use it, each with their own login.** A local folder on Dana's machine is invisible to Susan.
- **It must never be visible to customers.** SusieBrain already has the right boundary: Clerk `publicMetadata.role === "admin"` (ADR-006), held by exactly Dana and Susan.
- **It is independent research.** It is not a step in the hiring pipeline. The package wired it into the JD agent, and that coupling is not wanted. Whether a profile is ever pasted into a JD session is a manual choice.
- **The results are CRM data.** A CRM is planned but is not part of the MVP. The results need a home now that becomes the CRM's company record later, without a migration of meaning.

## Decision
The package's research design is kept **unchanged in substance**:
- 5 research modules, driven by brief files, run in parallel.
- A single generic researcher prompt plus a synthesizer prompt.
- Facts (dated and sourced) are kept separate from interpretation.
- Each module has its own shelf life.
- The core rules stay: no demographic data, stakeholders limited to public professional information, no logged-in scraping, and every fact carries a source and a date.
- Research runs on Sonnet; synthesis runs on Opus.

The runtime is adapted as follows:

1. **Internal-only surface.** The UI lives at `/internal/company-intel` and the API at `/api/company-intel/*`. The header link renders only for admins, so customers have no path to the tool. Every route and page also checks the admin role server-side, as a security guard rather than a UX feature.
2. **No coupling to other agents.** The tool is not in `AGENT_REGISTRY`, not on the pipeline board, has no `dependsOn`, and injects nothing into other agents. Package Phase 4 (JD integration) is dropped. The `status: approved` gate becomes a plain **reviewed** marker that nothing depends on.
3. **Interim storage in four tables**: `companies`, `company_inputs`, `company_research`, and `company_outputs`. These are deliberately the seed of the future CRM company entity: `companies` is the record the CRM will extend. They replace the package's files and its `.gitignore` confidentiality rule. Client material now sits in Supabase behind RLS (anon and authenticated roles revoked, same as every table) and never touches git.
4. **Server-side web research.** The researcher calls Anthropic's `web_search` and `web_fetch` server tools, which replace Claude Code's WebSearch and WebFetch. Uploaded documents (`company_inputs`) are inlined into every module's prompt as the highest-trust source. This replaces "read `inputs/`".
5. **One HTTP request per module.** Each module and the synthesis get their own request with `maxDuration = 300`, streamed with heartbeats (`agentStreamResponse`). Five web-research runs plus an Opus synthesis would not fit in one function budget. The browser page is the orchestrator: it launches the stale or missing modules in parallel, then triggers synthesis. This is the same logic as the package's slash command, moved to the client.
7. **One final report is the deliverable (amended by Dana, 2026-09-26).** The synthesizer's rules load unchanged, but its output is redirected from two long documents (a company brief plus a culture profile) into a single analyzed **Company Intelligence Report** (`schemas/company-intel/company-report.md`, about 900–1,400 words). The report has no inline evidence arrows. The report is the only thing shown and downloaded. The research files stay in the database as the sourced, dated evidence record and cache, and appear only in a collapsed panel for fact-checking. Older brief and profile rows remain as history.
8. **The report is structured data, rendered as a visual executive page (Dana, 2026-09-26).** The synthesizer delivers the report as the arguments of a `save_report` tool call. Its schema is `src/shared/company-report.ts`. Structured outputs was tried first but rejected the schema ("compiled grammar is too large"). The data is stored in `company_outputs.data`. `ReportView` renders it with a hero, key figures, timeline, **key personas** (public professional information only), a culture-DNA spectrum chart, an employee-sentiment chart, say-vs-do comparisons, severity-labeled risks and a coverage strip, plus Save as PDF. The Markdown download is serialized from the same data. Chart colors were validated with the dataviz palette checker: single-series `--chart-mark`, #a87a2e light and #b88d42 dark.
9. **Persona photos, with precision over recall (Dana, 2026-09-26).** Photos are added after the report in a separate request (`orchestrator/persona-photos.ts`):
   - Sonnet with web search only *proposes* public pages (company leadership pages, appointment press releases, speaker pages, Wikipedia). LinkedIn, social media, contact-data sites and anything behind a login are excluded.
   - The server accepts an image only if its alt or title text contains the person's full name, or its file name contains both their first and last name.
   - Fallback: a Wikimedia Commons image, taken only when the Wikidata entry ties the person to the company.
   - Otherwise the card shows initials. Only the image URL is stored. A wrong face is treated as worse than none.
10. **Company logo on the company record (Dana, 2026-09-26).** The logo is stored in `companies.logo_url`, a CRM-ready field that belongs to the company rather than to one report. `orchestrator/company-logo.ts` reads the company's own homepage deterministically and takes, in order:
    1. The JSON-LD Organization logo.
    2. A "logo" image in the header, nav or homepage link, or one whose file name or label names the company. Body logo grids, which show brands, clients or partners, are excluded.
    3. The apple-touch-icon.
    4. The largest favicon.
    5. If the site blocks automated reads, Google's favicon service.

    White or reversed logo variants are ranked last because the tile is white. The website is filled in from the research when it was never entered. The lookup runs after each report and in the photo step, and it never fails a run.
11. **One flow, no manual review state (Dana, 2026-09-26).** "Mark reviewed" was removed: it was the package's approval gate for the JD agent, and with that coupling gone it did nothing. The DB columns stay unused for the CRM. The standalone "Re-analyze" and "Find persona photos" buttons were also removed. A run now detects what the current report format lacks, such as an old-format report or missing photos, and rebuilds it from saved research that is still fresh, without new web searches. "Update research" is the single entry point.
12. **The company's own website is read first, and aggregators can't set current roles (Dana, 2026-09-26).** An Aviv Group run reported a April 2023 commercial-register signatory as the current Chief People Officer, while the official team page named Olga Kim. Anthropic's `web_fetch` could not open aviv-group.com at all, so every module had fallen back to org-chart and data aggregators. Fixes:
    - **Step 0 of every run** reads the company's site server-side (`orchestrator/company-site.ts`). It follows the homepage's own links plus one more click toward team, leadership, board, companies, about, news and careers pages. Duplicate "not found" shells are dropped. The result is stored as the `company-website-<date>.md` input, which every module reads first. When no website was entered, a small search finds it.
    - **Brief 04:** the official team page is the authority on current roles. Aggregators (The Org, ZoomInfo, RocketReach, LeadIQ, register signatory lists) are leads only, and roles found only there are marked "unconfirmed". The synthesizer admits only confirmed-current people as key personas.
13. **Module 06, Group & portfolio (Dana, 2026-09-26).** It covers one level up (parent or controlling owner) and one level down (up to 8 major companies, brands or units). For each: what it does, market, size, leader (confirmed or not), and latest change. It runs in parallel with 01–05 in Full research, has a 180-day shelf life, and renders as the report's **Group structure** section.
14. **Source order: official website → our documents → web search (Dana, 2026-09-26).** The official website is the source of truth about the company, whether or not a link was entered. When none was entered, the run finds it, and step 2 shows it so a wrong site can be corrected (`PATCH /companies/[slug]`). All six briefs, the researcher prompt and the synthesizer state this order. Each module's input is laid out as SOURCE 1, 2 and 3 in the same order. On conflicts about the company itself, the higher source wins and the conflict is recorded. There is one exception: employee voice remains its own evidence for lived culture, and the website is the authority for stated culture only.
15. **AI cost is visible (Dana, 2026-09-26).** Every step records its token and search usage: research modules, the report, and now the photo step (`data.photosUsage`). `src/shared/ai-cost.ts` holds one table of Anthropic list prices; update it when prices change. The results page shows the cost of this report and the total spent on the company. The report cost counts the research it is built on, including modules reused from earlier runs. Duplicate legacy usage rows are counted once. The run screen shows an estimate before Start, based on measured averages: about $0.70 per research module, $0.35 for the report and $0.15 for photos. Input is priced at the full rate, so figures lean slightly high. The cost line is excluded from the PDF. The intent is to run research only when needed.
16. **Persona photos come from the official website first (Dana, 2026-09-26).** Olga Kim's photo was on aviv-group.com/team but was missed, for two reasons. The photo pass never looked at the official pages. And Webflow renders the photos as CSS backgrounds or `<img>` tags with generic file names such as "photo portrait.png". The photo step now works in two passes:
    - **Pass 1, free:** check the official pages read in step 1. It detects `<img>` tags, `srcset`, CSS `url(...)` backgrounds and quoted image URLs, and applies the name rule. On the company's own pages only, it also applies a **team-card rule**: the `<img>` directly before the person's name is accepted when no other image and no other persona name lies between them, the gap fits one card (≤12k characters), and the image isn't a logo or named for someone else.
    - **Pass 2:** web search runs only for people pass 1 misses.

    On Aviv Group, all 6 photos now come from the official site, in 1 second, at $0.00. Previously the step found 2 of 6 for $0.53. Hardened the same day, when Dana asked that this always happen:
    - **Always:** the photo step re-reads the site itself when no read from today exists. It also tries the usual team addresses directly (`/team`, `/leadership`, `/management`, …).
    - **Other scripts:** one small call finds each name as written on the page (e.g. Mor Cohen → מור כהן). A variant is kept only if it literally appears on the page. Name matching is Unicode-aware, and the website reader recognises Hebrew, French and German section names.
    - **The card rule is proven per page before use:** people matched by name on that page must have their named photo in the card position, at least one must, and none may contradict. On vlu.co.il the photo before "שימי קאופמן" is Mor Cohen's, so the rule stays off there.
    - **Profile-page rule:** on a person's own page (title or address carries their full name), its og:image is used.

    Results: VLU has 5 of 6 from vlu.co.il, and the missing person isn't on the site. Aviv Group has 6 of 6 at $0.00. Both were checked visually.
6. **The cache is read from the database.** A module counts as fresh when `researched_on + shelf_life_days` is later than today. Every run inserts a new row and the latest row wins, so history is kept.

## Consequences
- ➕ Dana and Susan share one research history across logins, and customers never see the tool.
- ➕ The research prompts stay declarative in `products/interview-intelligence/` (ADR-001). Tuning a brief is a markdown edit, not a code change.
- ➕ The data is already shaped as CRM records. When the CRM lands, it extends `companies` instead of importing files.
- ➖ The runtime depends on web search being enabled for the Anthropic organization. Server-tool usage is billed per search on top of tokens.
- ➖ Private companies will often have thin data, as the package ADR already predicted. The profiles will show low confidence.
- ➖ Glassdoor depth still depends on manual exports being uploaded.
- **Deferred:** CRM features (contacts, deals, activity), reviewer subagent, department-level profiles, paid company-data APIs, scheduled refreshes, and any connection to the JD agent.
