# interview-intelligence

> Internal product name — public brand TBD (see `../../docs/adrs/ADR-002-Product-Naming.md`). Never use "INT²" / "Interview Intelligence" as a customer-facing brand.

The platform's first product: an **AI-powered hiring transformation** that turns a company's hiring from gut feeling into an evidence-based, Big-Tech-grade decision system — delivered through AI executives and specialist agents instead of a multi-year internal build.

**Reference only:** `../../../context/Interview_Intelligence_INT2_Vision.md` (parent workspace) informs the domain but is NOT the product definition. We will write our own: a SaaS platform of a few **specialized agents**, not the sequential workflows that doc describes. The rewrite lands in `docs/` here as the product is defined, agent by agent.

## Agent catalog (Susan's production prompts imported 2026-07-18)

All 10 agents now exist as **prompt + definition + I/O schemas**, runnable in the app via the agent picker (`/api/agents/[slug]`). Verbatim import source: parent `context/agent-prompts-import-2026-07-18.md`. Every agent runs behind the platform guardrails (`prompts/system/guardrails.md`: scope lockdown, hard refusal, non-disclosure).

| # | Agent (slug) | Scope | Status |
|---|---|---|---|
| 1 | Job Description Interactive Agent (`job-description`) | role | 🟢 v2 — Susan's prompt + 20-section questionnaire + coverage record; text + voice E2E |
| 2 | Predictive Competency Builder (`competency-builder`) | role | 📄 prompt+def+schemas · testable in app |
| 3 | Strategic Interview Panel Designer (`panel-designer`) | role | 📄 prompt+def+schemas · testable in app |
| 4 | Structured Interview System Builder (`interview-system-builder`) | role | 📄 prompt+def+schemas · testable in app |
| 5 | Interview Feedback Form Builder (`feedback-form-builder`) | candidate 🔒 Phase 2 | 📄 prompt+def+schemas · testable in app |
| 6 | Hiring Rationale Generator (`hiring-rationale`) | candidate 🔒 Phase 2 | 📄 prompt+def+schemas · testable in app |
| 7 | Manager's Success Blueprint (`success-blueprint`) | candidate 🔒 Phase 2 | 📄 prompt+def+schemas · testable in app |
| 8 | Interview Excellence Coach (`interview-coach`) | interviewer · Phase 2 | 📄 prompt+def+schemas · testable in app |
| A1 | Recruiter Evaluation Report (`recruiter-evaluation-report`) | candidate 🔒 Phase 2 | 📄 prompt+def+schemas · testable in app |
| A2 | Recruiter Screening Guide (`screening-guide`) | role | 🟡 v0.9 DRAFT — source was a prompt *description*; needs Susan's actual prompt |
| — | (Executive persona: AI Head of Talent Acquisition) | — | planned |

Per-agent definition of done still includes example pair + golden set/rubric (`evals/` — pending for all). See `docs/pitch-deck-feature-map.md` for the market-feature mapping.

## Layout
Standard product shape (ADR-001): `agents/` (executives + specialists) · `prompts/` · `schemas/` · `docs/` · `examples/` · `evals/`. No code here — the runtime lives in `../../src/`.

## Definition of done per agent
Definition + schemas + prompts + example pair + golden set/rubric (see `../../docs/agent-specifications/ADS-Template.md`).
