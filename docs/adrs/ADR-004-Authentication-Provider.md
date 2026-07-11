# ADR-004 — Authentication Provider

Date: 2026-07-11 | Status: **accepted**

## Title
Clerk as the platform's login and user-management provider.

## Context
The Job Description agent prototype (ADR-003) had no access control — anyone with the URL could use it. To be "truly SaaS," Dana wants real login and user management, not a placeholder. Three options were considered:

1. **Clerk** — managed auth provider, drop-in UI components, hosted user-management dashboard.
2. **Auth.js (NextAuth)** — free, self-hosted, but requires building login UI by hand and a database to persist user records (session cookies alone aren't "user management").
3. **Simple password gate** — one shared password, no real accounts; explicitly a stopgap, not a fit for "user management."

## Decision
Adopt **Clerk**. Rationale:
- No database needed yet just to have real, persisted user accounts — defers the `src/memory`/database decision until the product actually needs one (per ADR-001's "no speculative infrastructure" rule).
- Drop-in `<SignIn/>`, `<SignUp/>`, `<UserButton/>` components + a hosted dashboard to see and manage users, without building admin tooling.
- Free tier (10k MAU) comfortably covers the current build/test/demo stage.
- Fastest path from "working prototype" to "looks and behaves like a real SaaS," matching the pace of this build.

## Implementation
- `src/middleware.ts` — `clerkMiddleware`, protects every route except `/sign-in` and `/sign-up` (this also covers the `/api/*` routes via the matcher).
- `src/app/layout.tsx` — wrapped in `<ClerkProvider>`.
- `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/app/sign-up/[[...sign-up]]/page.tsx` — in-app branded auth pages (not an off-site redirect).
- `<UserButton/>` in the chat page header for session/profile/sign-out.
- Requires `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (`.env.local.example` updated) from a free Clerk application — external account creation, cannot be done on Dana's behalf.

## Consequences
- Adds an external vendor dependency for a security-critical function — acceptable at this stage; revisit if data residency, cost at scale, or specific compliance requirements (relevant given customers may include regulated industries) argue otherwise later.
- `src/authentication/` (ADR-001 placeholder) is now real: it's a thin wrapper around Clerk, not a from-scratch auth system.
- User identity is now available platform-wide (via Clerk's `auth()`/`currentUser()`), which is the natural foundation for per-tenant data later — but multi-tenant data isolation itself is a separate, not-yet-made decision.
- The app is unusable without valid Clerk keys in `.env.local` — same category of hard requirement as `ANTHROPIC_API_KEY` (ADR-003).
