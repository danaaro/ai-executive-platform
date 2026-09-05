# Intake Flow — the chronological model

> STATUS: 🟡 DRAFT — design pass 2026-09-04 (Dana), amended 2026-09-05. Supersedes the intake portion of `UX-Shell.md` screen 3 and the flat four-method composer shipped 2026-07-18. Governs `src/components/intake/*`, `src/components/board/StageDrawer.tsx`, and the JD prompt's Phase-1 opening.
>
> **Amended 2026-09-05** against the new wireframes (`input/wireframes-2026-09-05/`, design turn 5): intake mode is now a COMMITTED choice per stage, not a default posture — Steps 2 and 3 below are rewritten accordingly. Step 5 moved to the front and is **built** (see `intake_answers`). The wireframes mock 9 questionnaire sections; the real bank has 20 and the code reads the count from the bank.

## The problem with what shipped

All four intake methods exist and all of them persist. What is missing is **sequence**. Today opening the Job Description stage auto-fires `INTAKE_START` and the agent immediately begins interviewing; the four methods sit in one composer bar as unlabelled peers (paperclip · textarea · mic · voice button). Consequences observed:

1. **Nobody uploads first.** The hiring manager who already has a JD draft, a role brief or intake notes is interviewed from zero, then discovers the paperclip twenty questions in. The single most valuable input arrives last.
2. **No method is chosen — one is stumbled into.** Typing is the default because the cursor lands in the textarea. Live voice, the method that actually suits a 20-section discovery interview, is a button most users never press.
3. **Extraction is invisible.** The prompt does sweep an uploaded document against the questionnaire (v1.1), but the result is prose in a chat bubble plus a coverage bar that silently moves. There is no moment where the user sees *what was captured* and corrects it.
4. **Extracted answers are not durable as answers.** They exist only as transcript text. The structured `Intake & Coverage Record` is a Phase-3 JSON blob emitted *after* the job description — so for the whole session the only machine-readable state is an LLM re-scoring the transcript on every turn.
5. **Switching is possible but never offered**, and during live voice the composer is disabled entirely — upload and typing are unreachable mid-call.

## The flow

Five steps. Steps 0–2 are new surfaces; steps 3–4 exist and get a header and a gap-closing screen.

### Step 0 — Start screen: "Do you have anything to start from?"

Replaces the auto-fired opener. The drawer opens on a launcher, not on a talking agent. Three choices:

| Choice | Behaviour |
|---|---|
| **Upload materials** | Multi-file drop zone. Existing JD or draft, role brief, intake notes, org/company material, a JD from a comparable role. → Step 1 |
| **Paste text** | Textarea for a brief typed or pasted from email. Treated identically to an upload. → Step 1 |
| **Start from scratch** | → Step 2 |

Copy names what is useful, because hiring managers do not know what counts as material. The choice is never a dead end: "Start from scratch" users can upload at any later point, and the launcher reappears in the resumed-session variant below.

**Resumed session variant.** Reopening a stage that already has a thread shows a resume card instead: role title, progress (`8 / 20 sections`), the method last used, and "Continue in voice / Continue in text". Everything already answered is stated as retained.

### Step 1 — Ingest & confirm

Files parse (existing `/api/upload-parse`, extended to multiple files), the agent sweeps the full 20-section questionnaire against them, and the result lands as a **structured extraction panel**, not only as chat prose:

- Sections now covered, each with the source file name and a one-line summary of what was found.
- Sections partially covered, with the specific gap named.
- Sections the materials did not touch.
- Per row: **Looks right** / **Fix this** (opens that section for correction).

The coverage meter jumps here, and this is the first time the user sees the platform do work on their behalf. Confirmation matters: an extracted answer the user never saw is an answer nobody owns.

### Step 2 — Choose how to continue

> *"14 sections left — roughly 15 minutes. How do you want to work through them?"*

| Method | Positioned as | Notes |
|---|---|---|
| 🎙 **Talk it through** | Fastest for long context; the agent asks one question at a time | ElevenLabs live voice |
| 🎤 **Dictate** | Speak your answer, review the text, then send | Web Speech — Chrome/Edge only; hidden with an explanatory line elsewhere |
| ⌨️ **Type** | Best when you want to be precise | |

Three options, not four: "add more documents" is not a way of *answering the questionnaire*, and
listing it here made the choice look like a menu of equals. Upload stays available from the
composer in every mode, including during a live call.

The choice **commits the stage** (wireframe 5a③: *"Pick one — the whole stage runs this way"*). It
is stored on the conversation and named in the session header for as long as it lasts. This
replaces the earlier "starting posture, not a lock" design: a mode nobody can name is a mode nobody
chose, and per-section provenance only means something if the capture method is a fact about the
session rather than whatever the user last clicked.

### Step 3 — Intake, switchable at any moment

The conversation surface gains a persistent header:

```
⌨️ Typing   ⇄ Switch      ████████░░░░░░░░  8 / 20 · all answers saved
```

Rules:

