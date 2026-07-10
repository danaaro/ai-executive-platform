# src/

The ONE shared runtime every product runs on (ADR-001: products are declarative; all code lives here).

- `api/` — public API surface
- `orchestrator/` — agent/workflow execution, loads product verticals
- `memory/` — memory tiers implementation
- `knowledge/` — knowledge base + retrieval
- `authentication/` — identity, tenancy, API keys
- `evaluation/` — eval harness that runs `products/*/evals/`
- `shared/` — utilities/types

Kept a thin skeleton until the first product slice needs it — no speculative infrastructure.
