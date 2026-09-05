# Interview Flow Update — Change Plan

> STATUS: 🟡 DRAFT — opened 2026-09-05 (Dana). Living record for the four-item update batch: new agent prompts, true conversational mode, intake resequencing, single-hire mode. Companion to `docs/platform-architecture/Intake-Flow.md` (which item 3 supersedes in part) and the new wireframes at `../../../input/wireframes-2026-09-05/`.

## Context

Driven by Dana's 2026-09-05 review and a new Claude Design wireframe set (6 design turns).

| # | Update | Status |
|---|---|---|
| 0 | `intake_answers` store — prerequisite for 3 and 4 | ✅ **Done 2026-09-05** |
| 1 | New agent prompts enhancing the JD interview logic | ⏳ Blocked on prompt text from Susan/Dana |
| 2 | True conversational mode — one question per turn, JD agent only | ✅ **Done 2026-09-05** |
| 3 | Intake resequenced — materials first, then one committed mode | Unblocked — next |
| 4 | Single-hire (customer) mode — board as front door, deliverables pack | Needs ADR-009 first |

**Baseline before the work (`generated/evals/run-2026-09-05-11-09/`):** agent quality 88.3%,
guardrails 100%, every structural check 100%. The JD case was the weakest judge score at 72% —
worth knowing when item 1's prompts land, because that is the number they have to beat.

The through-line: today the platform interviews from zero, bundles questions, treats all four
intake methods as ambient peers, and stores intake only as transcript text re-judged by an LLM on
every turn. The wireframes ask for a sequenced, committed, provenance-carrying intake — which is
not achievable on the current storage model. Hence item 0.

### Decisions taken (2026-09-05)

- Conversational mode applies to **Job Description only**. Agents 02–10 are input-collectors, not
  interviewers; they keep current behaviour.
- Wireframe wins on **committed mode**: one intake mode per stage, named in the header, switching
  is an explicit confirm. This **supersedes** `Intake-Flow.md` Step 3's "a starting posture, not a
  lock". That doc must be corrected, not merely extended.
- `intake_answers` is built **first**, not last as `Intake-Flow.md` Step 5 proposed.
- Single-hire mode is **in scope** as item 4.

---

## Alerts — discrepancies found

| # | Issue | Resolution |
|---|---|---|
| A | Wireframes say **9 intake sections** (`6 / 9`, "all 9 sections"). The question bank has **20** sections / ~150 IDs. `src/components/intake/IntakeProgressPanel.tsx:11` already documents this: *"it renders 20 segments, not the mocked 9"*. | Treat 9 as placeholder. Build against 20, parsed from the question bank. Never hardcode a count. |
| B | Wireframe 5b (committed mode) contradicts `Intake-Flow.md` Step 3 (switchable, all methods live). | Wireframe wins. Rewrite that section. |
| C | Per-section provenance (5b④) and "your 7 answered sections stay" are **not buildable** on today's coverage model — covered/partial/missing per section, no source, no per-question record. | Item 0 is a hard prerequisite for 3 and 4. |
| D | Wireframe 5a③ offers 3 modes; `Intake-Flow.md` Step 2 offers 4 (incl. "Add more documents"). | Follow the wireframe: 3 modes. Upload stays reachable from the composer, not the mode chooser. |
| E | Upload is single-file (`Composer.tsx` input lacks `multiple`; `/api/upload-parse` reads `form.get("file")`) and disabled during live voice. Wireframe shows a multi-file drop zone. | Item 3 includes multi-file. |
| F | The `INTAKE_START` sentinel is duplicated in 4 places: `src/app/agents/page.tsx:25`, `src/components/board/StageDrawer.tsx:26`, `src/app/api/job-description/voice-llm/handler.ts:144`, `evals/cases/cases.json:9`. Item 3 changes the opener. | Export it from one module before touching it. |
| G | `VOICE_CHANNEL_NOTE` exists solely to name and revoke Phase 1's bundling rule. Item 2 deletes bundling. | The override becomes a dangling reference. Must change in the same commit as the prompt. |
| H | ADR-002 accepted **SusieBrain** (commit `a6e8105`), but `CLAUDE.md:21` and this prompt's quality standards still say the brand is undecided and forbid naming it. | Doc drift — fix while the prompt is open. |
| I | 19 modified + 9 untracked files uncommitted, including every file items 1–3 touch. | Land the tree before starting. See Step 0. |