- **Switching is deliberate, not ambient.** ⇄ Switch opens a confirm that names the consequences before anything happens: *"Your 7 answered sections stay — they're saved to the same intake. The live call will end, and the remaining 2 questions will be asked in writing."* On confirm the thread gets a divider — "switched from live voice · 7 answers kept" — and the header changes. Both directions already work server-side (signed voice grant + per-turn persistence, 2026-07-19); what is added is the affordance, the confirm, and the record.
- **Only the active mode's control is shown.** This is the real behavioural change from the shipped composer, where all four methods sit as unlabelled peers and one is stumbled into rather than chosen.
- **Upload works during live voice.** Currently blocked (`disabled={… || voiceLive}` in `Composer.tsx`). The file parses, is swept, and the agent acknowledges it *in the call*: "Got your role brief — that covers scope and stakeholders, so I'll skip ahead." Nothing about ingest requires the call to end.
- **Saved state is visible.** Every turn writes to Postgres already; the header says so. This is the answer to "no matter what type of conversation, it all has to be written down and not lost."
- **Switching never resets progress.** Guaranteed by the answers table itself (Step 5, built 2026-09-05) — answers are rows keyed by question, so a mode change cannot touch them. `mergeCoverage()`'s ratchet is now only the fallback path for conversations that predate the table.

### Step 4 — Close the gaps

When coverage plateaus, or on demand, the remaining sections render as a checklist rather than more open interviewing. Per row: **Answer now** · **Unknown** · **Not yet decided** · **Skip**.

This maps exactly onto the prompt's completion rules — a question is complete when answered, or explicitly marked unknown / not yet decided / skipped — and it is what lets an interview *end* instead of running until the user gives up. Then: generate draft → review → approve (built).

## Step 5 — A live intake record  ✅ BUILT 2026-09-05

> **Scope correction (2026-09-05, Dana).** This section was originally written as the answer to "don't lose minutes of talking". It is not — durability is a separate concern and was fixed on its own (see *Durability* below). What this section actually buys is structure: answers that downstream agents and the UI can read, instead of prose only a model can interpret.

The flow above works properly only if extracted and spoken answers are **stored as answers**, not merely as transcript. Built FIRST rather than last (2026-09-05), because Steps 1–4 promise things — per-section provenance, "your answers are kept", a gap checklist — that cannot be honoured without it. Shipped as an `intake_answers` table keyed `(conversationId, questionId)` carrying `answer`, `status` (`answered` / `inferred` / `unknown` / `not_yet_decided` / `skipped`), `source` (`document` / `voice` / `dictation` / `typed`), `sourceRef` (file name or message id), and `updatedAt`.

Consequences:

- **Coverage becomes derived and deterministic** — a `GROUP BY` over the table, not a claude-haiku re-judgement of the whole transcript on every turn. Cheaper, instant, and it removes the class of bug `mergeCoverage()` was written to paper over.
- **The extraction-confirmation panel has something real to render**, with per-answer provenance — which also finally delivers the per-method provenance deferred on 2026-07-26.
- **The gap checklist is a query**, not an LLM summary.
- **The Phase-3 JSON record becomes a serialisation** of state that already exists, rather than the only place the state lives.
- **Downstream agents inherit structured answers**, not just the JD prose.

Write path: the agent emits a compact `[INTAKE ANSWERS]` JSON block per turn (question ids + status + source), the route persists it, the transcript stays the human-readable record. Additive — no existing behaviour changed. The block is withheld from the user as it streams, and on voice before ElevenLabs can read it aloud (`src/shared/intake-answers.ts`). Nothing is backfilled: conversations that predate the table keep the LLM scorer as a fallback, so no in-flight session lost its meter.

## Build order

1. ~~`intake_answers` table + derived coverage~~ — **done 2026-09-05.** Moved to first: it is the one real architectural change, and it is what makes everything below honest rather than decorative.
2. Step 0 launcher + resume card (`StageDrawer` stops auto-firing `INTAKE_START`; the opener is chosen by the user).
3. Multi-file upload (`Composer` `multiple`, `/api/upload-parse` loop, sequential sweep).
4. Step 2 mode chooser + Step 3 intake header — committed mode, switch confirm.
5. Unblock upload during live voice.
6. Extraction-confirmation panel, gap checklist and the provenance table — all queries against `intake_answers`.

Steps 2–5 are UI over machinery that already exists and ship independently.


---

## Durability — done (2026-09-05)

The separate requirement — *"if something goes wrong I don't want the user to lose minutes of talking"* — is implemented and does not depend on any of the flow work above.

Three holes were found and closed:

1. **Voice persistence was client-side only.** `voice-llm/handler.ts` receives every turn from ElevenLabs server-to-server but wrote nothing; the sole writer was the browser. A crashed tab, a slept laptop or a closed window lost everything spoken since the last successful POST. The handler now persists the transcript itself, allocating seq append-only from the signed grant's `baseSeq`, so durability is independent of the client. The browser's write is gone — two writers with different seq schemes would race.
2. **Text turns were persisted after the reply.** `appendTurns` wrote both halves once generation finished, so a failed or timed-out generation discarded the user's input too. Split into `appendUserTurn` (before the model runs, reserving the assistant's seq) and `appendAssistantTurn` (after). A failure now costs the reply, never the input.
3. **Composer text was never persisted.** A dictated or typed answer lived in React state until Send. Now mirrored to `localStorage` per thread, restored on load, cleared on send.

Supporting change: `messages` gained a **unique index on `(conversation_id, seq)`**, which makes inserts idempotent under `onConflictDoNothing()` — required because ElevenLabs retries a custom-LLM callback on timeout.

Applying it surfaced 6 real collisions in live data (2026-08-09 and 2026-09-04), every one the old client writer racing itself: user and assistant POSTs ~100ms apart, both reading `max(seq)+1` before either inserted. `scripts/migrate-message-seq-unique.ts` renumbers the affected conversations in `created_at` order and asserts the message count is unchanged — no row was deleted.

Guard: `npm run test:voice-durability` (16 checks, including the ElevenLabs-retry no-op and the browser-died scenario).
