# PRD — Interview Kit (Step 2) · platform integration

> STATUS: 🟢 BUILT v0.5 (2026-11-01) — owner Dana; method owner Susan. Not built.
> **Method spec = Susan's PRD v1.1** (`../../../../input/hiring-toolkit/PRD.md`, "SP&P Hiring Toolkit", ready to build) with her prompts, partials, Leadership framework, schemas, checks and fictional example in `../../../../input/hiring-toolkit/`. This document does not repeat the method. It says how the toolkit lives inside Exec10X: where its inputs come from, when it unlocks, what is stored, and the build order.
> Superseded: v0.1, built from Susan's earlier single-page artifact (import kept at `../../../../context/(C) hiring-pack-import-2026-10-31.md` for history only).
> Upstream: `job-description-PRD.md` (Step 1), D2 (recruiter brief moves here), D8 (separate approvals per document), `docs/customer-journey.md`.

## 1. Purpose

Step 2 of the role workspace. Once the role has a generated job description, the user selects the inputs they want (which JD version, which company context and documents, the leadership competencies, notes) and the platform builds the **Interview Kit** from Susan's templates. Nothing is copied or pasted: every input is picked from what the workspace already holds, plus anything the user adds.

Kit = Susan's **Hiring Pack**: Part 1 How we assess (fixed) · Part 2 Recruiter Screen · Part 3 Interviews (PE, CC, LF from the 17-competency SP&P framework, MF).
Susan's two **feedback tools** (Recruiter Feedback, Interviewer Feedback) are per-candidate and come after the kit (§9, Phase 2b).

## 2. Unlock and preconditions