**Deferred, do not lose.** One question at a time across ~150 question IDs is potentially a
~150-turn text interview. Revisit once the new prompts land. Candidates: prune the question bank,
or make the gap checklist mandatory rather than optional so the tail closes without more turns.
Item 0 removes the matching cost problem (5× turns would otherwise mean 5× coverage-scoring calls).

---

## Step 0 — Land the working tree (do first)

Commit or stash the in-flight diff, run `npm run evals` and `npm run test:jd`, record the scores.
Without a clean baseline there is no rollback point and no honest before/after on a
prompt-behaviour change.

---

## Item 0 — `intake_answers` store (prerequisite)

Turns coverage, provenance, the gap checklist and the "answers are kept" guarantee from LLM
re-judgement into a query.

**Schema** — add to `src/db/schema.ts` alongside `conversations` / `messages`:

```
intake_answers  unique (conversationId, questionId)
  answer      text
  status      'answered' | 'inferred' | 'unknown' | 'not_yet_decided' | 'skipped'
  source      'document' | 'voice' | 'dictation' | 'typed'
  sourceRef   text          -- file name or message id
  updatedAt   timestamptz
```

**Write path.** The JD agent emits a compact `[INTAKE ANSWERS]` JSON block per turn (question ids +
status + source); the message route parses and upserts it, then strips it before the turn renders.
Additive — the transcript stays the human-readable record.

**Read path.** Rewrite `src/app/api/conversations/[id]/coverage/route.ts` to derive section status
from a `GROUP BY` over `intake_answers`, keeping the response shape `{sections:[{id,name,status}]}`
so `IntakeProgressPanel` and `use-intake-session.ts:104` need no change. Keep
`questionnaireSections()` parsing `## N.` headings out of the question bank — that is what makes
alert A survivable.

**Retire.** `src/shared/coverage.ts` `mergeCoverage()` — the monotonic ratchet exists only to paper
over model variance in the scorer. With a real store, monotonicity is a property of the data. Keep
the LLM scorer behind a fallback flag for one release, then delete.

**Migration.** Null out `conversations.coverage` / `coverageSeq` for existing rows.

---

## Item 1 — Interview flow prompt rewrite (blocked on new prompt text)

`src/orchestrator/job-description-orchestrator.ts` → `buildJobDescriptionSystemPrompt()` assembles
`prompts/system/guardrails.md` + `prompts/01-job-description.md` +
`docs/job-description-question-bank.md`, plus `VOICE_CHANNEL_NOTE` appended after the cache
breakpoint on the voice channel only.

**Couplings that break silently:**

1. `VOICE_CHANNEL_NOTE` names "Phase 1's bundling rule" explicitly (alert G).
2. Interim-draft three-way contract: `INTERIM_DRAFT_MARKER` in `src/components/review/deliverable.ts:104`
   ↔ the sanctioned clause in `guardrails.md` ↔ Phase 2's Exception in the prompt. Dropping the
   Phase-2 exception makes the Generate-draft button return the flat refusal sentence — a
   regression already fixed once, 2026-08-13.
3. `deliverable.ts` `looksLikeDocument()` rejects any message where >35% of lines end in `?`. That
   heuristic exists *because of* bundling; item 2 makes it safe to relax, but re-validate against
   real transcripts rather than by reading the code.
4. Coverage section parsing, plus the hardcoded 20 placeholder segments in `IntakeProgressPanel.tsx:48`.
5. The Phase-3 record must conform to `schemas/job-description.intake.schema.json`; regenerate
   `examples/chief-information-officer-intake.json` if question IDs change.
6. Approved JD artifacts feed stages 02–10 via `src/orchestrator/inheritance.ts` — an
   output-structure change ripples into every downstream input schema.
