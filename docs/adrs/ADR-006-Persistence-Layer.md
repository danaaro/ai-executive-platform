# ADR-006 — Persistence Layer

Date: 2026-07-19 | Status: **accepted** (Dana, 2026-07-19 — provider + design choices confirmed)

## Title
Supabase Postgres (EU) + Drizzle ORM as the platform's persistence layer; Clerk remains identity; per-user data with an admin role.

## Context
Nothing survives a page refresh: conversations live in React state, artifacts are chat text, Save writes local files only (501 on Vercel's ephemeral fs), and the text↔voice handoff is an in-memory singleton. Every next capability (artifact library, roles/chaining, draft-&-approve, evals, tenancy) needs a database. Dana's explicit requirement: artifacts must be savable *inside the application*. The vision doc (§7) sanctions managed Postgres (Supabase/Neon/RDS), EU-hosted.

## Decision
1. **Provider: Supabase, EU region (Frankfurt)** — used narrowly as **Postgres now, object Storage later** (Phase-2 CVs/transcripts under one EU vendor → short sub-processor list). Supabase Auth and auto-generated APIs are **not used**: Clerk keeps identity; all DB access is server-side through Drizzle over the transaction pooler. No client ever holds DB credentials; RLS deferred until clients talk to the DB directly (not planned).
2. **ORM: Drizzle** — schema in TypeScript in `src/db/`, migrations via drizzle-kit.
3. **Access model: per-user + admin** (Dana's call): users see their own conversations/artifacts; users with role `admin` (Dana, Susan) see everything. Role source of truth = Clerk `publicMetadata.role`; mirrored into the `users` table on first authenticated request. User creation/registration stays in Clerk (currently invitation-based restricted mode); role assignment via Clerk metadata (API/dashboard; in-app admin UI later).
4. **Artifact versioning: versioned slots** — one logical slot per (owner, agent, future role), monotonically increasing `version`, full history kept, `status` field (`draft`/`approved`) reserved for step 4 (draft-&-approve).
5. **Personal-data boundary: role-scoped persistence only.** Conversations are persisted **only for candidate-agnostic agents** (1–4 job-description…interview-system-builder, A2 screening-guide). Candidate-scoped agents (5–8, A1) remain browser-ephemeral until Phase 2 ships retention/auto-delete. Result: **zero personal data in the DB** in this phase.

## Consequences
- Save works on the hosted app; artifact library + conversation history become buildable immediately (build-queue steps 1–2).
- Migration risk is low: vanilla Postgres + Drizzle — provider swap = dump/restore + connection string until data accumulates.
- The in-memory voice handoff remains (the ElevenLabs callback carries no user identity), but it now hydrates from the DB conversation, and its loss-modes shrink to within-session only.
- Deferred consciously: RLS, Supabase Storage bucket, in-app user management, per-tenant isolation (step 6), retention jobs (Phase 2).
- New env var `DATABASE_URL` (pooler URI) in `.env.local` + Vercel production; Supabase project must live on **Dana's own account** (see account-separation rule).

---

## Amendment 2026-08-13 — RLS is no longer deferred (accepted, Dana)

**What was wrong.** Decision 1 deferred RLS on the reasoning that "no client ever holds DB credentials" and clients talking to the DB directly was "not planned". The premise was half true and the conclusion was unsafe: our *runtime* indeed never touches the DB directly, but Supabase publishes every table in `public` through **PostgREST** by default, and its default grants had given `anon` and `authenticated` full CRUD on all seven tables. With RLS off, anyone holding the project's *publishable* anon key could read — and delete — every conversation, message and artifact at `https://<ref>.supabase.co/rest/v1/…`. "We don't use that API" is not the same as "that API is closed". Supabase's Security Advisor had been flagging exactly this as 7 errors; Dana surfaced it on 2026-08-13.

**Decision.** RLS is enabled on every table in `public`, with **zero policies** — default-deny for `anon` and `authenticated`. In addition the table grants are revoked from both roles outright, and `ALTER DEFAULT PRIVILEGES` is revoked so a future `drizzle-kit push` cannot silently re-open the hole on a new table. `service_role` is left as-is (it bypasses RLS by design and its key is server-secret and unused here).

**Why this changes nothing about the authorization model.** Authorization stays exactly where ADR-008 put it: per-project membership enforced in the API layer. RLS here is a *second wall around an unused door*, not a new access-control mechanism — the runtime connects as `postgres`, which is both table owner and `BYPASSRLS`, so RLS is invisible to it. There are deliberately no policies to maintain: adding one would start splitting authorization across two places.

**Consequences.**
- Reversible and repeatable: `npm run secure:rls` (`scripts/secure-rls.ts`) is idempotent, refuses to run if the connecting role lacks `BYPASSRLS`, and verifies its own result including that the app can still read.
- If a client ever *should* talk to Supabase directly (Phase-2 Storage is the likely first case), that becomes an explicit decision requiring real policies — which is the correct place for that conversation, rather than inheriting open access by default.
- Supersedes the "Deferred consciously: RLS" bullet in Consequences above.
