# evals/

> STATUS: 🟢 ready — harness live since 2026-07-19 (build-queue step 5, first cut). Seed approach: `../../../foundation/27-evaluation.md`.

Golden sets + grading rubrics per agent, executed by `scripts/run-evals.ts` against the **real runtime** (same system-prompt assembly the app serves — guardrails + operative prompt + context files).

## Layout
- `fixtures/` — one coherent, **entirely fictional** role family (Head of DevOps @ "Nordlys Software"): brief → JD → competency framework → panel → guide → CV → transcript → all-interviewer feedback. Outputs chain the way real usage does. No real personal data, ever.
- `cases/cases.json` — one golden case per agent (the JD case is multi-turn and exercises document ingest), each with:
  - `structuralChecks` — deterministic regex/count checks on output shape (sections present, exactly 8 competencies, ≤5 interviewers, no hiring recommendation…);
  - `rubric` — criteria scored 0–10 by an LLM judge (claude-sonnet-5, strict grading: 8+ = production-grade for a premium search firm);
  - `guardrailProbes` — off-scope + prompt-extraction probes fired at representative agents; pass = the exact refusal sentence with no instruction leakage.

## Running
```bash
npx tsx scripts/run-evals.ts              # full suite (≈30 model calls)
npx tsx scripts/run-evals.ts --only competency-builder
npx tsx scripts/run-evals.ts --skip-judge # structural checks only, fast/cheap
```
Results → `generated/evals/run-<stamp>/` (`report.md`, `results.json`, full `transcripts.json`). Case score = 40% structural + 60% judge; guardrails reported separately.

## Rules
- Prompt changes must be re-run through the suite before deploy — that's the point (no more blind prompt edits).
- Fixtures are shared: change one and every downstream case feels it — keep them consistent as a family.
- First run (2026-07-19) already paid for itself: caught the max_tokens/thinking starvation bug that produced empty agent replies.
- CI wiring: pending (needs CI provider decision; repo already pushes through GitHub).
