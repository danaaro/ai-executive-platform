# interview-intelligence

> Internal product name — public brand TBD (see `../../docs/adrs/ADR-002-Product-Naming.md`). Never use "INT²" / "Interview Intelligence" as a customer-facing brand.

The platform's first product: an **AI-powered hiring transformation** that turns a company's hiring from gut feeling into an evidence-based, Big-Tech-grade decision system — delivered through AI executives and specialist agents instead of a multi-year internal build.

**Reference only:** `../../../context/Interview_Intelligence_INT2_Vision.md` (parent workspace) informs the domain but is NOT the product definition. We will write our own: a SaaS platform of a few **specialized agents**, not the sequential workflows that doc describes. The rewrite lands in `docs/` here as the product is defined, agent by agent.

## Agent catalog (planned, ~5–6 sellable specialists)

| Agent | Status |
|---|---|
| **Job Description** | 🔨 FIRST BUILD — PRD in `docs/job-description-PRD.md` |
| Competency Model | planned |
| Interview Kit / Panel Design | planned |
| Scorecard & Debrief | planned |
| Screening | planned |
| (Executive persona: AI Head of Talent Acquisition) | planned |

Catalog to be confirmed against the vision doc's agent list during PRD work.

## Layout
Standard product shape (ADR-001): `agents/` (executives + specialists) · `prompts/` · `schemas/` · `docs/` · `examples/` · `evals/`. No code here — the runtime lives in `../../src/`.

## Definition of done per agent
Definition + schemas + prompts + example pair + golden set/rubric (see `../../docs/agent-specifications/ADS-Template.md`).
