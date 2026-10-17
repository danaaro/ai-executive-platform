# ADR-010 — Customer accounts and multi-tenant isolation

Date: 2026-10-17 | Status: **accepted and LIVE** (switched 2026-10-17, ~13:00; Dana's signed-in smoke test passed). Pre-switch backup: `_archive/db-backup-2026-10-17-switch/`
Merges the earlier draft "ADR-010 Multi-Tenant Isolation" (proposed 2026-10-16, never reviewed) into this record.

## Title
Introduce the customer **Company** account as the owner of all customer data. Every customer row carries `company_id`, taken from the signed-in session, filtered in every query, and enforced a second time by Postgres row-level security.

## Context
The core rules (`CLAUDE.md`, `docs/customer-journey.md`) define exec10x.ai as a B2B multi-tenant platform: one account per customer company holding its users, role credits, payments and roles, with `company_id` and RLS on every table, and the company never taken from the browser.

Today the platform does not meet these rules:
- **No customer account exists.** Data hangs off a user → project (one role) → project members (ADR-007/008). Access is checked per project only. Nothing in `src/` uses Clerk Organizations.
- **No table has a customer column.**
- **RLS is on but protects nothing between customers.** `scripts/secure-rls.ts` enables RLS with zero policies and revokes the `anon`/`authenticated` grants. That blocks Supabase's public REST path only. The app itself connects as `postgres`, which owns the tables and bypasses RLS. One missing `WHERE` in an API route would leak data across customers.
- **The name `companies` is taken** by the admin-only Company Intelligence research tables (ADR-009), whose child tables already use `company_id` to mean "researched company".

## Decision

### Accounts
1. **Customer account = Clerk Organization.** Each paying customer is one Clerk Organization; invited users join it. Our `companies` table mirrors it: Clerk org id, name, role-credit balance, payment history, profile (About us, values, culture documents), attached Intel report.
   - A user signed in without an active organization sees no customer data.
   - SusanDana is an organization too. Admins (Dana, Susan) see other companies only through one audited admin function, never by skipping the filter.
   - **Company documents, one place, two visibilities (Dana, 2026-10-17).** Everything about a customer hangs off its company record:
     - *Company Intel* (attached by an admin) — **hidden from the customer**; used in the background by every JD run.
     - *Customer documents* (profile text, and values / culture / leadership documents the customer uploads or saves from a briefing) — **visible to and editable by the customer**, and also used by every JD run.
     - *Admins see all of it* (back office, audited path).
     - Build note: a `company_documents` table (`company_id`, file name, extracted text, `visible_to_customer`, uploaded by, created at). The customer's tenant policy only returns `visible_to_customer = true` rows; Intel stays in the `intel_*` tables, linked by `companies.intel_company_id`, with no customer access at all.
2. **Customer account and Company Intel are separate records.** Often the same company, not always: a customer may have no research, research may cover a parent or different entity, or a customer may be one department. Neither is created from or merged into the other.
3. **Intel is attached to the customer company by admins (Dana, 2026-10-17).** `companies.intel_company_id`, nullable. One attached report at a time; to renew, an admin removes it and attaches the new one. It works in the background: never visible to the customer, and every job description run for that company receives it as company context. No attachment = the JD flow runs on the interview and the customer's profile only.
4. **Naming.** The research tables are renamed `intel_companies`, `intel_company_inputs`, `intel_company_research`, `intel_company_outputs` (their foreign key becomes `intel_company_id`). From then on `companies` / `company_id` always mean the paying customer, exactly as `CLAUDE.md` is written. Research tables are platform-owned, admin-only, and carry no customer `company_id`.

### Isolation
5. **`company_id` NOT NULL on every customer table**: projects (to be renamed roles), project members, conversations, messages, intake answers, artifacts, artifact approvals. Child rows copy it from their parent so RLS can check each row without joins. `users` carries the user's home company; membership itself lives in Clerk (ADR-004).
6. **One choke point.** A server-only helper, `tenantDb()`, takes the company from the verified session (`auth()` → Clerk org id → our company row), never from the request body, query string or headers. Every customer read and write in `src/` goes through it. `getProjectAccess()` (ADR-008) first checks the project's `company_id` against the session; membership roles apply only after that. Any company id the browser sends is ignored.
7. **RLS becomes a real second wall** (as built, 2026-10-17 — simpler than a second login).
   - A restricted role `app_user` (NOLOGIN, cannot bypass RLS). The app does not log in as it: every customer request runs inside `withTenant(companyId, …)` (src/db/index.ts), a short transaction that does `SET LOCAL ROLE app_user` and sets `app.company_id` from the session (`set_config(…, true)`, so it cannot leak into another request). No new connection string or secret.
   - `db()` outside `withTenant` **throws** (fail closed). `adminDb()` is the explicit, greppable exception: the admin-only Company Intel tool and pre-tenant system lookups (session → company, signed voice grant → company, display names).
   - Every customer table: `company_id = app_company()` policy for select, insert, update, delete. `companies` and `users`: read-only, own company. No `app_user` grants on `intel_*` tables at all.
   - Short routes run whole inside `tenantRoute()`; streaming routes scope each persistence step and never hold a transaction across a model call.
   - Script: `scripts/secure-tenancy.ts` (dry run default). The existing default-deny for `anon` / `authenticated` stays.

### Data and rollout
8. **Existing projects, conversations, messages, intake answers and artifacts are deleted** (test data only; Dana, 2026-10-17), after a backup export kept outside git. **Company Intel research is kept** and only renamed.
- Clerk (Development, 2026-10-17): Organizations enabled; home org **SusanDana** = `org_3GigNkgZzCCszpTi1TrgFVdKa7T` (Susan + both Dana accounts, admins). No Production instance exists yet; it is created with the app.exec10x.ai move (repo-structure.md → Deployment) and must exist before the first real customer.
9. **Order** — see the switch runbook below. Each database step is an idempotent script in `scripts/`, dry run unless `--apply`.
10. **Verification is a test, not a promise.** `npm run rehearse:tenancy` rebuilds today's live structure on a throwaway in-memory Postgres (PGlite, dev-only), loads the backup, runs the three switch scripts, checks the result, then runs `scripts/test-tenant-isolation.ts` (two companies: A — admins included — cannot open, list, update or write anything of B's, via the access layer or raw SQL as `app_user`; refusals must be Postgres 42501; every customer route is tenant-scoped) and the voice durability/continuity tests. 2026-10-17: 80/80 checks, 5 consecutive runs. Cross-company admin views (back office) get their own audited path when the admin panel is built.