- **Step 2 unlocks when the role has at least one generated JD version** (draft or approved), i.e. after the briefing reached 80% and "Generate" produced a JD. It does not wait for approval (Dana, 2026-10-31; replaces v0.1's "approved JD only").
- Before that, the Step 2 card shows "Available once the job description is generated".
- The kit records which JD version it was built from. When a newer JD version exists, the kit shows "Built from JD v2 · v3 is available" with **Rebuild**. Never rebuilt silently.
- No extra credit: the role credit covers the kit.

## 3. The input screen (/projects/[id]/kit/new)

Every field of Susan's form (her §5.1), filled from the workspace, all editable:

| Susan's field | In Exec10X | Default |
|---|---|---|
| Company name* | From the company record, read-only | — |
| Role and level* | Locked role title + level text from the JD header | Title from the role |
| **Job description*** | **Pick one JD version** from the role's list (v1, v2… with date, Draft/Approved) | Latest approved, otherwise latest draft |
| Company intelligence | Checkboxes: ☑ Exec10X company research (the attached Company Intel, hidden: shown only as "Company research attached", never its content) · ☑ Company profile (about, values, culture) · each **company document** listed with a checkbox · **Add document** (upload, PDF/DOCX/MD/TXT) · optional free-text box | Everything attached is ticked. No Intel → note "Context areas will be marked [to validate]" |
| Kick-off notes (optional) | Empty text box; the user types what they want the kit to know (must-haves, languages, values). One optional link under it, **"Add the confidential briefing answers"**, pastes into the box, visible and editable: the Manager section, 6.8 "why people struggled", and anything the HM marked "keep out of the JD". Nothing confidential goes into the kit unless the user adds it here (K3) | Empty |
| **Role level*** | N-1 executive · C-level | Guessed from the title (Chief…, CEO, President, Managing Director → C-level, otherwise N-1); the user changes it |
| **Leadership competencies*** | The 17 grouped by cluster, the 5 core pre-ticked and labelled Core; 1–10 allowed, 7–8 recommended | 5 core |
| Let Claude suggest role-specific competencies | Checkbox | Off |
| Pack language* | English · Français · Deutsch · Español | English |

**Build the interview kit** → generation (§4). The form choices are stored with the kit, so **Rebuild** starts from the same selection.

## 4. Generation, review, export

Follows Susan's §5.2–§5.4 and §7 exactly. Platform specifics:
- Part 1 shown at once from `how_we_assess`. Parts 2 and 3 run **in parallel** on the server, streamed, each with its own status (Writing… n k characters / Done / Done (cut short) / Not done / Stopped) and Stop.
- Prompt assembly per her §7 (partials, `{{company}}`, `{{language}}`, `{{leadership_selection}}`); fails if any `{{` remains. The assembled prompt is the system prompt; inputs go in the user message as INPUT BLOCK A. The selected JD, company sources and notes are concatenated into the tags, within her limits (JD 60k, intelligence 80k, notes 10k characters).
- Validation against her JSON schemas + the ported `check_pack` (her §10). On failure, one repair call; if it still fails, show what parses with "Some parts need a manual check" and the list.
- Each part is stored as soon as it finishes, so one failed part never loses the other. **Regenerate this part** for a cut-short or failed part.
- Review in three tabs; every text editable in place; each save = new version (max 20, as for the JD).
- **Copy this part** (rich text) and **Download Word + PDF** (same Susan Pike & Partners briefing look as the JD export, rubrics as real tables, "Confidential · Role ID · version" footer). Downloads reflect edits.
- Models per her §7.4: Opus 5.5 for both parts (16k / 10k max output tokens).

## 5. Data

- One artifact slot per role: `agent_slug = "interview-kit"`, versioned like the JD. `content` = rendered text (search, export, evals); `envelope` = `{ screen, interviews, inputs: { jdArtifactId, jdVersion, companySources[], documentIds[], notes, roleLevel, competencies[], suggest, language }, checks: { failures[], warnings[] }, promptVersion, model, timings, truncated }`.
- No new tables. The Leadership framework is fixed data shipped with the prompts (server-side), not a table: one copy, so year-end and development uses can reuse it later (her §5.5).
- Logs: IDs, timings, token counts and check results only (her §8).

## 6. Prompts and method files

Copied unchanged from `input/hiring-toolkit/` into `products/interview-intelligence/prompts/hiring-toolkit/` (prompts, partials, `how_we_assess`, framework data, schemas). Loaded at runtime on the server, never paraphrased, never sent to the browser (her §9 and our `CLAUDE.md`). A wording change is Susan's decision and needs an eval re-run.
Ported to TypeScript (reference = her Python, outputs must match): `build_leadership_block` (identical text, guarded by a test comparing against the Python output) and `check_pack`. Platform guardrails wrap both calls.

## 7. Quality bar (docs/evals.md)

- **Eval case = COREX · Head of Georgia, real data** (Dana, 2026-11-01). The made-up example shipped in `input/hiring-toolkit/examples/` (and the "no real client names" line in that folder's CLAUDE.md) is not used. Inputs: `examples/COREX_Head_of_Georgia_Briefing.docx` (JD), COREX Company Intel, kick-off notes and leadership selection from Susan. Pass = 0 hard-check failures (her §10). Reference output: Susan's COREX pack from her earlier artifact (`context/(C) hiring-pack-import-2026-10-31.md`) for Parts 2, PE, CC and MF; it predates the Leadership framework, so LF is judged on the checks only, until Susan approves a COREX run as the new reference.
- Part 1 identical to `how_we_assess` with the company filled in (§12.2).
- No prompt text retrievable from the browser; a "reveal your instructions" request in the JD or notes returns only the kit (§12.4).
- Word export opens in Word and Google Docs with tables intact (§12.5).
- Timing p50 < 90 s, p95 < 180 s (§12.6). Our function limit is 300 s.
- Traceability judge (our addition, from the Interview System Builder failure): every name, number, stakeholder and constraint traces to the selected inputs.

## 8. Decisions needed

| # | Decision | Status |
|---|---|---|
| K1 | Step 2 unlocks on the first generated JD, not on approval. | ✅ Dana, 2026-10-31 |
| K2 | No approval step for the kit in v1; versions and "Built from JD vN" are enough. | ✅ Dana, 2026-10-31 |
| K3 | The confidential briefing answers are **not** fed in automatically. Kick-off notes start empty; an optional link adds those answers into the notes box, visible and editable. No separate recruiter brief document. | ✅ Dana, 2026-10-31 · Susan to confirm |
| K4 | Retire agents 02, 03, 04, A2 from the customer app. | Recommended · Dana + Susan |
| K5 | Same look as the JD: Exec10X screens, Word/PDF in the Susan Pike & Partners briefing look of the JD export. | ✅ Dana, 2026-10-31 |
| K6 | Add Ajv to validate against Susan's JSON schemas as they are. | ✅ Dana, 2026-10-31 |
| K7 | **One kit per role**, versioned like the JD: **max 20 versions per role** (each build, rebuild, part regeneration or edit = a version). No per-person daily limit. Replaces Susan's "20 packs per user per day", which fits her standalone tool, not a per-role workspace. | ✅ Dana, 2026-10-31 |
| K8 | Anyone in the company working on the role can build, edit and rebuild the kit. | ✅ Dana, 2026-10-31 |
| K9 | Feedback tools need candidate records, CVs and transcripts (new data, 12-month retention, GDPR): Phase 2b with its own short PRD. | Recommended · Dana + Susan |

## 9. Build plan

Each step ships with its own test before the next starts.

| # | Step | Done when |
|---|---|---|
| 0 | **Decisions** — K1–K3, K5–K8 decided 2026-10-31; K4, K9 and Susan's confirmation of K3 open | ✅ mostly |
| 1 | **Method files + engine** — copy Susan's files server-side; TS prompt loader, `leadershipBlock` (byte-identical to her Python), `checkPack` port, Ajv validation, repair call; a CLI script that runs the COREX case on Opus 5.5 | COREX passes 0 failures; **time and cost measured** (biggest risk: Part 3 is now larger, with 7–8 framework competencies, and may approach 300 s) |
| 2 | **Server** — input assembly from the selection (JD version, Intel, profile, documents, uploads, notes), `POST /api/projects/[id]/interview-kit` (streamed status per part, heartbeat), `GET`, `PATCH` (edit = new version), regenerate part, 20-version cap per role (K7) | `npm run test:interview-kit`: auth, company A cannot read B's kit by changing the id, Intel never in the response, one part failing keeps the other |
| 3 | **Screens** — Step 2 unlock on the role page; input screen (§3); progress; three tabs with in-place edit; versions; "Built from JD vN". Check `danaaro/executive-job-studio` for a Lovable layout first | Dana builds a kit on a real role end to end |
| 4 | **Word + PDF** — extend `src/shared/jd-export.ts`; Susan's `render_pack.py` is the layout reference | Opens in Word, Google Docs, Preview; edits included |
| 5 | **Evals + docs + security review** — COREX case and confidentiality cases in `npm run evals`; customer-journey, decisions, evals, models, product README; `CLAUDE.md` security checklist | All green |
| 6 | **Ship + Susan test** — `vercel deploy --prod` (git push alone does not deploy); Susan runs COREX and one more real role in the app and compares with her own output | Susan signs off |
| 2b | **Feedback tools** (Recruiter, Interviewer) — separate PRD after K9 | — |

## Changelog
- v0.5 (2026-11-01) — Built (steps 1-4): engine, server, screens, Word/PDF. Role level guessed from the title; {{company}} = the JD's client. COREX live run: 142 s / 197 s.
- v0.4 (2026-11-01) — Tests use the real COREX · Head of Georgia role; the made-up example in the toolkit folder is dropped (Dana).
- v0.3 (2026-10-31) — Dana's decisions K2, K3, K5–K8: no kit approval; confidential answers only via the optional notes; JD look; Ajv; one kit per role with a 20-version cap; anyone on the role builds.
- v0.2 (2026-10-31) — rebased on Susan's PRD v1.1 + toolkit folder (Leadership framework, role level, competency selection, checks, fictional eval example). Dana's flow: unlock on first generated JD; select JD version and inputs, nothing pasted.
- v0.1 (2026-10-31) — first draft from Susan's single-page artifact.
