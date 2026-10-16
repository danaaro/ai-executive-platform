# Job Description Agent v3: Gap Analysis & Change Plan

> STATUS: 🟡 DRAFT (2026-10-12). Analysis only, nothing built yet. Owner: Dana. Needs Susan's input on the decisions in §7.
> Sources compared:
> - **Current build:** `prompts/01-job-description.md` v1.3, `docs/job-description-question-bank.md` v2.1, PRD v2, `schemas/job-description.*.json` v2, `src/orchestrator/job-description-orchestrator.ts`, `src/shared/intake-answers.ts`, `src/components/board/StageDrawer.tsx`, `src/components/review/deliverable.ts`, voice handler, ADR-008, ADR-009, `interview-flow-update-plan.md`.
> - **Requested changes:** [`docs/Dana to add.docx`](../../../docs/Dana%20to%20add.docx) and the three Google Docs it links to:
>   1. **New opener**: the copy that replaces the current "Senior Partner" first message (inside the .docx).
>   2. **"Additional Questions"**: [*Questions for the Hiring Manager / attachment prompt 1*](https://docs.google.com/document/d/1iHRI8gmjBqmoriF2abr2U2steq3BoEk2AzlpR4jisIg/edit), an 11-section Job Discovery Questionnaire.
>   3. **"Job description format"**: [*Exec10X Executive Role Description Template* (EXEC10 EX JD)](https://docs.google.com/document/d/14NTmJjPbGbYvdBTvRuVtbpCi1JNhm7hkGXK7s5loljY/edit), with 6 sections and 650–900 words.
>   4. **"Doc"**: [*Hiring Assessment Generator Prompt Pack v5* (QQhiring-framework-generator-prompt.md)](https://docs.google.com/document/d/1_OEVTmjqAa2t4IFEOoHgu4Tu4UW7tEwG0piWFgCjwRQ/edit), the downstream assessment system the JD now has to feed.
>   5. **Diagram** (image inside the .docx): Company Intelligence → Company Context + Contextual Leadership Profile → **Executive Opportunity Brief** (candidate-facing) + **Executive Assessment** (internal).

---

## 0. Bottom line

This goes well beyond a prompt edit. The JD agent changes on five axes:

| # | Axis | Today | Target |
|---|---|---|---|
| 1 | **Deliverables** | JD + Intake & Coverage JSON, in one long chat reply | **Two artifacts**: a candidate-facing JD (Executive Opportunity Brief) and a **Confidential Recruiter Brief**. The coverage record moves server-side. |
| 2 | **Questionnaire** | 20 sections, ~128 questions | 11 sections, **68 questions**, all taken from the current bank. Nothing is new; ~60 are cut. |
| 3 | **JD structure** | Susan's v1: Our Team and You, 30/60/90 ATR, A Little Bit About You (500–700 words) | Exec10X template: header block + Opportunity · Context · **6-item Mandate** · Success · What You Bring · About (650–900 words) |
| 4 | **Upstream input** | None. ADR-009 explicitly forbids linking Company Intel to the JD. | Company Intelligence feeds the Context section, the Leadership Approach paragraph and the About section. **This reverses ADR-009 §2 and needs ADR-010.** |
| 5 | **Confidentiality** | Fixed per-section tags (`[public]/[internal]/[mixed]`) | Section tags **plus a per-answer flag the hiring manager controls** ("If anything should stay out of the public JD, just say so") |

The biggest hidden gap is that **Susan has not defined the Confidential Recruiter Brief.** The opener promises it, and the Assessment Generator consumes it (`<confidential_brief>`, which "beats the JD for role facts"), but there is no template for it. §5 proposes one for her to sign off.

The good news: this is exactly the "Item 1: new agent prompts" in `interview-flow-update-plan.md`, which was blocked waiting for this text. The cut questionnaire also resolves that plan's deferred risk (one question per turn × ~128 questions ≈ a 150-turn interview).

---

## 1. What exists today (baseline)

**Flow**
1. The board's JD stage opens and the drawer **auto-fires** `INTAKE_START` (`StageDrawer.tsx:157-171`). The model generates its own opener: "I'll be running this intake as a Senior Partner…"
2. Phase 1 is one question per turn on every channel (v1.3). The agent credits answers given in passing and emits a hidden `[INTAKE ANSWERS]` JSON block per turn, which is stripped and upserted into `intake_answers` (status + source).
3. Document ingest is mid-stream: an upload or paste is swept against the whole bank and credited as `source=document`. Uploads are **single-file** (`Composer.tsx`, `/api/upload-parse`).
4. Progress meter shows `n / 20` sections. The placeholder count of 20 is hardcoded in `IntakeProgressPanel.tsx:44,48`.
5. Phase 2 starts when every question ID has a status: one reply containing the JD (Markdown) **and** the Phase 3 Intake & Coverage JSON. That reply takes 90–160s and needs `max_tokens 16384` plus a no-thinking retry.
6. The interim draft (`[PLATFORM ACTION: INTERIM DRAFT]`) depends on a three-way contract between the guardrails, Phase 2's exception and `deliverable.ts`.
7. Save → `findDeliverable()` (rejects turns where >35% of lines are questions) → artifact v1 → approve (ADR-008) → inherited by competency-builder, panel-designer and interview-system (`inheritance.ts`).

**Quality baseline:** evals run 2026-09-05: agent quality 88.3%. **The JD case was the weakest at 72%**, so that is the number v3 has to beat.

**Known drift, already logged (alert H):** ADR-002 accepted SusieBrain, yet the prompt still says the brand is undecided.

---

## 2. Gap analysis: opener

| New copy says | Today | Gap / change |
|---|---|---|
| "This is a short role briefing" | "comprehensive Hiring Manager discovery interview" | Change of tone throughout: briefing, not interrogation. The persona name-dropping (Spencer Stuart, Lou Adler…) stays internal and never surfaces. |
| "One question at a time… type or speak" | Already true (v1.3, voice ADR-005) | ✅ No change |
| "Two things: a JD ready for market, and a confidential recruiter brief" | One output plus a JSON record | ❌ **New deliverable** (see §5) |
| "If anything should stay out of the public JD, just say so" | Section tags only; the HM cannot mark an answer confidential | ❌ **Per-answer visibility** (see §6.3) |
| "Attach an existing JD, leadership behaviours, culture manifesto, internal hiring docs" | Upload exists but is never invited, is single-file, and every document is treated the same | ❌ Invite materials up front, allow multi-file, **classify documents** (role docs vs company values docs). Values feed the Assessment Generator's `<company_values>` input and must be stored, not just mined. |
| "They help me skip questions you've already answered" | Already credits documents | ✅ Keep it. Add Company Intel as a second credit source. |
| First question: "what is this role, and why does it exist right now?" | "describe the role and its purpose… as much detail as you'd like" | Merges Q1.1 and Q1.2 and adds "why now" (old 1.7, which the new bank cut). |

**Recommendation: render the opener as fixed platform copy, not model output.** Today the model writes its own opener, so the wording drifts and costs one model turn (about 5–10s) before the HM sees anything. Show Susan's text verbatim as the first assistant message. The model's first real turn then responds to the HM's answer. On voice, set the same text as the ElevenLabs first message (`voice-token/route.ts`). It runs about 35s spoken, so a shorter voice cut is worth considering.

---

## 3. Gap analysis: questionnaire (20 sections → 11 sections)

Every one of the 68 new questions already exists in bank v2. **The new bank is a cut and a re-sequence, not an addition.**

### 3.1 Mapping

| New § | Section | From old § | Kept | Cut from the old section |
|---|---|---|---|---|
| 1 | Business Context & Purpose | 1 | 1.1–1.6, 1.9 | 1.7 why now*, 1.8 impact if unfilled, 1.10 contribution to strategy, 1.11 past examples |
| 2 | Objectives & Expected Outcomes | 2 | 2.1, 2.4 | 2.2 projects, 2.3 results influenced, 2.5 "exceptional hire" |
| 3 | Current Situation | 4 | all 5 | — |
| 4 | Decision Making & Scope | 5 | 5.2–5.7 (6) | 5.1 "level of authority" folded in |
| 5 | Stakeholders & Collaboration | 6 | 6.1–6.4, 6.7, 6.8 | 6.5 biggest impact on success, 6.6 first-six-months relationships |
| 6 | Manager `[internal]` | 7 | all 7 | — |
| 7 | Team `[mixed]` | 8 | all 8 | — |
| 8 | Environment | 9 | 9.1–9.3, 9.5–9.8 | 9.4 markets / segments |
| 9 | Experience & Skills | 10 + 11.1 | all of 10, plus "competencies of highest performers" | — |
| 10 | Company Culture `[mixed]` | 13 | 13.1, 13.3–13.5 | 13.2 values, 13.6 success beyond technical |
| 11 | Employee Value Proposition | 18 | all 5 ("stay with the company / in this team") | — |
| — | **Cut entirely** | 3 Responsibilities · 11 Competencies · 12 Personal Characteristics · 14 Success Measures · 15 Career Growth · 16 Hiring Criteria · 17 Failure Profile · 19 Benchmarking · 20 Final Reflection | | |

\* "Why now" survives inside the opener's first question.

> Note: section 4 in the new doc lists 6 bullets (authority → approval → resources → execute/create → ambiguity → execution vs strategy). "Level of authority" is the first of them, so 5.1 is kept. I counted 68 questions in total.

### 3.2 Gaps the cut creates against the NEW JD template

The new template needs information the new questionnaire no longer asks for:

| Template needs | Old source (now cut) | New source / fix |
|---|---|---|
| **Header: Scope** (revenue, employees, geographies) | 9.4 markets (cut); 8.2 team size partly | ❌ **Add 1 question**: "What is the scope of this role in numbers?" (or credit it from Company Intel plus team size) |
| **Header: Executive Committee** member | Never asked | ❌ **Add 1 question** (yes/no; one question per turn still holds) |
| **§3 Mandate: exactly 6 accountabilities** | Old §3 Responsibilities (cut) | Derive from 1.6 problem, 2.1 outcomes, 3.x challenges, 4.x decisions. Risk: a role with only 4 real accountabilities gets padded to 6, which conflicts with "never invent". **Rule needed:** if fewer than 6 are evidenced, ask one follow-up; otherwise flag it for validation in the brief instead of padding. |
| **§4 Success: 6–12 months vs 12–24 months**, measurable | Old §14 Success Measures (cut) | 2.1 asks for 12–18 months, which is a different horizon. ❌ **Add 1 follow-up**: "What has to be true by month six to twelve?", plus a probe for numbers. The template says never invent targets, so missing metrics become `[validate]` items in the brief. |
| **§5 Additional Experience** (non-essential) | 10.7 | ✅ new 9.x |
| **§5 Leadership Approach** (Contextual Leadership Profile) | Old 11, 12 (cut) | From Company Intel (Tab 2, Contextual Skills) + new §6 Manager + §7 Team + §10 Culture. Without Company Intel it is thin. |
| **§6 About Company** (factual, reusable) | Company Info paste | From the Company Intel record. Without it, ask once and store it on the company. |

### 3.3 Gaps the cut creates against the downstream Assessment Generator

| Generator needs | Old source (cut) | Impact |
|---|---|---|
| Top hiring risks, failure modes | §17 Failure Profile | Recruiter Brief loses its "why people fail here" section. **Recommend keeping 17.1** ("Why have people struggled or failed in similar roles?") as one `[internal]` question; it is the highest-value candor question in the old bank. |
| Non-negotiables vs "can be compensated" | §16 Hiring Criteria | New 9.x has essential vs desirable, which is enough for Call A. Accept the cut. |
| Mutual Fit: motivation | §12, §15 | EVP (new §11) covers the company side. Accept the cut. |
| Benchmarking / where candidates come from | §19 | Recruiter sourcing loses a signal. Accept the cut (it can live in the search strategy, not the JD). |

**Net recommendation:** adopt Susan's 68 questions as bank v3 and **add 3**: scope in numbers, ExCo membership, and failure profile (17.1 reworded). Also attach the 6–12 month follow-up to 2.1 as a probe, not as a separate ID. Total: **71 IDs, 11 sections.** Susan to confirm (§7, D1).

### 3.4 Section handling tags for v3

| Tag | Sections |
|---|---|
| `[public]` | 1, 2, 3, 4, 5, 8, 9, 11 |
| `[internal]` | 6 Manager, plus the new failure question |
| `[mixed]` | 7 Team, 10 Culture, and 5.5 "challenging stakeholder relationships" (should default to internal) |

On top of the tags, **any answer the HM flags as confidential becomes `internal`**, whatever its section tag says (§6.3).

### 3.5 ID migration

Every ID renumbers (old Manager 7.x → new 6.x, and so on). Existing `intake_answers` rows and live conversations are keyed on v2 IDs.
**Recommendation:** add `questionBankVersion` to `conversations`. In-flight v2 sessions finish on v2 and new sessions start on v3. No row remapping; it is not worth the risk for a handful of test sessions.

---

## 4. Gap analysis: JD output (Susan v1 structure → Exec10X template)

| | Today (prompt v1.3 / output schema v2) | Exec10X template |
|---|---|---|
| Header | Title · Company · Location | Title · Company · Location · **Reporting to** · **Scope** · **Executive Committee** |
| 1 | Our Team and You (4 subsections) | **The Opportunity**: 3–5 sentences, why now |
| 2 | Scope of the Role and Why It's Open | **Business & Leadership Context**: 100–150 words, *from the Exec10X Company Context analysis*, one narrative |
| 3 | 30/60/90 ATR plan | **Your Mandate**: **exactly 6** accountabilities |
| 4 | What We've Achieved / What We'll Do With You | **What Success Looks Like**: 2 outcomes (6–12 months) + 3 (12–24 months), never invented |
| 5 | A Little Bit About You (≤100 words) | **What You Bring**: Experience 4–5 · Leadership Approach paragraph · Additional 2–3 |
| 6 | — | **About [Company]**: 3–4 sentences, reusable |
| Length | 500–700 words | **650–900 words** |
| QA | Quality-standards list | Internal content-quality checklist + writing standards. Must be stripped from output. |
| Missing info | `[TO CONFIRM]` only in an interim draft | "Flag missing info for validation"; the **final** contains no placeholders |

Changes this forces:
- **Prompt Phase 2** is rewritten around the template. Paste the template's instructions and writing guidance near-verbatim (same discipline as the Exec10X master prompt: Susan's text kept verbatim).
- **`job-description.output.schema.json` → v3**: new header fields, a `mandate` array with `minItems: 6, maxItems: 6`, `success.near[2]` and `success.long[3]`, `whatYouBring.{experience[4–5], leadershipApproach, additional[0–3]}`, `aboutCompany`.
- **Final vs interim contradiction:** the template says "remove all placeholders"; the interim-draft contract requires `[TO CONFIRM]`. Resolution: an interim draft keeps placeholders. A final JD carries none, and every unresolved item moves to the Recruiter Brief's "Open questions / to validate" table. Document this in the guardrails clause and in Phase 2.
- **Naming:** the diagram says "Executive Opportunity Brief", the template says "Executive Role Description", and the UI and opener say "job description". Pick one for the board stage and artifact label (§7, D4).
- **Brand:** the template is titled "Exec10X". The JD is the *client's* candidate-facing document, so it must carry the client's name only and never Exec10X or SusieBrain. Fix the stale "brand undecided" line in the prompt at the same time (alert H).
- **Language rule** (native-quality non-English) stays.
- **Downstream:** competency-builder, panel-designer and interview-system inherit the approved JD as text. They will still read it, but their prompts reference the old sections ("30/60/90", "A Little Bit About You"). Grep and patch them, or accept that they are being replaced by the Assessment Generator (§6.8).

---

## 5. New deliverable: Confidential Recruiter Brief (spec gap)

**What we know:** the opener promises it. The Assessment Generator takes it as `<confidential_brief>`, rule 4 says *"For role facts, the Brief beats the Job Description"*, and Call 2 lists the "Role inputs" it expects. Brief material is marked `[Internal]`.
**What we don't have:** a template. Proposed structure, derived from what the Generator consumes (Susan to approve):

> **[Company] · [Role] · Confidential Recruiter Brief · [Date] · Internal / Confidential**
> **At a glance**: 3–6 bullets
> 1. **Role facts**: title · level / leveling framework · hiring manager · reporting and dotted lines · team size and direct reports · location / work model / travel · scope · ExCo. Each carries a certainty label: *(confirmed)* · *(our inference)* · *(hypothesis)* · *(unknown, to confirm)*, using the Generator's vocabulary.
> 2. **Why we're really hiring**: new role vs replacement, what worked and what didn't with the predecessor, the business problem, why now.
> 3. **Success outcomes (12–18 months)**: measurable, dated where possible. These seed the Generator's "3–5 success outcomes".
> 4. **Experience requirements**: essential · can be compensated (and by what) · desirable · open-to backgrounds / unconventional profiles.
> 5. **Manager & team (Mutual Fit)**: manager's style, autonomy, feedback cadence, who thrives and who struggles, team norms, behaviours rewarded and not tolerated.
> 6. **What makes this hard here (Company Context)**: current challenges, why unsolved, risks, challenging stakeholders, pace and ambiguity. Merged with Company Intel and clearly sourced.
> 7. **Why a great candidate would say yes**: EVP, plus the likely objections and how to answer them.
> 8. **Why people fail in this role**: the failure-profile answer.
> 9. **Kept out of the public JD**: everything the HM flagged confidential, verbatim summary.
> 10. **Contradictions**: HM vs documents vs Company Intel, flagged and never silently resolved.
> 11. **Open questions for the hiring manager**: Question · Why it matters · Resolve before (blocking items first).

Rules carried over from the Generator's shared base: evidence only; no research names or citations; no inference from protected characteristics; no similarity-based "fit".
Target length: ~800–1,200 words. **Never shareable** through the ADR-008 external share link.

---

## 6. Change list: flow, prompts, code

### 6.1 New end-to-end flow

```
[Company Intel report, approved]  ──(optional, recommended)──┐
                                                             ▼
Board → JD stage opens
  1. Static opener (Susan's copy) + "attach anything you have" (multi-file drop)
  2. Uploads classified: role docs → swept into intake_answers (source=document)
                         values / manifesto / leadership behaviours → company_values store
  3. Company Intel pre-credits company-level questions (source=company-intel, status=inferred)
     → the agent confirms them briefly instead of asking cold
  4. One-question-per-turn interview over bank v3 (71 IDs). HM can flag any answer confidential.
  5. Checklist resolved → platform triggers TWO generation calls (not one mega-turn):
       a. JD writer      → Executive Opportunity Brief (public)   → artifact A
       b. Brief writer   → Confidential Recruiter Brief (internal) → artifact B
     Each call reads the intake_answers table + Company Context + company_values,
     NOT the raw transcript.
  6. Review / edit / approve each artifact separately (ADR-008)
  7. Approved A + B (+ company context + values) feed the Assessment Generator (next phase)
```

Why two calls: it mirrors the Generator's own "one document per call" rule, roughly halves time-to-first-artifact (today's 90–160s single reply is the slowest generation in the suite), removes the truncation retry risk, and lets Save find each document without the `findDeliverable` heuristic guessing.

### 6.2 Prompt changes: `prompts/01-job-description.md` → v2.0

| Section | Change |
|---|---|
| Frontmatter | `version: 2.0` plus a dated adaptation line (the only history the runtime carries) |
| Role / persona | Keep the senior-partner expertise internally. Add: "never name, cite or refer to any research, author, firm or methodology in anything you write". Remove the "brand undecided" line. |
| Mandatory questionnaire | Keep "it is the workflow", but **replace** "Do not shorten it… Do not skip questions because you believe you understand the role" with crediting rules across three sources (HM answers, documents, Company Context). Pre-credited items get a one-line confirm, never a cold re-ask. |
| Phase 1 opening | Delete "Open by asking the HM to describe the role". The platform already showed the opener and Q1, so the first model turn is a reply to the HM's answer. |
| Document ingest | Add classification: role docs vs company values/leadership/culture docs. Values docs are credited to §10 and tagged for the `company_values` store. |
| **New: confidentiality clause** | "The HM may say at any point that something must stay out of the public JD. Mark that answer `visibility: confidential`, acknowledge it in one short sentence, and never use it in the JD. It may be used in the Recruiter Brief. Section 6 (Manager) and the failure question are always confidential." |
| `[INTAKE ANSWERS]` block | Add a `visibility` field (`public`/`confidential`) and source value `company-intel`. Keep the no-fence rule. |
| **New: Company Context handling** | "A Company Context block may follow. Treat it as sourced research, not HM testimony. Use it to pre-credit company-level questions and to write the Context, Leadership Approach and About sections. If the HM contradicts it, the HM wins on role facts; flag the contradiction for the Brief." |
| Phase 2 | Replace the structure and quality standards with the Exec10X template (verbatim instructions and writing guidance, 650–900 words, exactly 6 sections in order, header block). Add the internal QA checklist as a silent self-check. Final JD contains no placeholders; gaps go to the Brief. The interim-draft exception stays, with `[TO CONFIRM]` allowed **only** there. |
| **New Phase 2b** | Recruiter Brief template (§5). If two calls are adopted (recommended), Phase 2 and 2b move into two separate writer prompts (`prompts/01a-jd-writer.md`, `01b-recruiter-brief-writer.md`), and the interview prompt keeps only Phase 1. |
| Phase 3 | **Delete** the in-chat JSON record. `intake_answers` already holds everything; the server serialises the record on demand. This saves several thousand output tokens per completion. |

The guardrails (`prompts/system/guardrails.md`) need two edits: the interim-draft clause covers both artifacts, and "the final artifact carries no placeholders".
The voice note (`voice-llm/handler.ts`) keeps its speaking-style section and adds: "never read the confidential acknowledgement as a list; one sentence".

### 6.3 Data model (`src/db/schema.ts`)

| Change | Why |
|---|---|
| `intake_answers.visibility` (`public`/`confidential`, default from section tag) | HM-controlled confidentiality |
| `intake_answers.source` + `company-intel` | Provenance for pre-credited answers |
| `conversations.questionBankVersion` | v2 → v3 ID migration (§3.5) |
| `projects.companyId` → `companies.id` | Links the role to the Company Intel record (needs ADR-010) |
| `company_values` (or `company_inputs` with `kind='values'`) | The Generator's `<company_values>` input; reusable across roles at the same company |
| `companies.aboutText` | Template §6 is "reusable across executive appointments" |
| `artifacts.kind` (`jd` / `recruiter-brief`) and `artifacts.visibility` | Two artifacts per stage; the share route refuses `internal` |

### 6.4 Code touchpoints

| File | Change |
|---|---|
| `docs/job-description-question-bank.md` → v3 | New 71-ID bank, tags, changelog. Keep the "parenthetical examples are for you" rule. |
| `src/orchestrator/job-description-orchestrator.ts` | Load the bank by version. Inject Company Context + company values as a **second system block after the cache breakpoint** (same trick as the voice note), so the shared base stays cacheable. Add the two writer calls. Drop the "Phase 3 JSON" runtime note. |
| `src/shared/intake-openers.ts` / `StageDrawer.tsx` / `agents/page.tsx` | Static opener message (Susan's copy) as one exported constant. Stop auto-firing a model turn. Materials-first panel (plan item 3). |
| `voice-token/route.ts`, `voice-llm/handler.ts` | ElevenLabs first message = the opener. The voice note updates. |
| `Composer.tsx`, `/api/upload-parse` | `multiple`, `form.getAll("file")`, per-file status, doc-type classification. Enable upload during live voice. |
| `src/shared/intake-answers.ts` | Parse `visibility` and `company-intel`. Allow the new source in `SOURCES`. |
| `IntakeProgressPanel.tsx` | Remove the hardcoded 20; section count comes from the parsed bank (11). |
| `coverage/route.ts`, `coverage.ts` | Version-aware section list. Retire `mergeCoverage()` as planned. |
| `components/review/deliverable.ts` | With explicit writer calls, `findDeliverable()` and the 35% heuristic become a fallback only. |
| `api/agents/[slug]/save`, approve, share routes | Two artifact kinds; block external share for the brief. |
| `components/board/StageCard.tsx`, `StageDrawer.tsx` | JD stage shows two documents (Opportunity Brief + Recruiter Brief) with separate approve. |
| `orchestrator/inheritance.ts` | Downstream stages inherit both. The brief is passed as internal context. |
| `schemas/job-description.output.schema.json` v3, new `recruiter-brief.schema.json`, `job-description.intake.schema.json` v3 | New structures, `visibility`, sources, bank version |

### 6.5 Company Intel coupling: needs ADR-010

The diagram puts Company Intelligence upstream of the JD. ADR-009 §2 and the repo `CLAUDE.md` say: "No coupling… injects nothing into other agents… Package Phase 4 (JD integration) is dropped."
**ADR-010 must decide:**
- Company Intel stays admin-run (Dana/Susan do it as part of the service). The JD stage only consumes the **approved, derived** Company Context + Contextual Leadership Profile, never raw research.
- Customers never see the internal tool. They see its effect inside their JD and brief.
- **Optional vs required:** recommended optional-but-flagged. The JD runs without it, the Context and Leadership Approach sections fall back to HM answers, and the brief lists "Company Context not researched" as an open item.
- **Naming check:** is the "Contextual Leadership Profile" in the diagram the same as v3's **Tab 2, Contextual Skills**? The Exec10X prompt makes those skills role-agnostic and offers to "adapt them to a specific role". The JD's Leadership Approach paragraph is that adaptation, so they look like the same thing at two levels. Confirm with Susan.
- Update `CLAUDE.md` (Company Intelligence section) and ADR-009 status ("amended by ADR-010").

### 6.6 Tests and evals that break

| Asset | Why it breaks |
|---|---|
| `scripts/test-jd-generation.ts` | Asserts the old sections and 500–700 words |
| `scripts/test-drawer-logic.ts`, `test-document-stream.ts` | Old structure, single deliverable |
| `evals/cases/cases.json` | JD rubric scores the old structure; opener sentinel |
| `evals/fixtures/job-description.md`, `examples/chief-information-officer-JD.md` / `-intake.json` | Regenerate on v3 |
| `test:one-question` | Still valid. Add a case where the HM flags confidentiality. |
| New tests | 6 mandate items exactly; word count 650–900; no placeholders in final; **no confidential answer text appears in the JD** (string-match the `visibility=confidential` answers against the JD); brief never shareable |

### 6.7 Docs to update (repo rule: docs lead code)

PRD → v3 · `agents/specialists/job-description.md` · `interview-flow-update-plan.md` (Item 1 unblocked; link here) · `docs/platform-architecture/Intake-Flow.md` · ADR-010 · `CLAUDE.md` Company Intel section · `Platform-Maturity.md` / `Repository-Inventory.md`.

### 6.8 Out of scope here but now visible: the Assessment Generator

The "Doc" (Prompt Pack v5) defines Calls A and 1–4 producing Hiring Framework · Role Assessment Plan · Recruiter Screen · Onsites & Case, plus a panel intake form and a competency library. That effectively **replaces stages 02–04** (competency-builder, panel-designer, interview-system) and touches 10 (screening guide). It needs its own gap analysis. The only thing the JD agent has to do for it now is produce the four inputs it expects: `job_description`, `confidential_brief`, `company_context`, `company_values`. This plan covers all four.

---

## 7. Decisions needed (with my recommendation)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Is the 68-question doc a **replacement** for bank v2 or an addition? | **Replacement**, plus 3 added questions (scope, ExCo, failure profile). It is clearly a cut of v2, and it fixes the 150-turn problem. |
| D2 | Recruiter Brief structure | Adopt §5 as v1; Susan edits. |
| D3 | Company Intel: required or optional upstream | **Optional, recommended**, via ADR-010 |
| D4 | One name for the candidate-facing document | **"Executive Opportunity Brief"** in the product (it matches the diagram and pairs with "Executive Assessment"); "Job description" only in HM-facing copy, where people expect it |
| D5 | One reply vs two generation calls | **Two calls**, two artifacts |
| D6 | Old v2 sessions | Freeze on v2; no remapping |
| D7 | Fewer than 6 real accountabilities | Ask once, then flag it in the brief. **Never pad.** Susan to confirm the template allows 5 in that case. |

---

## 8. Build order

| Step | What | Size |
|---|---|---|
| 0 | Land the tree (`products/launch` diffs, untracked files); run `npm run evals` + `test:jd` as the before-score | S |
| 1 | Docs: PRD v3, ADR-010, this plan approved by Susan (D1–D7) | S |
| 2 | **Prompt + bank v3 + JD template + static opener + `visibility`**, JD only, single artifact. Biggest quality jump, no new infra. Update evals. | M |
| 3 | **Recruiter Brief** as second artifact; two writer calls; drop Phase 3 JSON; share guard | M |
| 4 | **Company Intel link**: `projects.companyId`, context injection after the cache breakpoint, `aboutText` reuse, pre-crediting | M–L |
| 5 | Materials-first intake UI: multi-file, doc classification, `company_values` store (plan item 3) | M |
| 6 | Assessment Generator replacing stages 02–04 (separate gap analysis) | L |

Step 2 alone delivers what Susan sees: her opener, her questions, her JD format. Steps 3 and 4 deliver what the diagram promises.
