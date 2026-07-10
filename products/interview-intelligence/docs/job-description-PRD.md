# PRD — Job Description Agent

> STATUS: 🟡 DRAFT v1 — from Dana's intake logic (2026-07-11). Owner: Dana.
> Spec base: `../../../docs/agent-specifications/Specialist-Template.md` · Question bank: `job-description-question-bank.md` (v1, will be enhanced)

## 1. Purpose

A conversational specialist agent that interviews a hiring manager about a new role and produces a complete, evidence-based **job description**, delivered as a file named after the role. First sellable agent of the product; its intake record also becomes the seed input for every downstream agent (competency model, interview kit, scorecard).

## 2. Users & trigger

- **Primary user:** the hiring manager (HM) opening a role.
- **Trigger:** "NEW JOB" — HM starts a session and provides an initial role description.

## 3. Interaction model

1. **Open brief.** HM describes the role and its purpose in their own words — typed text **or an uploaded recording/transcript** (v1 supports recording as input material, not live voice).
2. **Gap analysis.** Agent maps the brief against the question bank and marks each item covered / partial / missing.
3. **Adaptive interview.** Agent asks **only the unanswered questions, ONE at a time**, in a natural order, with branch logic (e.g. new-role vs replacement branches; manager vs IC branch). Never re-asks what the brief already answered.
4. **Manual blocks.** Company Info `[industry, size, benefits, DEI policy, application process]` and Function Description are entered manually (or pulled from tenant company profile once that exists — see §9).
5. **Synthesis & review.** Agent drafts the JD, HM reviews, requests edits conversationally, approves.
6. **Delivery.** Final JD written as a file named after the role (e.g. `Senior-Product-Manager-JD.md`).

**Voice:** live voice conversation with the agent is **Phase 2** (real-time STT/TTS adds infra complexity; per Dana's call, deferred). V1 voice support = accepting an audio recording/transcript as the opening brief.

## 4. Inputs

| Input | Form | Required |
|---|---|---|
| HM conversation (brief + interview answers) | text / recording→transcript | yes |
| Company Info: industry, size, benefits, DEI policy, application process | manual entry | yes |
| Function Description | manual entry | yes |

## 5. Outputs

1. **Primary — the Job Description file**, named `<Role-Title>-JD.<ext>` (format md first; docx/pdf export = open question §10). Draft section structure:
   - Role title · location & work model
   - About the company (from Company Info + mission/values answers)
   - The role — purpose, why it exists / why now
   - What you'll do — top responsibilities + day-to-day scope
   - First 6–12 months — goals & projects owned
   - What success looks like (public-safe rendering of the success-definition answers)
   - Who you'll work with — manager, team, key stakeholders (public-safe)
   - What we're looking for — must-have skills/competencies/experience + traits/mindset
   - Nice to have
   - Growth & development — career path, L&D
   - Benefits · DEI statement · how to apply
2. **Secondary — the Role Intake Record** (structured JSON per `../schemas/job-description.intake.schema.json`): every question-bank answer, tagged public/internal. This is the durable artifact downstream agents consume; the JD is a *rendering* of it.

## 6. Hard rules (guardrails)

- **Public/internal separation.** The interview deliberately collects candid internal material — what didn't work with the previous person, manager's real leadership style, honest team culture, excellent-vs-acceptable bar. This informs tone and emphasis but **never appears verbatim in the JD**. Every intake item carries a `public | internal` tag; the JD renderer may only use `public` content directly.
- **No invention.** Every claim in the JD traces to the intake record or Company Info. Missing input ⇒ ask (during interview) or flag a gap — never fabricate.
- **One question at a time.** Never batch questions; keep the interview conversational.
- **Candor prompts stay.** Where the bank asks the HM to be candid (manager style, team culture), the agent explicitly encourages honesty and explains it stays internal.
- **Brand rule:** outputs carry no product brand until ADR-002 is decided.

## 7. Question bank

Lives in `job-description-question-bank.md` — v1 captured from Dana, grouped into themes A–I with branch logic and public/internal tags. Versioned separately from this PRD because it will be enhanced independently.

## 8. Quality bar (eval dimensions — golden set to follow in `../evals/`)

1. **Coverage** — all bank themes answered or explicitly waived by HM
2. **Fidelity** — no unsupported claims; no internal-tagged content leaked
3. **Interview quality** — no redundant questions (asked something the brief already answered = fail)
4. **JD craft** — clear, specific, jargon-free, sells the role honestly
5. **Measurability** — success section contains the 12/24/36-month measurable outcomes

## 9. Dependencies & platform touchpoints

- `src/orchestrator` — session/state for a multi-turn interview (first real runtime requirement)
- `src/api` — session start, file retrieval
- `src/memory` — per-tenant company profile (lets Company Info be remembered, not re-typed) — later
- `src/evaluation` — runs `../evals/` golden set
- Downstream consumers of the intake record: competency-model, interview-kit, scorecard agents (planned)

## 10. Open questions

- Output file format(s): md only vs docx/pdf export in v1
- Language support (English-only v1?)
- Tone/template customization per client company
- Where HM review happens in v1 (chat loop vs edited file re-upload)
- Phase 2: live voice conversation — scope and stack

## 11. Phasing

- **V1 (this PRD):** text interview + recording-as-input, gap-driven one-at-a-time questioning, md file output, intake record JSON
- **Phase 2:** live voice conversation, docx/pdf export, tenant company profile reuse, JD tone templates
