# ADR-011 — Role credits and locked roles

Date: 2026-10-17 | Status: **accepted** (Dana, 2026-10-17)

## Title
Role credits are an append-only ledger per company, granted only by admins against a signed contract and spent one per role; opening a role locks its title and salary range.

## Context
`docs/customer-journey.md` and `docs/guardrails.md`: one credit = one role; credits are sales-led (no self-service purchase); title and salary range are locked when the role is opened; usage limits are enforced on the server. UI review U8: "Start new role" depends on the available credits. ADR-010 put every customer record under a company with row-level security.

## Decision
1. **Ledger, not a counter.** Table `credit_ledger`: one row per movement — `grant` (positive, admin only, with credits, agreed price + currency, contract/invoice reference, note), `spend` (−1, the role it opened), `adjustment` (admin corrections, signed). Balance = sum of `delta` for the company. Nothing is ever updated or deleted, so every balance traces back to its contracts and roles.
2. **Who writes what.** Admins (Dana, Susan) grant and adjust from the admin area, through `adminDb()`. Customers can only *spend*, and only by opening a role: the tenant policy allows `app_user` to insert exactly `kind = 'spend', delta = -1` for its own company, and to read its own company's ledger. No customer path can add credits.
3. **Atomic spend.** Opening a role runs in one tenant transaction: take a per-company advisory lock, compute the balance, refuse if below 1, create the role, write the spend row linked to it. Two simultaneous clicks cannot spend the same credit.
4. **Locked role facts.** `projects` gains `salary_min`, `salary_max`, `salary_currency` (annual base, required), `show_salary_on_jd`, `hiring_manager_user_id` / `hiring_manager_email` (the person who will approve; pending until they sign in). Title and salary cannot be changed after opening (the PATCH route refuses them); a different role needs a new credit.
5. **Hiring manager approval** (only the named hiring manager approves) is stored now and enforced in JD v3 phase 3.

## Consequences
- The company home shows the balance; "Start new role" is disabled at 0 ("No role credits left — contact us"), and the server refuses regardless.
- SusanDana needs a first grant before its users can open a role.
- Stripe (optional, later) would add `grant` rows from a verified webhook — same ledger.
- Migration: `scripts/migrate-credits.ts` (dry run by default); policies live in `scripts/secure-tenancy.ts` with the others; covered by `npm run rehearse:tenancy` and the isolation test.