7. `cachedSystemPrompt` is module-level: **restart the dev server after every prompt edit** or you
   test the old prompt. Text and voice base blocks must stay byte-identical for the Anthropic
   ephemeral cache to hit across channels, and the voice note must stay *after* the breakpoint.
   Watch `max_tokens: 16384` and the no-thinking truncation retry if the deliverable grows.

**Sequence when the prompts arrive.** Decide first whether the change is prompt-only (how it asks)
or question-bank (what it asks) — the latter triggers couplings 4, 5, 6 and a coverage migration.
Bump `version:` in the frontmatter and append a dated `adaptations:` line; that frontmatter is the
only history the runtime carries.

---

## Item 2 — One question at a time (Job Description only)

Today Phase 1 mandates bundling 2–4 questions in text chat and the voice channel overrides it back
to one. Invert: one question per turn everywhere, and the voice note keeps only speaking style.

- `prompts/01-job-description.md` — replace the "Conversation style (mandatory)" bundling clause
  with a strict one-question rule, mirroring the voice note's already well-tuned language (ask one
  and stop · no menu of candidate answers · no previewing upcoming questions · follow-ups count as
  turns). Bump `version:` to 1.3 with a dated adaptation.
- `docs/job-description-question-bank.md` — the header carries *"Conversation rule (Dana,
  2026-07-18): do not interrogate one-by-one."* Reverse it; add a changelog entry.
- `src/app/api/job-description/voice-llm/handler.ts` — reduce the "ONE QUESTION PER TURN (overrides
  Phase 1's bundling rule)" section to a short reinforcement; keep "Speaking style" as is.
- `src/components/review/deliverable.ts` — the >35% question-line guard can relax; verify first.
- `scripts/test-voice-one-question.ts` — generalise into a channel-agnostic check, or add a text
  sibling, so the rule is guarded on the channel where it is now new.

**Do not** change agents 02–10. Decision taken: JD only.

**What it actually took (2026-09-05).** Reversing the rule in Phase 1 was not enough on its own —
three findings from driving real turns:

1. **The question bank was the real culprit.** Its questions carry parenthetical examples
   (`(e.g., business growth, new initiative, restructuring, new capability)`) meant as interviewer
   guidance, and the agent read them out as a menu of options — "was it growth, a new initiative,
   or something else?". That is a second question wearing one question mark, and it leads the
   hiring manager to pick from a list instead of describing their situation. Fixed by a rule in the
   bank's own header, next to the text it governs, plus a checkable format rule in the prompt.
2. **Re-asking is where it breaks.** The violation almost always appeared when the agent re-asked
   something the hiring manager had skipped — exactly when offering options feels helpful.
3. **The eval rubric rewarded the old behaviour.** `cases.json` scored the JD agent on
   *"Conversational quality: bundled questions…"*. Left alone it would have marked the new,
   correct behaviour down. Updated to score one-question-per-turn and the absence of answer menus.

`npm run test:one-question` guards it on the text channel by driving real turns through the
orchestrator (no dev server needed) and failing on a second question mark, a bulleted list of
questions, *or* an appended menu — the em-dash form of which passes a naive question-mark count.

---

## Item 3 — Intake resequenced (wireframe turn 5)

**Launcher.** `src/components/board/StageDrawer.tsx:157–171` auto-fires `INTAKE_START` on open.
Stop that; render *"Do you have anything to start from?"* → **Upload materials** (multi-file drop
zone, PDF/DOCX/TXT, or paste text) | **Start from scratch**. Extract the sentinel to one exported
constant first (alert F) and give the two paths distinct openers. Resumed sessions show a resume
card — role title, `n / 20 sections`, last mode used — which is a query against `intake_answers`.

**Ingest & confirm.** `Composer.tsx` file input gains `multiple`; `/api/upload-parse` loops over
`form.getAll("file")` and returns per-file parse status. The sweep result renders as a structured
panel (per file "parsed ✓", sections filled, sections still needed) with per-row **Looks right /
Fix this**. Extracted answers land in `intake_answers` with `source='document'`,
`sourceRef=<filename>` — that is what makes the panel real rather than prose.

**Committed mode chooser.** Three options only (alert D): 🎙 Live voice · 🎧 Voice→text · ⌨ Typing.
Stored on the conversation (`intakeMode` column); governs the stage.

