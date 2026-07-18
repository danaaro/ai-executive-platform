# UX Shell — Navigation & Hiring Workflow

> STATUS: 🟡 DRAFT — first full IA/UX design pass (2026-07-17), recruiter-anchored. Interactive mockup: https://claude.ai/code/artifact/609d5cba-1cb9-419b-9147-aab269159f45 ("Hiring Platform — UX Mockup", private). Source of product truth: `products/interview-intelligence/` docs; vision-doc reference: `../../../context/Interview_Intelligence_INT2_Vision.md` (Appendix A user workflow + §6 agent suite, 2026-07-17 revision).

## Design decisions (locked with Dana, 2026-07-17/18)

1. **Full navigation shell** — the whole app skeleton is designed now, so every future agent has a home; only the JD agent is functional today.
2. **Non-linear workflow** — stages have a natural order but are NOT gated sequentially. Any stage is directly enterable when its **input artifacts** exist, regardless of where they came from.
3. **Recruiter is the anchor persona** — they own requisitions and drive the flow. Hiring-manager and interviewer views are described, not designed, in this pass.
4. **Deferred:** Susan AI (persistent expert chat), admin/compliance surfaces (audit log UI, org settings, SSO), ATS integrations, analytics dashboards.
5. **Brand: Susan Pike & Partners visual identity** (2026-07-18, per susanpikepartners.com) — ink navy `#0A1119`/`#121C27`, warm cream grounds (`#F5F1E9` family), brass-gold accent `#C69746` (dark theme `#D3A857`), slate muted `#4B535D`; type: Roboto (body) + Roboto Slab/serif (display); navy sidebar with gold monogram + spaced-caps wordmark. The *product name* remains a placeholder ("Hiring Platform") — ADR-002 naming quarantine applies to the product brand, not the SPP company identity. Status colors adjusted so drafts read slate-blue (amber would collide with the gold accent).
6. **Role-level vs candidate-level split (2026-07-18).** Stages 1–4 (JD → Competency Model → Panel → Questions + Kit) are **candidate-agnostic role setup**. From Feedback Forms onward (5–7: feedback → rationale → onboarding) everything is **per-candidate and personal** — each candidate carries their own CV and one transcript per interview, and their own artifact chain. The UI encodes the split explicitly: two zones on the role workspace, a dedicated personal-data hue (plum) distinct from both the accent and the status colors, and sensitive-data handling surfaced in copy (transcript auto-delete + 24h grace, per vision doc §8).
7. **Build phasing made visible.** The per-candidate zone ships in **build Phase 2**, but it is always rendered in the workspace as a roadmap preview (example rows, "Phase 2 · roadmap" pill) — the full journey stays on screen from day one; nothing personal is built in Phase 1.

## Core UX concept: artifact-driven, not step-driven

Each stage **consumes** and **produces** artifacts. A stage is enterable when its inputs exist — produced by an upstream agent **or uploaded/pasted by the user** ("bring your own"). This makes "sequential by default, non-sequential by choice" coherent: the happy path walks the stages in order, but a user who already has a JD (or competency model) made elsewhere starts wherever their inputs allow.

Artifact states: `missing → draft (AI-proposed) → approved (human-confirmed)`. Only **approved** artifacts satisfy downstream input requirements. Every approval is logged (EU AI Act human-oversight — visible in the UI, not buried).

## Artifact-gating table (from vision doc §6, 2026-07-17 names)

| # | Stage / agent | Scope | Consumes (required inputs) | Produces |
|---|---|---|---|---|
| 1 | Job Description Interactive Agent | role | conversation with hiring manager (or uploaded brief) | **Job Description** + intake record |
| 2 | Predictive Competency Builder | role | JD | **Competency Model** (competencies + behavioural indicators) |
| 3 | Strategic Interview Panel Designer | role | JD + Competency Model | **Panel Design** (interviewers, assigned competencies) |
| 4 | Structured Interview System Builder | role | JD + Panel Design | **Question Sets** (per interviewer/competency) |
| — | *Conduct interviews — outside the system* | — | Interview Kit (JD + panel + questions, downloadable) | transcripts/notes (client-side) |
| 5 | Interview Feedback Form Builder | **candidate** 🔒 | per-interviewer competencies + JD + candidate CV + transcript (per interview) | **Feedback Form** (draft evaluation; human scores) |
| 6 | Hiring Rationale Generator | **candidate** 🔒 | all feedback + CV + JD + Competency Model + Panel | **Hiring Rationale** |
| 7 | Manager's Success Blueprint Generator | **candidate** 🔒 | candidate profile + role expectations | **90-day Onboarding Plan** |
| 8 | Interview Excellence Coach | interviewer | transcript + interview guide | **Interviewer Coaching Report** (not tied to one requisition) |
| A1 | Recruiter Screening Guide (independent) | role | JD + Competency Model | Screening guide |
| A2 | Recruiter Evaluation Report (independent) | **candidate** 🔒 | transcript + candidate profile + notes | Screening evaluation report |

