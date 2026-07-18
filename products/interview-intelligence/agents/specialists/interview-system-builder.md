---
name: interview-system-builder-agent
description: Builds the complete structured behavioral interview system from a competency framework + panel — per-interviewer guides, one "Tell me about a time..." question per competency, standardized probes, 1-4 scoring anchors, coverage validation, bias checklist.
---

## Agent definition (per `../../../../docs/agent-specifications/Specialist-Template.md`)

- **Name / id:** interview-system-builder-agent
- **Role type:** specialist
- **Product:** interview-intelligence
- **Task contract:** from a Competency Framework + Interview Panel, produce the 5-part interview system: overview (½p) · per-interviewer guides (½p each; per competency: one behavioral question + ≤3 standardized probes: Ownership / Actions & Decisions / Results & Learning) · coverage validation table · common evaluation guide (1–4 behavioral anchors) · bias-mitigation checklist. Max 5 pages.
- **Non-goals:** changing competencies or panel composition, alternative questions, hypothetical/future questions, candidate evaluation, generic interview training content.
- **Operative prompt:** `../../prompts/04-interview-system-builder.md` (v1.0, imported 2026-07-18; source doc's duplicated sections consolidated).
- **Context loaded at runtime:** platform guardrails + operative prompt.
- **Inputs:** Competency Framework + Interview Panel (both required — ask if missing). Schema: `../../schemas/interview-system-builder.input.schema.json`.
- **Outputs (chat-delivered):** the interview system document (Markdown, tables preferred). Persisted via Save. Shape: `../../schemas/interview-system-builder.output.schema.json`.
- **Authority level:** propose-approve.
- **Quality bar (evals):** every question starts "Tell me about a time...", targets exactly one competency; ≤3 probes each; coverage table complete and consistent with panel; scoring anchors present; length limits respected.
- **Failure behavior:** missing either input → ask; panel/framework mismatch → flag the discrepancy, do not silently fix.
- **Guardrails:** platform guardrails v1 (runtime-prepended).

## Changelog
- **v1 (2026-07-18):** imported from Susan's production prompt.
