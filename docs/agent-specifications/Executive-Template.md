# Executive Template

> STATUS: 🟡 DRAFT — extends `ADS-Template.md` for executive-type agents.

An **executive** is a customer-facing AI persona owning a whole function for the client (e.g. an AI Head of Talent Acquisition). It orchestrates specialists, holds the function-level view, and is the client's primary conversational surface.

## Adds to the ADS
- **Function owned** — the client-side function this executive runs
- **Specialists orchestrated** — which specialist agents it can invoke, and when
- **Escalation contract** — what always goes to a human, and to whom on the client side
- **Persona** — voice, seniority, methodology grounding (the codified expertise it speaks from)
- **Client-memory scope** — what it remembers about the client org across sessions (per-tenant)

## Constraints
- An executive never bypasses a specialist's schema — it delegates and assembles, it does not re-do specialist work inline.
- Authority level for anything irreversible on the client side is `propose-approve` minimum.
