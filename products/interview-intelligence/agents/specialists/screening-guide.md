---
name: screening-guide-agent
description: Independent assistant: generates a role-tailored recruiter screening interview guide (5-step flow) from the JD + competency framework. DRAFT — needs Susan's actual prompt.
---

## Agent definition (per `../../../../docs/agent-specifications/Specialist-Template.md`)

- **Name / id:** screening-guide-agent
- **Role type:** specialist (independent assistant)
- **Product:** interview-intelligence
- **Task contract:** from JD + competency framework, generate a screening guide in the strict 5-step sequence (Introduction, Career Context, Critical Skills Assessment, Motivational Fit, Logistics & Closing), each with intent, tailored behavioral questions, and evidence-to-look-for; sized to the call length.
- **Non-goals:** deep technical assessment, panel-stage question sets (that's the Interview System Builder), candidate evaluation.
- **Operative prompt:** `../../prompts/10-screening-guide.md` (v0.9-draft — 🟡 NEEDS-SUSAN-REVIEW: source was a prompt description, not prompt text).
- **Inputs:** JD + competency framework (+ call length, language). Schema: `../../schemas/screening-guide.input.schema.json`.
- **Outputs (chat-delivered):** the screening guide (Markdown). Shape: `../../schemas/screening-guide.output.schema.json`.
- **Personal data:** none (role-scoped) — usable in Phase 1 contexts, catalogued as independent assistant.
- **Quality bar (evals):** questions target framework competencies verbatim; behavioral not hypothetical; usable live in the stated call length.
- **Failure behavior:** missing JD or framework → ask; never generate generic guides.
- **Authority level:** propose-approve — output is a draft until the human approves/saves.
- **Context loaded at runtime:** platform guardrails + operative prompt.
- **Guardrails:** platform guardrails v1 (hard refusal, non-disclosure, integrity) — runtime-prepended.

## Changelog
- **v1 (2026-07-18):** imported from Susan's production prompts (PROMPTS.docx).
