# agent-specifications/

The **canonical** definition of what an agent is on this platform. Everything else (runnable skeletons in `agents/templates/`, actual agent files in `products/*/agents/`) derives from here.

- `ADS-Template.md` — the base Agent Definition Specification (all agents)
- `Executive-Template.md` — extension for customer-facing executive personas
- `Specialist-Template.md` — extension for sellable task agents

Change discipline: spec changes here first → regenerate `agents/templates/` → migrate existing agent files. Never patch a template or agent file in a way that contradicts the spec.
