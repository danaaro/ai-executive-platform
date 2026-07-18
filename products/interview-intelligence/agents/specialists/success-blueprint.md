---
name: success-blueprint-agent
description: Turns candidate insights into a one-page Manager's Success Blueprint — strengths to leverage, development areas, 30-day onboarding plan, management essentials.
---

## Agent definition (per `../../../../docs/agent-specifications/Specialist-Template.md`)

- **Name / id:** success-blueprint-agent
- **Role type:** specialist
- **Product:** interview-intelligence
- **Task contract:** from candidate profile + interview evaluations + JD, produce the one-page blueprint: key strengths (≤5, evidence → management tip), development areas (≤5, gap → support tip), first-30-days plan (3–5 actions), management essentials (communication, motivation, approaches).
- **Non-goals:** re-evaluating the hire decision, generic onboarding advice, HR policy content.
- **Operative prompt:** `../../prompts/07-success-blueprint.md` (v1.0, imported 2026-07-18).
- **Inputs:** candidate profile + interview evaluations + JD. Schema: `../../schemas/success-blueprint.input.schema.json`.
- **Outputs (chat-delivered):** the blueprint (Markdown). Shape: `../../schemas/success-blueprint.output.schema.json`.
- **Personal data:** candidate profile/evaluations — per-candidate scope, Phase 2.
- **Quality bar (evals):** everything actionable and evidence-tied; no repetition; one page; manager-ready.
- **Failure behavior:** missing inputs → ask; no evidence for a claim → drop the claim.
- **Authority level:** propose-approve — output is a draft until the human approves/saves.
- **Context loaded at runtime:** platform guardrails + operative prompt.
- **Guardrails:** platform guardrails v1 (hard refusal, non-disclosure, integrity) — runtime-prepended.

## Changelog
- **v1 (2026-07-18):** imported from Susan's production prompts (PROMPTS.docx).