🔒 = personal data (CV, transcripts): plum-coded in the UI, per-candidate artifact chains, transcript auto-delete after processing (24h grace, vision doc §8). **Build Phase 2** — visible in the workspace as roadmap preview from day one.

Zone grouping in the UI: **Role setup — candidate-agnostic** (Define: 1–2 · Prepare: 3–4 + kit download; build Phase 1) → *Conduct interviews divider (outside the system)* → **Per candidate — Assess & Decide** (5–7 as a candidate list, each row: CV/transcript input chips + Feedback → Rationale → Onboarding chain; build Phase 2). Agent 8 and A1/A2 sit outside the requisition pipeline (Assistants area; Coach also surfaces per-interviewer).

## Information architecture

```
Shell (left nav, persistent)
├── Home / Roles            ← recruiter landing: requisition list + status chips
│   └── Role workspace      ← THE core screen: pipeline board for one requisition
│       ├── Stage → Agent session (conversational, chat+voice)   e.g. JD intake
│       ├── Stage → Draft-and-approve review                      universal pattern
│       └── Artifact detail / upload ("bring your own")
├── Candidates              ← per-role candidate list → per-candidate Assess/Decide artifacts
├── Assistants              ← independent: Screening Guide, Evaluation Report, (later: Coach reports)
├── Templates & Training    ← placeholder in this pass (supporting layers)
└── [deferred] Susan AI · Admin/Compliance · Analytics
```

### Screen inventory (mockup screens 1–6)

1. **Roles dashboard** — active requisitions; each row: role, hiring manager, candidate count, phase-progress chips (Define/Prepare/Assess/Decide), next action. Primary CTA "New role" → two entries: *Start with the JD agent* or *Upload an existing JD*.
2. **Role workspace (two-zone board)** — top zone: role-setup columns (Define, Prepare) with stage cards; then the out-of-system "Conduct interviews" divider; then the plum **per-candidate zone** (Assess & Decide as candidate rows with input chips and per-candidate chains, Phase 2 roadmap preview). Each stage card: artifact status badge, `Run agent` (primary) and `Upload existing` (secondary); locked cards show *which* inputs are missing and deep-link to them. Kit download lives at the end of Prepare.
3. **Agent session** — conversational intake (matches the built JD agent: text + live-voice modes, one question at a time, mic toggle; pattern from `src/app/page.tsx`). Ends by handing a draft artifact to the review screen.
4. **Draft-and-approve review** — the universal pattern for every agent output: AI draft (left/main), edit-in-place, provenance strip ("Generated by X from artifacts Y,Z on date"), and an explicit **Approve** action with logged confirmation. Reject → back to agent session with feedback.
5. **Artifact library (per role)** — a role holds *multiple* artifacts at once; the screen is a library, not a single-artifact page: left list of every artifact slot with its status (approved / draft / missing; per-candidate slots grouped separately in plum, Phase 2), right detail panel for the selected artifact with provenance + exports; missing slots offer `Open workspace` / `Upload existing`; the provenance chain sits above. Upload flow parses an external file into an artifact slot (enters as `draft`, still requires approval).
6. **Assistants** — standalone tools with the same session → draft → approve pattern, minus requisition binding.

### Role visibility (later passes)

- **Hiring manager:** same shell filtered to their roles; primary surface = review/approve queue + JD intake sessions.
- **Interviewer:** minimal surface — their brief (assigned competencies + questions) and their feedback form; no pipeline access.

## Interaction contracts

- **Draft-and-approve everywhere.** No agent output advances without explicit human approval; approvals/overrides are logged with user + timestamp + rationale field (optional). This is a compliance feature surfaced as UI, not hidden.
- **Agents propose, humans decide.** No screen shows an AI-made hiring decision; rationale and scores are always labeled as drafts/evidence.
- **Sequential by default:** the pipeline board visually suggests order; "next best action" is always computed and offered (e.g. "Competency Model is ready to run — JD approved").
- **Non-sequential by choice:** every locked stage lists its missing inputs with an `Upload existing` shortcut — never a dead end.

## Out of scope this pass

Susan AI placement, admin/audit-log UI, tenancy/org switching, ATS push/pull, analytics, mobile-specific layouts (responsive web assumed), HM/interviewer view design, real visual brand (awaits ADR-002).

## Build implications (for the next `src/` sprint — not built yet)

The mockup implies: a `roles`/`artifacts` data model plus (Phase 2) a `candidates` entity owning CV/transcript inputs and per-candidate artifact chains (persistence decision still open — see Platform-Maturity risks), a generic stage/agent registry replacing the single hardcoded JD path, and route structure `/roles/[id]` + `/roles/[id]/[stage]` + `/roles/[id]/candidates/[cid]` + `/assistants/[tool]`. The existing JD chat page becomes the "agent session" screen inside the shell. Phase 1 builds only role-scoped stages — no personal data touches the system until the Phase-2 candidate zone, which also inherits the transcript retention/deletion policy.
