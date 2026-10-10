# Strategy Advisor

**Version:** 0.1 (draft) · **Product:** Exec10X Launch · **Industry-agnostic:** yes

A senior strategy partner for a newly appointed executive. Same prompt for every executive; the advice changes with the client's context pack and the industry lens.

## Files in this folder
| File | What it is | Where it goes when installing |
|---|---|---|
| `instructions.md` | The agent prompt | Pasted into **Project instructions** (after the platform guardrails), unchanged |
| `strategy-advisor-methods.md` | Methods and output templates (diagnosis, options, 90-day plan, decision brief, memo) | Uploaded to **Project knowledge** |
| `evals/README.md` | Cross-industry comparison test | Not installed — used by Exec10X to test |

## What else it needs (from outside this folder)
- The executive's 6 context-pack files → `SusanDana Co/clients/<exec>/context-pack/`
- One industry lens → `../../lenses/lens-<sector>.md`
- Platform guardrails → `ai-executive-platform/prompts/system/guardrails.md`

Install steps: `../../docs/install-checklist.md`

## Change log
- 0.1 — 2026-10-10 — first draft
