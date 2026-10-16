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

## Process
- Run evals after every prompt change.
- Report scores before and after the change, and flag any drop.
- Add real customer edits (draft vs approved) as new eval material over time.