**Session header + explicit switch.** Header shows the active mode, `n / 20 · m left`, and ⇄ Switch
mode. Switching opens a confirm naming the consequences, writes a divider turn into the thread, and
updates `intakeMode`. `Composer.tsx` renders only the active mode's control — the behavioural change
from today's four-peer bar. Upload stays reachable in every mode, including during live voice
(currently `disabled={… || voiceLive}`).

**Provenance.** The artifact review pane gains a "how each section was captured" table — a straight
read of `intake_answers.source` per section.

**Doc.** Rewrite `Intake-Flow.md` Steps 2–3 to committed mode; move its Step 5 to the front as built.

---

## Item 4 — Single-hire (customer) mode (wireframe turn 6)

A shell change only. The wireframe's own rule: *mode changes the shell, never the stages* — anything
inside a board is shared between modes. Hold that line.

**Write `docs/adrs/ADR-009-Single-Hire-Mode.md` first** (repo rule: hard-to-reverse decisions get an
ADR before implementation). It must settle the open question the wireframe itself flags: does a
single-hire customer get collaborators (Team nav), or is it strictly single-seat? That determines
whether `projectMembers` is reachable in customer mode.

**Model.** A mode flag on `users` (alongside the existing `role` column) or on an org record.
ADR-007 keeps project-as-primary-entity: single-hire is one project the customer never sees as a
project, not a new entity. Do not fork the data model.

**Shell.** `src/app/page.tsx` redirects to `/projects`; in customer mode it resolves to the user's
single board, or to a first-run "Let's set up your executive hire / Role title / Begin →" screen
when none exists. `AppHeader.tsx` carries the role name instead of the projects nav. `/projects` and
`NewPositionDialog` are unreachable in customer mode — enforce server-side, not by hiding buttons.

**Completion + export (new build).** When all four Phase-1 stages have approved artifacts, the board
resolves into a deliverables summary: per-artifact **Export** plus **Download full pack**. Nothing
exports today. `src/orchestrator/stages.ts` already derives per-stage `approved` artifacts, so the
completion state is a derived predicate over that — no new state. Artifacts are stored as Markdown
(`artifacts.content`), so a zip of Markdown is the honest v1; DOCX/PDF is a separate decision.
Serve the pack from a route, never from a client-side blob link.

No add-a-hire path anywhere in the customer shell.

---

## Build order

1. Step 0 — land the tree, baseline the evals.
2. Item 0 — `intake_answers` + derived coverage.
3. Item 2 — one question at a time (independent of the pending prompts; do not wait).
4. Item 3 — intake resequencing UI on top of item 0.
5. Item 1 — prompt rewrite when the new text arrives; re-verify items 2 and 3 after.
6. Item 4 — ADR-009, then the single-hire shell, then export.

Items 0 and 2 can proceed in parallel. Item 4 is independent of 0–3.

---

## Acceptance gate

| Check | How | Passes when |
|---|---|---|
| Baseline | `npm run evals`, `npm run test:jd` | Recorded before any change; no case regresses after |
| One question per turn | `npm run test:voice-questions` + a new text sibling | Exactly one `?` per agent turn on both channels |
| Voice ↔ text continuity | `npm run test:voice` | Switching keeps transcript and meter |
| Deliverable detection | `npm run test:drawer` | Save finds the document, not a question turn |
| Interim draft | Manual: Generate-draft mid-interview | `[TO CONFIRM: …]` draft, never the refusal sentence |
| Coverage correctness | Manual: run an intake, inspect `intake_answers` | Meter matches the table; no haiku call in the request log |
| Provenance | Manual: upload → voice → type, then open review | Each section shows the method that actually captured it |
| Multi-file + voice upload | Manual: drop 2 files, then upload during a live call | Both parse; the agent acknowledges in-call |
| Mode commitment | Manual: pick typing, then switch to voice | Composer shows only the active control; confirm names the consequences; answer count unchanged |
| Single-hire shell | Manual: customer-mode user hits `/projects` | Server-side redirect, not a hidden button |
| Export | Manual: approve all four stages | Deliverables pack downloads from a server route |
