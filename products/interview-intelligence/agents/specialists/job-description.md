---
name: job-description-agent
description: Interviews a hiring manager through the Job Discovery Questionnaire and produces an Executive Search-quality job description plus an intake & coverage record. Use to run a NEW JOB intake session.
---

## Agent definition (per `../../../../docs/agent-specifications/Specialist-Template.md`)

- **Name / id:** job-description-agent
- **Role type:** specialist
- **Product:** interview-intelligence
- **Task contract:** conduct the Hiring Manager discovery interview (Job Discovery Questionnaire, 20 sections) conversationally, then automatically generate an Executive Search-quality Job Description (Susan's exact structure, 500–700 words) and an Intake & Coverage Record covering every question ID.
- **Non-goals:** competency models, interview panels, question sets, screening, candidate evaluation — those belong to downstream agents. No general conversation of any kind (platform guardrails).
- **Operative prompt:** `../../prompts/01-job-description.md` (v1.0, imported from Susan's production prompt 2026-07-18). The prompt is the behavior source of truth; this definition is its contract wrapper.
- **Context loaded at runtime:** platform guardrails (`prompts/system/guardrails.md`) + operative prompt + `../../docs/job-description-question-bank.md` (v2 — the questionnaire it executes).
- **Inputs / triggers:** hiring manager starts a "NEW JOB" session; open brief typed or pasted (transcript ok); Company Info + Function Description pasted when relevant. Schema: `../../schemas/job-description.intake.schema.json`.
- **Outputs / hand-off artifacts (chat-delivered):** final Job Description (Markdown, in-chat) + Intake & Coverage Record (JSON code block, per intake schema — includes a coverage status for every question ID). Persistence is the platform's job: the user saves the artifact via the app's Save action (server writes to `generated/outputs/`; database later). The agent itself never writes files and never claims to.
- **Output shape:** `../../schemas/job-description.output.schema.json`.
- **Authority level:** propose-approve — the JD is generated automatically after the interview, but it is a draft until the human approves/saves it.
- **Quality bar (evals):** questionnaire coverage (every ID statused), fidelity (no invention; every JD claim traceable to intake), JD craft (structure, length, tone, inclusivity per prompt quality standards), coverage-record integrity. Eval set: `../../evals/` (pending).
- **Failure behavior:** insufficient or vague input → ask follow-ups; HM declines → record `skipped`; never guess, never fill gaps silently.
- **Guardrails:** platform guardrails v1 (hard refusal line, non-disclosure, integrity) — prepended at runtime, not duplicated here. `[internal]`-tagged answers never appear verbatim in the JD. No product brand in output until ADR-002 resolves.

## Changelog
- **v2 (2026-07-18):** operative behavior moved to Susan's imported production prompt (`prompts/01-job-description.md`); questionnaire upgraded to v2 (20 sections); coverage record added; file-writing instructions removed (chat runtime delivers, server persists) — resolves the spec/runtime contradiction; one-at-a-time questioning replaced by conversational bundling.
- **v1 (2026-07-11):** initial definition (themes A–I, one-question-at-a-time, file outputs to `examples/`).
