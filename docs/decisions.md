# Agent behaviour decisions

One line per change to how an agent behaves: date, what changed, why, and the prompt file it lives in. Newest first.

| Date | Decision | Why | File |
|---|---|---|---|
| 2026-10-18 | JD agent studies all context before the first question (role facts, company documents, role documents, Intel), opens with a "what I already know" summary, never asks what the context answers, confirms only in an "I already know" tone; context answers are credited `answered` / `inferred` with source `document`. | Many answers are already in the documents; the hiring manager should feel the agent knows the company. | products/interview-intelligence/prompts/01-job-description.md (Phase 0, v1.4) |
| 2026-10-18 | Company Intel is never credited as an answer or used in the opening summary. | It is hidden from the customer; crediting it would show its content in their progress list. | 01-job-description.md, docs/guardrails.md |
| 2026-10-18 | Behaviour rules removed from code (role-context.ts) and the voice opening line moved to a prompt file. | CLAUDE.md: behaviour lives only in prompt files. | 01-job-description.md, 01-job-description-voice-opener.md |
| 2026-10-18 | Every change or decision updates its home file (prompt, customer-journey, guardrails, evals, decisions) before a task is finished; each task ends with a changed-files report. | Docs stay the source of truth instead of drifting behind the code. | CLAUDE.md |
| 2026-10-18 | Agent behaviour lives only in server-side prompt files; code never hardcodes it. | Dana can see and change behaviour in one place. | CLAUDE.md |
