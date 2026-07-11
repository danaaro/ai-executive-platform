# ADR-003 — Runtime Stack

Date: 2026-07-11 | Status: **accepted**

## Title
Next.js (TypeScript, App Router) + Anthropic SDK as the platform's shared runtime; Vercel as the first deployment target.

## Context
`src/` (ADR-001) was scaffolded product-agnostic but stack-agnostic — no language or framework had been chosen. Dana wants to *experience* the Job Description agent as a real, browser-accessible SaaS app (not files in a repo) as fast as possible, with tuning of the agent's interview logic deferred to later. This is the first decision that actually populates `src/` with code.

Constraints considered:
- Dana's technical background is JS-first (with legacy Java/C/C++); wants AI-first building, minimal new-stack overhead.
- Need one deployable unit covering both UI and API — standing up a separate backend service just to see a chat prototype work would slow down the goal (experience E2E fast).
- The product/runtime split from ADR-001 must hold: agent content (`products/interview-intelligence/agents/`, `docs/`) stays data the runtime loads, not code to fork per product.

## Decision
- **Framework:** Next.js, App Router, TypeScript. One framework serves both the chat UI (`src/app/page.tsx`) and the API (`src/app/api/*/route.ts`).
- **Model access:** `@anthropic-ai/sdk`, called server-side only (API key never reaches the browser).
- **Orchestration:** `src/orchestrator/` loads an agent's definition file + supporting docs from `products/<product>/` at request time and assembles the system prompt — keeping products declarative per ADR-001. `src/shared/` holds the Anthropic client.
- **Hosting:** Vercel, via `npx vercel` (no global install). Chosen for zero-config Next.js deploys and a real shareable URL with minimal setup. Not exclusive — can be revisited if platform needs (e.g. long-running jobs, specific compliance hosting) argue otherwise.
- **State (v1 only):** conversation history is held client-side and replayed to the API each turn (stateless API). No database yet — `src/memory` and `src/authentication` stay unbuilt until multi-tenant/persistent sessions are actually needed.

## Consequences
- `src/api`, `src/orchestrator`, `src/shared` gain real code; `src/memory`, `src/knowledge`, `src/authentication`, `src/evaluation` remain empty until a concrete need forces them (per ADR-001's "no speculative infrastructure" rule).
- Adds the platform's first dependency manifest (`package.json`) and its first `node_modules` footprint — `.gitignore` already covered this.
- V1 chat prototype does **not** persist output files from the server (serverless filesystems are ephemeral in production); the agent delivers the JD as chat output for now. Durable output storage is a fast-follow once the deployment target and storage approach are confirmed.
- Locks in JavaScript/TypeScript as the runtime language for the shared platform going forward — a genuinely hard-to-reverse choice, hence this ADR.