## Consequences
- Customer A cannot see customer B's data even if a route forgets a filter, because the database refuses the row.
- Every query in `src/` is touched once to go through `tenantDb()`. Moving to `app_user` changes the connection string; it is the riskiest step and goes last, behind the isolation test.
- Company Intel code paths are renamed; admin-only behaviour is unchanged.
- Clerk Organizations is part of the existing Clerk plan (no new service). Organization invites replace part of ADR-008's email invites. The hiring manager named on a role is invited into the customer's organization. Sharing across organizations is out of scope for the MVP.
- Unblocks credits and payments, locked role title and salary, the admin back office, and scoped deletion of a company's or a closed role's data.
- Supersedes per-user project ownership (ADR-007) at the top level; "the project is the primary entity under the account" still holds.

## Switch runbook (one window, ~5 minutes; only Dana and Susan use the app)
The database work takes under a second (rehearsal); the window is the deploy. Between steps 2 and 5 the live app is down — the old code cannot read the renamed tables.
1. Fresh backup of every table to `_archive/db-backup-<date>/`.
2. `npm run migrate:intel-rename -- --apply`
3. `npm run migrate:customer-accounts -- --apply --home-org=org_3GigNkgZzCCszpTi1TrgFVdKa7T` (SusanDana; the app's only Clerk instance is Development, so this id is also the live one)
4. `npm run secure:tenancy -- --apply` and `npm run secure:rls`
5. Merge `feat/customer-accounts` → `main`, then `vercel deploy --prod` (a GitHub push alone does not deploy this project).
6. Smoke test as Dana: sign in → empty roles list (no error) → open a role → one JD chat turn → Company Intel page shows all 13 companies.

**If something fails:** before step 5, nothing customer-facing has changed beyond the outage — fix and continue. The deletes in step 3 are covered by the backup; research is never deleted, only renamed.
