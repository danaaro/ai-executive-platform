# ADR-010 — Customer accounts and multi-tenant isolation

Date: 2026-10-17 | Status: **accepted** (Dana, 2026-10-17) — not yet built
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
2. **Customer account and Company Intel are separate records.** Often the same company, not always: a customer may have no research, research may cover a parent or different entity, or a customer may be one department. Neither is created from or merged into the other.
3. **Intel is attached to the customer company by admins (Dana, 2026-10-17).** `companies.intel_company_id`, nullable. One attached report at a time; to renew, an admin removes it and attaches the new one. It works in the background: never visible to the customer, and every job description run for that company receives it as company context. No attachment = the JD flow runs on the interview and the customer's profile only.
4. **Naming.** The research tables are renamed `intel_companies`, `intel_company_inputs`, `intel_company_research`, `intel_company_outputs` (their foreign key becomes `intel_company_id`). From then on `companies` / `company_id` always mean the paying customer, exactly as `CLAUDE.md` is written. Research tables are platform-owned, admin-only, and carry no customer `company_id`.

### Isolation
5. **`company_id` NOT NULL on every customer table**: projects (to be renamed roles), project members, conversations, messages, intake answers, artifacts, artifact approvals. Child rows copy it from their parent so RLS can check each row without joins. `users` carries the user's home company; membership itself lives in Clerk (ADR-004).
6. **One choke point.** A server-only helper, `tenantDb()`, takes the company from the verified session (`auth()` → Clerk org id → our company row), never from the request body, query string or headers. Every customer read and write in `src/` goes through it. `getProjectAccess()` (ADR-008) first checks the project's `company_id` against the session; membership roles apply only after that. Any company id the browser sends is ignored.
7. **RLS becomes a real second wall.**
   - A new database login, `app_user`, owns no tables and cannot bypass RLS. The app connects as `app_user`; `postgres` is reserved for migrations and scripts.
   - Each request runs in a transaction that sets `app.company_id` from the session (`set_config(…, true)`, so it cannot leak into another request).
   - Every customer table gets `company_id = current_setting('app.company_id')` policies for select, insert, update and delete.
   - Research tables: no `app_user` access except through the admin path.
   - The existing default-deny for `anon` / `authenticated` stays.

### Data and rollout
8. **Existing projects, conversations, messages, intake answers and artifacts are deleted** (test data only; Dana, 2026-10-17), after a backup export kept outside git. **Company Intel research is kept** and only renamed.
9. **Order, so nothing goes dark:** (1) backup; (2) enable Organizations in Clerk, create the SusanDana organization; (3) rename research tables; (4) create `companies`, delete old customer data, add `company_id` NOT NULL + indexes; (5) ship `tenantDb()` and the `getProjectAccess` company check; (6) RLS policies + switch the connection to `app_user` last. Each step is an idempotent script in `scripts/`, like `secure-rls.ts`.
10. **Verification is a test, not a promise.** `scripts/test-tenant-isolation.ts` creates two companies with a role each and asserts: user A cannot read, list, update or approve anything of B's through any API route; changing a company id in a request does nothing; a raw query as `app_user` with A's setting returns zero rows of B's; admin cross-company reads only go through the audited path.

## Consequences
- Customer A cannot see customer B's data even if a route forgets a filter, because the database refuses the row.
- Every query in `src/` is touched once to go through `tenantDb()`. Moving to `app_user` changes the connection string; it is the riskiest step and goes last, behind the isolation test.
- Company Intel code paths are renamed; admin-only behaviour is unchanged.
- Clerk Organizations is part of the existing Clerk plan (no new service). Organization invites replace part of ADR-008's email invites. The hiring manager named on a role is invited into the customer's organization. Sharing across organizations is out of scope for the MVP.
- Unblocks credits and payments, locked role title and salary, the admin back office, and scoped deletion of a company's or a closed role's data.
- Supersedes per-user project ownership (ADR-007) at the top level; "the project is the primary entity under the account" still holds.
