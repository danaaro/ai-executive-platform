# Specialist Template

> STATUS: 🟡 DRAFT — extends `ADS-Template.md` for specialist-type agents.

A **specialist** is a sellable task agent with one job and a hard I/O contract (e.g. the Job Description agent). Specialists are the unit of value the platform sells and the unit the eval harness grades.

## Adds to the ADS
- **Task contract** — precise statement of the single task; explicit non-goals
- **Input schema** — required/optional fields, validation rules (JSON Schema in product `schemas/`)
- **Output schema** — the structured artifact produced; every claim in it must be traceable to input or loaded knowledge (no invention)
- **Quality bar** — the rubric dimensions its evals grade (accuracy, completeness, evidence, tone)
- **Failure behavior** — what it does when input is insufficient: ask, or return a typed gap-report — never guess

## Constraints
- One specialist = one task. A second task = a second specialist.
- No side effects: a specialist produces its artifact and stops. Actions on external systems belong to the orchestrator under the authority matrix.
- Must be runnable standalone (direct API) and via its executive — same contract both ways.
