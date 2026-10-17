# Job Description Agent v3: Gap Analysis & Change Plan (v2)

> STATUS: 🟡 DRAFT v2.1 (2026-10-17). Analysis only — nothing built. Owner: Dana. Supersedes v1 (2026-10-12). v2.1: Susan's and Dana's decisions recorded (§4) and the plan adjusted.
>
> **Sources:**
> - [`input/Dana to add.docx`](../../../../input/Dana%20to%20add.docx) (2026-10-17): new opener + diagram + two links. The v1 doc's third link (Hiring Assessment Generator) is **gone**: the assessment pack is out of scope for this change.
> - [Questions for the Hiring Manager _JD](https://docs.google.com/document/d/1iHRI8gmjBqmoriF2abr2U2steq3BoEk2AzlpR4jisIg/edit) — 11-section questionnaire (local copy: `input/Questions for the Hiring Manager _JD.docx`, identical)
> - [EXEC10 EX JD](https://docs.google.com/document/d/14NTmJjPbGbYvdBTvRuVtbpCi1JNhm7hkGXK7s5loljY/edit) — Exec10X Executive Role Description Template (local copy: `input/EXEC10 EX JD.docx`, identical)
> - Decisions since v1: [ADR-010](../../../docs/adrs/ADR-010-Customer-Accounts-Multi-Tenancy.md), [customer-journey.md](../../../docs/customer-journey.md), [guardrails.md](../../../docs/guardrails.md), [evals.md](../../../docs/evals.md)
> - Current build: prompt `prompts/01-job-description.md` v1.3, question bank v2.1 (20 sections, ~128 IDs), PRD v2, schemas v2, orchestrator, `intake_answers`, board/drawer, voice.

---

## 0. Bottom line

The Susan content has not changed since v1. The context around it has, and that makes the plan **simpler in some places and bigger in others**:

| | v1 (12 Oct) | Now |
|---|---|---|
| Company Intel → JD | Open question; would need its own ADR | **Decided** (ADR-010 §3): attached to the customer company by an admin, hidden, fed into every JD run. Plus the customer's own profile (About, values, culture). |
| Old v2 sessions / ID migration | Needed a `questionBankVersion` | **Moot**: all old JD test data is deleted at the ADR-010 switch. Bank v3 starts clean. |
| Assessment pack | Shaped the Recruiter Brief | **Out of scope.** The brief is still promised by the opener, but now has no downstream consumer to design against. |
| Role facts | Asked in the interview | Title and salary range are **locked when the role is opened** (credit spent). The agent doesn't ask them; it must stay on that role. |
| Approval | Any editor | **Only the named hiring manager** approves; approval locks; a change = reopen = new version; max **20** draft revisions. |
| Output | Markdown in chat | Sections shown and editable; on approval **branded Word + PDF** with title, company and Role ID. |
| Prompt delivery | One big system prompt | Guardrails: **never send the whole method in one call**; load only the current step's logic; check every reply for leaked prompt text. |
| Quality gate | Old eval case (JD scored 72%) | evals.md: before/after scores on 10–15 scenarios, judged against **Dana's rubric**, which doesn't exist yet. |

Net: this is a rebuild of the JD stage into **three steps (Brief → Draft → Approve & export)** with **three separate prompts**, on top of the ADR-010 accounts work.

---

## 1. What the new docs ask for

### 1.1 Opener (fixed copy)
> This is a short role briefing. I'll ask one question at a time, so we can go deep where it matters. You can type your answers or speak to me, whichever is easier.
> When we're done, your answers will become two things: a job description ready to take to market, and a confidential recruiter brief to help assess candidates. If anything should stay out of the public job description, just say so.
> Before we start: if you have an existing job description, please attach it. You're also welcome to share leadership behaviours, a culture manifesto, or any other internal documents you use in hiring. They're optional, but they help me skip questions you've already answered.
> Let's start with the big picture. In your own words, what is this role, and why does it exist right now? Rough notes are fine.

Implies: two outputs, per-answer confidentiality, materials invited up front, first question = role + why now. It replaces today's model-written "Senior Partner" opener (screenshot in the doc).

### 1.2 Questionnaire: 11 sections, 68 questions
Every question exists in today's bank. It is a **cut**, from ~128 IDs to 68.

| New § | Section | From today's § | Cut from that section |
|---|---|---|---|
| 1 | Business Context & Purpose (7) | 1 | why now*, impact if unfilled, contribution to strategy, past examples |
| 2 | Objectives & Expected Outcomes (2) | 2 | projects, results influenced, "exceptional hire" |
| 3 | Current Situation (5) | 4 | — |
| 4 | Decision Making & Scope (7) | 5 | — |
| 5 | Stakeholders & Collaboration (6) | 6 | biggest-impact stakeholders, first-6-months relationships |
| 6 | Manager (7) `[internal]` | 7 | — |
| 7 | Team (8) `[mixed]` | 8 | — |
| 8 | Environment (7) | 9 | markets / segments |
| 9 | Experience & Skills (10) | 10 + 11.1 | — |
| 10 | Company Culture (4) `[mixed]` | 13 | values, success beyond technical |
| 11 | Employee Value Proposition (5) | 18 | — |
| — | **Dropped entirely** | 3 Responsibilities · 11 Competencies · 12 Personal Characteristics · 14 Success Measures · 15 Career Growth · 16 Hiring Criteria · 17 Failure Profile · 19 Benchmarking · 20 Final Reflection | |

\* "Why now" survives inside the opener's first question.

### 1.3 JD format: Exec10X Executive Role Description
Header (Title · Company · Location · Reporting to · Scope · Executive Committee) + six fixed sections: **The Opportunity** (3–5 sentences) · **Business & Leadership Context** (100–150 words, from the Company Context analysis) · **Your Mandate** (exactly 6 accountabilities) · **What Success Looks Like** (2 × 6–12 months, 3 × 12–24 months, never invented) · **What You Bring** (4–5 essentials, Leadership Approach paragraph from the Contextual Leadership Profile, 2–3 additional) · **About [Company]** (3–4 sentences, reusable). 650–900 words. Internal QA checklist + writing standards (never published). Final has no placeholders; missing info is flagged for validation.

### 1.4 Diagram
Company Intelligence → Company Context + Contextual Leadership Profile → **Executive Opportunity Brief** (candidate-facing) + **Executive Assessment** (internal). This change builds the left box; "Executive Assessment" is Step 2 (interview kit), later.

---

## 2. Gap analysis

### 2.1 Interview (Brief step)

| Area | Today | Needed | Gap |
|---|---|---|---|
| Opener | Model writes it (≈5–10 s, wording drifts) | Susan's exact copy | **Render it as fixed platform text** (text chat + ElevenLabs first message). The model's first turn answers Q1. |
| Questionnaire | 20 sections / ~128 IDs | 11 / 68 | Replace the bank. Meter goes 20 → 11 (remove hardcoded `20` in `IntakeProgressPanel.tsx`). |
| Gaps the cut creates for the new template | — | Header **Scope** (numbers), **Executive Committee**, **6–12-month** outcomes, a failure profile for the brief | **Add 3 questions + 1 probe** (recommended): scope in numbers · ExCo membership · "why have people struggled in similar roles?" `[internal]` · probe on 2.1 for a 6–12-month split. **Susan to confirm (D1).** |
| Locked role facts | Asked | Title + salary locked at opening | Inject them; never ask; **drift rule**: if answers describe another job, say this workspace covers only [title] and suggest a new role. |
| Confidentiality | Section tags only | "Just say so" per answer | `intake_answers.visibility` (public / confidential), set by the agent when the HM flags it; Manager section + failure question always confidential. |
| Materials | Single-file upload, mid-stream, all docs treated alike | Invited up front; JD vs values/culture docs | Multi-file upload; classify: role docs → credited answers; values / manifesto / leadership behaviours → role context, and the agent **offers to save them as additional documents in the customer profile** (D9, Dana): stored as company documents, listed on the profile, reused on every later role. Needs a `company_documents` table: customer documents visible to the customer, Intel hidden, admins see all (ADR-010 §1). |
| Company context | None (ADR-009 forbade it) | Attached Intel + customer profile | Server-side injection of the attached Intel report (via `adminDb`, never shown) + profile. Pre-credit company-level questions (§10 Culture, §11 EVP, parts of §8) with `source = company-intel`; the agent **confirms briefly** instead of asking cold. HM wins on role facts; contradictions go to the brief. |
| Prompt size / IP | One ~6K-token prompt holds interview + template + everything | "Load only the logic needed for the current step" | **Interview prompt** = guardrails + interview rules + bank. The template and brief spec are **not** sent during the interview. |
| History | Browser sends the full transcript | Security finding #4 | Server rebuilds history from `messages` and ignores the browser's copy. |
| Voice | Same prompt + channel note | Same | Inherits all of the above. The fixed opener becomes the ElevenLabs first message (≈35 s spoken; consider a shorter voice cut). |

### 2.2 Outputs (Draft step)

| Area | Today | Needed | Gap |
|---|---|---|---|
| JD structure | Susan v1: Our Team and You, 30/60/90 ATR, A Little Bit About You (500–700 words) | Exec10X template (650–900) | New writer prompt, new output schema v3 (6 mandate items; 2 + 3 success outcomes). |
| Second document | Intake & Coverage JSON in chat | **Confidential Recruiter Brief** | **Moved to the Interview Kit phase (D2, 2026-10-17):** the brief is designed and built there, with the approved JD as one of its inputs. In v3 it is a **placeholder**: no writer prompt, no artifact. What v3 must do now: keep confidential and internal answers stored (with visibility) so the brief process can use them later. |
| Generation | One reply holds JD + JSON (90–160 s, truncation retries) | The JD | **A separate JD writer call**, reading the stored answers + company context, not the transcript. Faster, no truncation, and it satisfies the "only the current step's logic" rule. The Phase-3 JSON is dropped (the database already holds it). |
| Header facts | Asked or inferred | Title, company: locked/known | Printed from the role and company records, never generated. Salary printed only if the "show on JD" box was ticked (template has no salary line: add an optional one). |
| "About [Company]" | — | Reusable | From the customer profile; if missing, written once and **offered back to the profile**. |
| 6 accountabilities | — | Exactly 6 | **Up to 6, never padded** (D7, Susan): if the evidence supports fewer, write fewer. Template wording and the QA check change from "exactly six" to "up to six". |
| Placeholders | `[TO CONFIRM]` only in interim drafts | Final has none | Interim drafts keep `[TO CONFIRM]`. Before the final, the agent resolves open items with the hiring manager; anything still unresolved is listed for the HM at approval time (and kept for the future brief). |
| Brand | Prompt still says "brand undecided" | Client's document | Carries the client's name only, never Exec10X or SusieBrain. |

### 2.3 Review, approval, export (Approve step)

| Area | Today | Needed (customer-journey) | Gap |
|---|---|---|---|
| Review | One Markdown blob; edits only by asking the agent | Shown **in sections**, editable **directly or via the agent** | Structured section view + inline edit; agent edits target one section. |
| Revisions | Unlimited | **Max 20 drafts** per role | Count server-side; clear message at the cap. |
| Approver | Any editor/admin (`canWrite`) | **Only the named hiring manager** | Role gets `hiringManagerUserId`; approve route checks it. **Separate approvals per document** (D8, Dana): in v3 only the JD exists; the brief gets its own approval when it is built. |
| Statuses | open/draft/filled/archived on the project | **interviewing → draft → approved (locked) → reopened** (new version) | New role-status field; approved content immutable; reopen creates the next version. Every version kept (eval material). |
| Export | None | **Branded Word + PDF** on approval; title + company printed; **Role ID in the footer** | New build. Adding a document library is **approved** (D10, Dana); I'll still show the chosen package and version before installing. |
| Unlock | Stages 02–04 always visible | Approval **unlocks Step 2** | Hide stages 02–04 for customers until Step 2 is designed (the Assessment Generator replaces them later). |
| Sharing | — | Brief is internal | When the brief is built: share/export routes refuse it outside the company. Not needed in v3. |

### 2.4 Guardrails (guardrails.md, applies to this agent)

| Rule | Status | Needed for v3 |
|---|---|---|
| Refusal rule in every prompt | ✅ platform guardrails | Keep in all three prompts. |
| Split the method across calls | ❌ | Interview / JD writer / brief writer prompts (above). |
| Server-side **leak check** on every reply | ❌ | Compare each reply with the loaded prompt text (n-gram overlap); block + log on a hit. Needed for text **and** voice (the voice reply is spoken; check before streaming). |
| Injection flagging (keywords + cheap model) | ❌ | Flag on the user turn; log with company / user / role / time. |
| Post-interview **drift check** | ❌ | Cheap model compares answers with the locked title; clear mismatch → pause workspace + flag. |
| "Flagged activity" tab + email on high severity | ❌ | Lives in the admin back office (admin.exec10x.ai) — **dependency**, not part of the JD build; log now, show later. |

### 2.5 Quality (evals.md)

| Need | Status |
|---|---|
| 10–15 scenarios incl. vague, difficult, adversarial HMs | ❌ (today: 1 JD case) |
| **Dana's rubric** (`products/interview-intelligence/evals/rubric.md`) | ❌ — reminder already logged; **this change can't be measured without it** |
| Separate judge model, 3 runs per scenario, before/after report | Partly (harness exists) |
| Customer edits (draft vs approved) as eval material | Enabled by "save every version" above |

---

## 3. Plan

Built on the `feat/customer-accounts` branch work, after the ADR-010 switch is live. "Docs lead code": PRD v3 first.

| Phase | What | Depends on | Size |
|---|---|---|---|
| **0. Ready** | ADR-010 switch live · **build the rubric with Dana** + 10–15 scenarios · baseline score of today's agent · PRD v3 · (open: D4 name) | — | S–M |
| **1. Brief (interview)** | Fixed opener (text + voice) · bank v3 (68 + 3 + probe, D1 ✓) · interview-only prompt · locked title/salary injected + drift rule · per-answer confidentiality · company context injection (attached Intel + profile) + pre-crediting · multi-file upload + document classification + "save to company profile" offer (D9) · history rebuilt server-side · meter 11 sections | 0 | M–L |
| **2. Draft (JD writer)** | JD writer (Exec10X template, up to 6 accountabilities, schema v3) · sections view with direct + agent edits · 20-revision cap · interim draft kept · recruiter brief = placeholder only | 1 | M |
| **3. Approve & export** | Hiring-manager-only JD approval · role statuses + reopen/versioning · branded Word + PDF with Role ID (D10 ✓) · stages 02–04 hidden for customers | 2 | M |
| **4. Guardrails** | Reply leak check · injection flagging + logging · post-interview drift check; flagged-activity view waits for the admin back office | 1 | M |
| **5. Measure & ship** | Evals before/after (3 runs each), Dana spot-checks the judge · Susan + Dana test round · deploy | 2–4 | S |

Phases 3 and 4 can run in parallel after phase 2.

### Main files touched
`products/interview-intelligence/`: PRD v3, question bank v3, prompts split into `01-jd-interview.md` / `01a-jd-writer.md` (the brief writer comes with the brief process), schemas (intake v3, output v3), agent definition, evals (rubric + scenarios).
`src/`: `orchestrator/job-description-orchestrator.ts` (three prompts, context injection after the cache breakpoint, writer calls), `shared/intake-answers.ts` (visibility, company-intel source), `db/schema.ts` (visibility; role status, locked title/salary, hiring manager, revision count; artifact kind), opener constants + `StageDrawer` + voice (`voice-token`, `voice-llm/handler`), `Composer` + `upload-parse` (multi-file), `IntakeProgressPanel` + coverage route, review UI (sections + edit), approve/share routes, new export route, guardrail checks in both chat routes.

---

## 4. Decisions

| # | Decision | Who | Outcome (2026-10-17) |
|---|---|---|---|
| D1 | 68 questions replace today's 128; add scope, ExCo, failure profile + 6–12-month probe | Susan | ✅ **Yes** |
| D2 | Recruiter Brief contents | Susan + Dana | ➡ **Moved to the next phase: the Interview Kit (Step 2).** The brief is designed and built there, with the approved JD as one of its inputs. v3 only stores confidential answers (with visibility) for it. |
| D4 | Name of the candidate-facing document | Susan + Dana | ⏸ **TBD.** v3 keeps "Job description" in the UI until decided (one label to change). |
| D7 | Fewer than 6 real accountabilities | Susan | ✅ **Allowed** — up to 6, never padded |
| D8 | One approval for JD + brief, or two | Dana | ✅ **Separate approvals** per document |
| D9 | Values / culture docs uploaded during a briefing | Dana | ✅ **Offer to save them as additional documents in the customer profile** |
| D10 | Word/PDF generation library (new package) | Dana | ✅ **OK** — chosen package + version shown before install |

(D3, D5 and D6 from v1 are settled: company-level Intel; separate writer calls; old sessions deleted at the switch.)

**Follow-up from D2:** the opener (Susan's exact copy) tells the hiring manager the answers become "two things", including the recruiter brief, which v3 won't produce yet. Either keep the copy (the brief arrives later in the process), or trim that sentence until the brief exists. Susan's call.
