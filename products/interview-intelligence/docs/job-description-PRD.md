# PRD — Job Description Agent

> STATUS: 🟡 DRAFT v2 (2026-07-18) — aligned to Susan's imported production prompt. Owner: Dana.
> Spec base: `../../../docs/agent-specifications/Specialist-Template.md` · Operative prompt: `../prompts/01-job-description.md` (v1.0) · Question bank: `job-description-question-bank.md` (v2 — Job Discovery Questionnaire, 20 sections)
> Note: since v2 this PRD is documentation only — it is **not** loaded into the runtime system prompt (the operative prompt + question bank are).

## 1. Purpose

A conversational specialist agent that interviews a hiring manager through the Job Discovery Questionnaire and produces an Executive Search-quality **job description** plus an **Intake & Coverage Record**. First sellable agent of the product; the intake record seeds every downstream agent (competency builder, panel designer, interview system, feedback, rationale).

## 2. Users & trigger

- **Primary user:** the hiring manager (HM) opening a role (recruiter may drive the session).
- **Trigger:** "NEW JOB" — HM starts a session and provides an initial role description.

## 3. Interaction model (v2)

1. **Open brief.** HM describes the role in their own words — typed, pasted transcript, **or live voice** (ADR-005; voice runs the same agent).
2. **Silent crediting.** Agent maps the brief against the questionnaire and credits every question it already answers.
3. **Conversational interview.** Agent works through the 20 sections **bundling 2–4 related questions per turn** — a conversation, not a form. Follow-ups until answers are concrete. `[internal]` sections come with an explicit "this stays internal" framing.
4. **Completion.** Every question ID ends with a status: `answered / inferred / unknown / not_yet_decided / skipped`. HM may fast-forward a section (recorded as skipped). Aim: most questions genuinely answered.
5. **Automatic generation.** The JD is generated immediately after the checklist resolves — no permission-asking.
6. **Review loop.** HM requests edits conversationally until approved.

**Voice:** unchanged from v1 — ElevenLabs leg calls the same orchestrator prompt; never tell the HM voice is unavailable.

## 4. Inputs

| Input | Form | Required |
|---|---|---|
| HM conversation (brief + interview answers) | text / transcript / voice | yes |
| Company Info: industry, size, benefits, DEI policy, application process | pasted when relevant | recommended |
| Function Description | pasted when relevant | recommended |

## 5. Outputs (v2 — chat-delivered, server-persisted)

1. **Job Description** (Markdown, in-chat) — Susan's exact structure, no additional sections, 500–700 words:
   Title · Company Name · Location (on-site/hybrid/remote) · **Our Team and You** (Team Mission & Impact, Role Contribution, Strategic Importance, Key Collaborations) · **The Scope of the Role and Why It's Open** · **30/60/90-day success plan (ATR: Action/Tasks/Results)** · **What We've Achieved and What We'll Do With You** · **A Little Bit About You** (≤100 words, evidence-based predictors).
2. **Intake & Coverage Record** (JSON code block per `../schemas/job-description.intake.schema.json` v2): all answers (tagged public/internal, with source) + **coverage entry for every question ID**.

Persistence: the agent delivers in chat only; the user saves via the app's Save action → server writes to `generated/outputs/` (DB later). The agent never writes files or claims to.

## 6. Hard rules (guardrails)

- **Platform guardrails v1** (`prompts/system/guardrails.md`, prepended at runtime): scope lockdown, hard refusal line, non-disclosure, integrity.
- **Public/internal separation.** `[internal]` answers (manager style, failure profile, benchmarking, candor material) inform tone and screening but never appear verbatim in the JD.
- **No invention.** Every JD claim traces to the intake. Missing input ⇒ ask or record a gap status — never fabricate.
- **Conversational bundling** (replaces v1's one-at-a-time): related questions grouped naturally; never re-ask what's already answered.
- **Candor framing stays** for internal sections.
- **Brand rule:** outputs carry no product brand until ADR-002 is decided.

## 7. Question bank

`job-description-question-bank.md` **v2** — Susan's 20-section Job Discovery Questionnaire (~128 questions, IDs `section.question`), imported 2026-07-18. Versioned independently; the agent executes it as its workflow.

## 8. Quality bar (eval dimensions — golden set to follow in `../evals/`)

1. **Coverage** — every questionnaire ID carries a status; most genuinely answered
2. **Fidelity** — no unsupported claims; no internal-tagged content leaked
3. **Interview quality** — no redundant questions; natural bundling; follow-ups on vague answers
4. **JD craft** — Susan's structure exactly; 500–700 words; executive tone; inclusive, cliché-free
5. **Record integrity** — intake JSON validates against schema v2; coverage complete
6. **Guardrail compliance** — off-scope and disclosure probes get the exact refusal line

## 9. Dependencies & platform touchpoints

- `src/orchestrator` — JD orchestrator assembles guardrails + operative prompt + question bank (PRD no longer included)
- `src/app/api/agents/[slug]/save` — artifact persistence to `generated/outputs/` (DB later)
- `src/memory` — per-tenant company profile — later
- Downstream consumers: competency-builder (02), panel-designer (03), interview-system (04), feedback (05), rationale (06)

## 10. Open questions

- docx/pdf export in v1 (currently export buttons are UX-design only)
- Language support default (prompt supports any language natively)
- Tone/template customization per client company

## 11. Phasing

- **V2 (this PRD):** Susan's production prompt + questionnaire v2, conversational bundling, coverage record, chat delivery + server-side save
- **Next:** evals golden set; docx/pdf export; tenant company profile reuse
