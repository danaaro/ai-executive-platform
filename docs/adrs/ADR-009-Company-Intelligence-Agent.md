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
6. **The cache is read from the database.** A module counts as fresh when `researched_on + shelf_life_days` is later than today. Every run inserts a new row and the latest row wins, so history is kept.

## Consequences
- ➕ Dana and Susan share one research history across logins, and customers never see the tool.
- ➕ The research prompts stay declarative in `products/interview-intelligence/` (ADR-001). Tuning a brief is a markdown edit, not a code change.
- ➕ The data is already shaped as CRM records. When the CRM lands, it extends `companies` instead of importing files.
- ➖ The runtime depends on web search being enabled for the Anthropic organization. Server-tool usage is billed per search on top of tokens.
- ➖ Private companies will often have thin data, as the package ADR already predicted. The profiles will show low confidence.
- ➖ Glassdoor depth still depends on manual exports being uploaded.
- **Deferred:** CRM features (contacts, deals, activity), reviewer subagent, department-level profiles, paid company-data APIs, scheduled refreshes, and any connection to the JD agent.
