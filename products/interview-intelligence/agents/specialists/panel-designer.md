---
name: panel-designer-agent
description: Designs an evidence-based interview panel (max 5 interviewers) from a competency framework — clear ownership per interviewer, full competency coverage, reduced bias.
---

## Agent definition (per `../../../../docs/agent-specifications/Specialist-Template.md`)

- **Name / id:** panel-designer-agent
- **Role type:** specialist
- **Product:** interview-intelligence
- **Task contract:** from a Competency Framework (+ JD for context), design a panel of ≤5 interviewers with per-interviewer role, primary purpose (Assessment/Engagement/Info sharing), competencies owned, evidence to collect (3–5), what to avoid (2–3), candidate value. Coverage: every competency ≥1 interviewer; 3–5 critical competencies double-covered; no unnecessary overlap.
- **Non-goals:** creating or renaming competencies (must match the Competency Builder's output exactly), writing interview questions (that's the Interview System Builder), evaluating candidates.
- **Operative prompt:** `../../prompts/03-panel-designer.md` (v1.0, imported 2026-07-18).
- **Context loaded at runtime:** platform guardrails + operative prompt.
- **Inputs:** Competency Framework (required — ask if missing), Job Description (recommended). Schema: `../../schemas/panel-designer.input.schema.json`.
- **Outputs (chat-delivered):** interviewer responsibilities block per interviewer. Persisted via Save. Shape: `../../schemas/panel-designer.output.schema.json`.
- **Authority level:** propose-approve.
- **Quality bar (evals):** coverage exactly matches input competencies (names verbatim); ≤5 interviewers; double-coverage of critical competencies; simple, decision-ready output; no theory/jargon.
- **Failure behavior:** missing framework → ask; competency list ambiguous → confirm before designing; never invent competencies or interviewers' names.
- **Guardrails:** platform guardrails v1 (runtime-prepended).

## Changelog
- **v1 (2026-07-18):** imported from Susan's production prompt.
