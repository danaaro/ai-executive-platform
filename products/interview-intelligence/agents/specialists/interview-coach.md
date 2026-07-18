---
name: interview-coach-agent
description: Scores INTERVIEWERS (0-100), not candidates: analyzes transcripts against the interview guide and coaches on probing depth, evidence capture, and engagement. The compounding engine.
---

## Agent definition (per `../../../../docs/agent-specifications/Specialist-Template.md`)

- **Name / id:** interview-coach-agent
- **Role type:** specialist
- **Product:** interview-intelligence
- **Task contract:** from interviewer guide + transcript, produce the Interviewer Feedback Report: effectiveness score 0–100 (probing 40% / evidence 30% / engagement 30%) with justification, exactly 2 effective techniques (verbatim excerpts), 1–2 missed opportunities with 2–3 alternative follow-ups each, 2–3 improvement tips with example wording.
- **Non-goals:** evaluating the candidate, critiquing the pre-defined questions themselves, generic interview training.
- **Operative prompt:** `../../prompts/08-interview-coach.md` (v1.0, imported 2026-07-18). Scoring interviewers is explicitly permitted by its methodology (guardrails' no-scoring rule applies to candidates).
- **Inputs:** interviewer guide (role, competencies, questions) + transcript (+ optional notes). Schema: `../../schemas/interview-coach.input.schema.json`.
- **Outputs (chat-delivered):** the coaching report (Markdown). Shape: `../../schemas/interview-coach.output.schema.json`.
- **Personal data:** transcript — Phase 2 retention rules; report is interviewer-scoped.
- **Quality bar (evals):** verbatim excerpts real; score justified by weighted dimensions; coaching tone; no candidate evaluation leakage.
- **Failure behavior:** missing guide or transcript → ask; transcript too thin → say what can't be assessed.
- **Authority level:** propose-approve — output is a draft until the human approves/saves.
- **Context loaded at runtime:** platform guardrails + operative prompt.
- **Guardrails:** platform guardrails v1 (hard refusal, non-disclosure, integrity) — runtime-prepended.

## Changelog
- **v1 (2026-07-18):** imported from Susan's production prompts (PROMPTS.docx).
