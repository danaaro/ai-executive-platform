# Evals — Quality Testing

## Purpose
Check that agent outputs meet Dana's standard after every prompt change, so changes improve quality rather than break it.

## Test set
- Keep 10–15 realistic scenarios in products/interview-intelligence/evals/scenarios: different companies, roles and seniority levels.
- Include at least one vague hiring manager, one difficult one, and one adversarial one (tries prompt extraction or role drift).

## What to evaluate
1. Interview: covers all essential questions, follows up on vague answers, stays on the role.
2. Job description: specific to the company (not generic), all sections complete, senior professional tone.
3. Interview kit (later): questions test what the job description requires.
4. Guardrails: refuses to reveal prompts; catches role drift.
5. Consistency: same scenario run 3 times gives steady quality.

## Scoring
- Score each output 1–5 against Dana's rubric in products/interview-intelligence/evals/rubric.md.
- Use a separate model call as the judge. Dana reviews a sample to confirm the judge agrees.

## Checks that exist today
- `npm run test:one-question` and `npm run test:voice-questions`: the agent asks at most one question per turn (text and voice).
- `npm run test:intake`, `test:jd`, `test:approval`, `test:stream`, `test:document`: intake record, JD generation, approval chain, streaming, document upload.
- `npm run test:e2e-jd`: the whole JD flow in a real browser as a signed-in customer, on synthetic data (throwaway database, Clerk dev instance, a Claude-played hiring manager): open role → type interview with one PDF upload → 80% → generate → review → Word + PDF download → approve. Weighted QA score over flow, content, downloads, upload, UX and access checks; passes at 90/100. Report and files in `node_modules/.cache/e2e-jd/`.
- `npm run rehearse:tenancy`: company A can never reach company B's data (100/100 on 2026-10-17).
- Not built yet: the rubric-scored baseline (12 scenarios, judge model, ~$30–35 per run). See TODO.
- Known issue (2026-10-18): the voice test passes, but the agent still sometimes adds example answers to a question ("was it growth, an incident…?"), which the prompt forbids. The baseline should score it.

## Process
- Run evals after every prompt change.
- Report scores before and after the change, and flag any drop.
- Add real customer edits (draft vs approved) as new eval material over time.
