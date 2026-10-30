# PRD — Job Description Agent

> STATUS: 🟡 DRAFT v4 (2026-10-29) — Exec10X role briefing. Owner: Dana. v4 = Dana's reorganised spec (2026-10-29) on top of v3 (2026-10-17); see Changelog.
> Sources: `input/Dana to add.docx` (opener + diagram), [Questions for the Hiring Manager _JD](https://docs.google.com/document/d/1iHRI8gmjBqmoriF2abr2U2steq3BoEk2AzlpR4jisIg/edit), [EXEC10 EX JD](https://docs.google.com/document/d/14NTmJjPbGbYvdBTvRuVtbpCi1JNhm7hkGXK7s5loljY/edit). Analysis and decision log: `(C) job-description-v3-gap-analysis.md` (D1–D10), UI: `../../../docs/platform-architecture/(C) UI-Redesign-Mockup-Review.md` (U1–U8). Platform rules: ADR-010 (accounts), ADR-011 (credits, locked roles), `docs/customer-journey.md`, `docs/guardrails.md`, `docs/evals.md`.
> Since v2 this PRD is documentation only — it is not loaded into any system prompt.

## 1. Purpose

Step 1 of the customer journey. A conversational agent runs a short **role briefing** with the hiring manager, one question at a time, and produces an Executive Search-quality **job description** in the Exec10X format, which the named hiring manager approves. The approved JD is the input to Step 2 (the interview kit, which will also produce the confidential recruiter brief — D2).

## 2. Users and preconditions

- **Hiring manager (HM)** — answers the briefing; the only person who can approve the JD.
- **Company users** — open the role, view, comment; any of them may run the briefing on the HM's behalf.
- **Preconditions (ADR-011):** the role was opened with one credit; its **title and annual salary range are locked**; the HM is named. The company may carry **company documents** (customer profile: about, values, culture, other hiring material — visible to the customer) and an admin-attached **Company Intel** report (hidden from the customer).

## 3. Flow

### 3.1 Brief (the interview)
1. **Opener — fixed text, shown by the platform** (not written by the model), on text and voice (ElevenLabs first message):
   > This is a short role briefing. I'll ask one question at a time, so we can go deep where it matters. You can type your answers or speak to me, whichever is easier.
   > When we're done, your answers will become two things: a job description ready to take to market, and a confidential recruiter brief to help assess candidates. If anything should stay out of the public job description, just say so.
   > Before we start: if you have an existing job description, please attach it. You're also welcome to share leadership behaviours, a culture manifesto, or any other internal documents you use in hiring. They're optional, but they help me skip questions you've already answered.
   > Let's start with the big picture. In your own words, what is this role, and why does it exist right now? Rough notes are fine.
   *(Open with Susan: the second sentence promises the recruiter brief, which arrives in Step 2.)*
2. **Start options (U7):** upload documents first · talk (live voice) · type. Upload stays available throughout; switching never loses answers.
3. **Questionnaire v3 (D1), loaded 2026-10-29:** Susan's 11 sections / 68 questions (`job-description-question-bank.md`), plus 3 added questions (4.8 scope in numbers; 5.7 Executive Committee; 6.8 why people struggled — internal) and a 6–12-month probe on 2.1. **One question per turn, or two only when directly connected; never more** (Dana, v4). Light, short, conversational questions. Answers already given — in the brief, a document or company context — are credited, never re-asked; credited company-level answers are briefly confirmed.
4. **Context the agent receives (server-side only):** locked title + salary range; company documents (visible); attached Company Intel / company context incl. the culture map (hidden — never quoted, cited or mentioned). **v4:** the company context is used to find answers: questions it genuinely answers (culture, behaviours, environment, decision style) are credited `inferred`, source `context`, and not asked; the opening playback may reflect the company's public profile from it, never a confidential detail. The HM wins; their answer replaces an inferred one.
4a. **Persona (v4):** a Senior Partner of a top-five executive search firm. Professional, concise, polite; short sentences; focused on the task — like talking to Susan.
4b. **Irrelevant input (v4):** declined politely in one sentence and never recorded.
4c. **Off-topic and "how do you work" (v4):** two courteous replies ("I'm here only to help with the job description…" / "How I work is part of Exec10X's proprietary method…"), then back to the briefing. Every such moment, and keyword-detected injection attempts, is logged to `security_flags` and listed on the admin "Flagged activity" page (`/internal/flags`). Email alerts: TODO (needs an email service).
5. **Locked role:** title and salary are never asked. If answers describe a different job, the agent says this workspace covers only [title] and suggests opening a new role.
6. **Confidentiality:** the HM may mark anything as "keep out of the public JD" at any time; the agent acknowledges in one sentence and stores it as confidential. The Manager section and the failure-profile question are always confidential.
7. **Documents (D9):** role documents are mined for answers; values / culture / leadership documents also prompt the agent to **offer to save them to the company documents** (customer confirms), reused on every later role.
8. **Progress (U2, U3):** the panel shows the 11 sections and their questions (questions visible for now, behind one setting) and a completeness percentage = share of question IDs with a final status. **"Generate job description" unlocks at 80 %.** When every question has a status, the agent says the briefing is complete and points to the button (v4: the interview never writes the document). A document that covers everything → the agent says so and that the JD can be generated now; a partial one → it says it helped and continues from the gaps (text and voice).

### 3.2 Draft
9. A separate **JD writer** call — `prompts/01a-jd-writer.md`, Susan's template (`input/EXEC10 EX JD.md`), model Opus 5.5 (`docs/models.md`); the interview prompt never carries the template — reads the stored answers, the transcript and the full company context and writes the **Exec10X Executive Role Description**. The company context feeds Business & Leadership Context and the Leadership Approach (from the culture map and contextual skills), informing without exposing confidential specifics; missing essentials are marked `[To confirm: …]` for the HM:
   - Header: Title (locked) · Company · Location · Reporting to · Scope · Executive Committee · Salary range only if "show on JD" was ticked.
   - 1 The Opportunity (3–5 sentences) · 2 Business & Leadership Context (100–150 words, from company context) · 3 Your Mandate (**up to 6** accountabilities, never padded — D7) · 4 What Success Looks Like (2 × 6–12 months, 3 × 12–24 months; no invented targets) · 5 What You Bring (4–5 essentials, Leadership Approach paragraph, up to 3 additional) · 6 About [Company] (3–4 sentences, from company documents; offered back to them if written fresh).
   - 650–900 words. Senior, direct, no clichés. Client's name only — never Exec10X or SusieBrain. Confidential answers never used.
10. **Review in sections (U-mockup):** edit any section directly or ask the agent to revise; each save is a new version; **max 20 draft revisions** per role.

### 3.3 Approve
11. **Only the named HM approves** (D8: the JD has its own approval). Approval locks the version; any later change = **reopen** → next version.
12. Role status: interviewing → draft → approved (locked) → reopened.
13. **Downloads (v4, replaces U5):** branded Word + PDF (title, company, Role ID in the footer) for every version from 80 % readiness, i.e. as soon as a JD exists, not only after approval. Export itself is the next build item (D10). On approval, Step 2 unlocks.

## 4. Data
- `intake_answers`: + `visibility` (public | confidential), + source `company-intel` / `company-document`. Question IDs from bank v3 (old v2 sessions were deleted at the ADR-010 switch — no migration).
- Company documents: `company_documents` (customer-visible), Company Intel via `companies.intel_company_id` (hidden).
- Roles: locked facts and HM from ADR-011; + JD status and revision count.
- Every version kept (eval material: draft vs approved).

## 5. Prompts (three, split by step)
| Prompt | Carries | Never carries |
|---|---|---|
| `01-job-description.md` (v2.0, built) | guardrails, interview rules, questionnaire v3, opener follow-up rules, confidentiality + drift rules | the JD template |
| `01a-jd-writer.md` (v1.0, built) | guardrails, Exec10X template + writing standards, context-use rules | the questionnaire, interview rules |
| (Step 2) recruiter brief | — | — |

Server-side checks: every reply scanned for fragments of loaded prompt text (block + log); injection attempts flagged; post-interview drift check.

## 6. Quality bar (docs/evals.md)
- Rubric: `../evals/rubric.md` — **Dana's**, built before the prompts change (scored 1–5 by a separate judge model; Dana spot-checks the judge).
- 10–15 scenarios incl. a vague HM, a difficult HM and an adversarial HM (prompt extraction, role drift); 3 runs each.
- Baseline today's agent first; report before/after for every prompt change; any drop is flagged.

## 7. Build phases
0. Rubric + scenarios + baseline. 1. Brief (interview). 2. Draft (JD writer, sections view, revisions). 3. Approve + export. 4. Guardrails (leak check, injection flags, drift). 5. Measure + Susan test round + ship.

## 8. Open
- **Template vs D7:** Susan's template says "exactly six" accountabilities; D7 (Susan, 2026-10-17) allows fewer, never padded. The writer follows D7 — Susan to confirm.
- Follow-ups in the workspace TODO: voice tuning (ElevenLabs turn-taking, confirm-back), Word/PDF export, email alerts on flags, interview → Sonnet 5.5 after an eval baseline.
- D4 — name of the candidate-facing document ("Job description" in the UI until decided).
- Opener sentence about the recruiter brief (Susan).
- Admin credits UI simplification (TODO).

## Changelog
- **v4 (2026-10-29, Dana):** bank v3 loaded; 1–2 connected questions per turn; top-five-firm persona, concise; company context (culture map) credits answers and shapes the JD; irrelevant input declined and not saved; polite off-topic / IP replies + security flags; separate JD writer on Susan's template (Opus 5.5); downloads from 80 % readiness; model map (`docs/models.md`).
- **v3 (2026-10-17):** Exec10X briefing — fixed opener, questionnaire v3 (68 + 3), company context + documents, locked role facts, per-answer confidentiality, 80 % generate gate, separate JD writer, Exec10X template (up to 6 accountabilities), section review, HM-only approval, Word/PDF on approval. Recruiter brief moved to Step 2.
- **v2 (2026-07-18):** Susan's production prompt + 20-section questionnaire; coverage record; chat delivery.
- **v1 (2026-07-11):** initial definition.
