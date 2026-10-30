# Models — which Claude model each feature uses

> STATUS: 🟢 v1 (2026-10-29, Dana: "the right model for every part, never the heaviest where it isn't needed").
> The code reads every choice from `src/shared/models.ts`; change it there, and update this table.

## Principle
- **Haiku** for high-volume, simple judgments (classify, count, match).
- **Sonnet** for conversation and reading at volume, where speed and cost per turn matter.
- **Opus** only where one output carries the quality of the product, and it runs a handful of times per role or report.
- **Fable** is not used: no task here needs the most capable (and most expensive) model.

## Prices (list, per million tokens, 2026-10)
| Model | Input | Output | Cache read |
|---|---|---|---|
| Haiku 5.5 | $0.10 | $0.50 | ~$0.01 |
| Sonnet 5 / Sonnet 5.5 | $2 | $10 | $0.20 |
| Opus 5.5 | $4 | $20 | $0.20 |
| Fable 5.1 (not used) | $10 | $50 | $0.25 |

## Map
| Feature | Key in `models.ts` | Model | Why |
|---|---|---|---|
| JD briefing turns (text + voice) | `INTERVIEW` | **Sonnet 5.5** (Dana, 2026-10-30) | Many short turns, latency matters, one prompt cache shared by text and voice. Thinking off for speed via `between_tools` (`THINKING_OFF`): Sonnet 5.5 rejects `disabled`. First token ~1.1s measured. |
| Other step agents (competencies, panel, kit…) | `STEP_AGENTS` | **Sonnet 5.5** | Same profile as the interview. |
| **JD writer** (draft + revisions) | `JD_WRITER` | **Opus 5.5**, effort high | The candidate-facing deliverable. Runs once per role plus revisions (max 20), so about $0.10–0.20 per draft. Falls back to Sonnet if it refuses. |
| Progress meter fallback | `METER` | Haiku 5.5 | Section coverage from a transcript: simple, frequent. |
| Security flags | — (no model) | — | Detected from the agent's own polite replies + keyword rules, at zero cost. `GUARD` (Haiku 5.5) is reserved if a model check is ever needed. |
| Company Intel research | `INTEL_RESEARCH` | Sonnet 5 | Web search and reading at volume. |
| Company Intel cockpit writers (v3) | `INTEL_WRITER` | Sonnet 5.5 | Dana 2026-10-10: Opus was too slow for the 300s limit. |
| Company Intel synthesis (v1/v2, legacy) | `INTEL_SYNTHESIS` | Opus 5.5 | Old report format only. |
| Persona photos / logos | `INTEL_PHOTOS` | Sonnet 5 | Uses web tools Haiku lacks. |

## Planned change
- ~~Interview and step agents → Sonnet 5.5~~ **Done 2026-10-30** (Dana's preference). Still to do: the rubric eval baseline on 5.5 (docs/evals.md).
