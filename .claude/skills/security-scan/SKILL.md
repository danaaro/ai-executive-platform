---
name: security-scan
description: Full security and compliance scan of the Exec10X / White Falcon platform. Checks the live database (row-level security, policies, grants, EU region), access control in every API route, secrets in code and git history, personal data in logs, prompt-injection and EU AI Act rules, security headers, dependencies, the cross-company tests, the live production site, and runs the security-reviewer on recent changes, then reports a RED / AMBER / GREEN status with ranked recommendations. Use when Dana says "/security-scan", "security scan", "scan security", "are we secure", "security status", "compliance check", before a release to real customers, or after a big feature.
user-invocable: true
argument-hint: "[quick]  (quick = skip the code review and the live probes)"
---

# Security scan

You are running a security and compliance scan for Dana. It is **read-only**: you report and recommend, you never fix, deploy, run `--apply` scripts, or change data. Never print a secret value, a database URL or personal data in your report.

The rules being checked live in `CLAUDE.md` → "Security (non-negotiable)" and "Security and compliance rules", including "How this maps to the code" (tenant = company, `company_id`, `withTenant()`, `adminDb()`). The open work is in `docs/(C) security-compliance-plan.md` (steps S0–S6) and the deferred items in `../TODO.md`.

Work from the repo root: `ai-executive-platform/`.

## 1 · Automated checks (always)

Run these; they are read-only:

1. `npm run security:scan -- --json`: database (RLS, company policies, grants, region), adminDb allowlist, route checks, secrets in tree + history, NEXT_PUBLIC leaks, logging, sensitive traits, retention, headers, prompt-injection rule, overall-score prompts, AI run log, activity log, npm audit, Dependabot.
2. `npm run rehearse:tenancy`: cross-company isolation on a throwaway database (prints ✓/✗ per check). Report the count of passed checks and every ✗.
3. `npm run check:integrity`: every row under the right parent and company.
4. `npx tsc --noEmit -p .`: type check.

If a check cannot run, say so. A check you did not run is **NOT CHECKED**, never OK.

A finding from the script is a signal, not a verdict. Before reporting a HIGH, open the file or query and confirm it (the scan once flagged every table as missing a policy because the policies call `app_company()`; that was the scan's bug). Fix the scan's rule in `scripts/security-scan.ts` when you find a false alarm, and say so.

## 2 · Live production (skip with `quick`)

1. `npx vercel inspect susies-brain.vercel.app --scope danasusie`: build date. Compare with `git log -1 --format=%cd` and list commits not yet live (`git log --oneline <deployed>..HEAD` if the deployed commit is known, else by date). Security fixes that are committed but not deployed are open in production: say so.
2. Response headers: `curl -sI https://susies-brain.vercel.app/sign-in`. Report HSTS, frame protection, nosniff, referrer policy, CSP.
3. Signed-out probes: for every customer route under `src/app/api` (not admin), a request without a session must answer 401 / 404 / redirect, never 200 with data. Use POST for POST-only routes with an empty JSON body. Never send real data.
4. If the Chrome extension is connected (`list_connected_browsers`), check signed in that the top menu shows only the expected links and no removed page is reachable. If not connected, write "signed-in checks: NOT CHECKED".

## 3 · Code review of recent changes (skip with `quick`)

Find the last report in `docs/security-scans/` (its header names the commit it scanned). Launch a subagent (general-purpose) with the contents of `.claude/agents/security-reviewer.md` as its instructions, scoped to `git diff <last-scanned-commit>..HEAD` (or the whole codebase if there is no earlier report or it is older than 30 days). Ask for HIGH / MEDIUM / LOW with file:line and a fix, verified issues only. Verify any HIGH yourself before reporting it.

## 4 · Compliance tracker

From `docs/(C) security-compliance-plan.md`, `docs/decisions.md` and `../TODO.md`, give one line per item: done / in progress / not started / deferred (with the date Dana deferred it):
S0 holes · S1 prompt injection · S2 activity + AI log · S3 deletion + retention · S4 headers, packages, usage limits · S5 company Admin role · S6 reply check · evidence model (Susan's sign-off) · Clerk production keys · two-factor · DPAs for processors outside the EU · view audit.

## 5 · Report

Status: **RED** if any HIGH, **AMBER** if any MEDIUM, else **GREEN**.

Write `docs/security-scans/(C) YYYY-MM-DD security-scan.md` (create the folder if needed) with:
- Header: date, commit scanned (`git rev-parse --short HEAD`), production build date, status.
- Status by area (table): Database · Access control · Secrets · Personal data · AI (EU AI Act) · Audit trail · Web hardening · Dependencies · Tests · Production. Each RED / AMBER / GREEN / NOT CHECKED with one line.
- Findings, most severe first: severity, what, where (file:line), why it matters in plain English, the fix, which plan step covers it.
- Changes since the last scan: new, fixed, still open.
- Recommendations: the top 3 to do next, in order, each with effort (hours/days).
- Compliance tracker (section 4).

Then reply to Dana in plain English, short: status, the counts, the top 3 recommendations, anything committed but not live, what was NOT CHECKED, link to the report, and end with one concrete next action. Dana is not an engineer: say what each risk means for customers and for the business, not just the technical term.

Commit the report (`docs: security scan YYYY-MM-DD`) only if Dana asks; otherwise leave it uncommitted and say where it is.
