# ADR-010 — Public presentation site on exec10x.ai

Date: 2026-10-09 | Status: **accepted** (Dana, 2026-10-09)

## Title
Serve the customer presentation from this app at exec10x.ai, as static files in a new top-level `public/` folder.

## Context
SusanDana Co bought exec10x.ai for the platform. The customer presentation (built in the parent workspace, `../outputs/marketing/customer-presentation-2026-10/`) was only reachable as a private claude.ai artifact. It needs a public home on the new domain, and this app is already deployed on Vercel.

## Decision
- `public/presentation/` holds a built copy of the deck: `index.html` (asset paths rewritten to absolute `/presentation/...`), `audio/`, `logos/`, `susan-pike.webp`. `public/` is Next.js's static folder, so it is the one sanctioned exception to ADR-001's fixed tree.
- `src/middleware.ts` rewrites `/` on `exec10x.ai` / `www.exec10x.ai`, and `/presentation` on any host, to `/presentation/index.html` before Clerk runs. Static assets (paths with a dot) never reach the middleware.
- Every other route on exec10x.ai is the normal, Clerk-protected app.

## Consequences
- The source of truth stays in the parent workspace. After editing the deck there, re-copy it into `public/presentation/` and redo the path rewrite.
- The deck is public on the open web: testimonials, logos and the illustrative chat must be cleared for public use.
- When the platform gets its own marketing site, the root of exec10x.ai moves to it and this rewrite is removed.
