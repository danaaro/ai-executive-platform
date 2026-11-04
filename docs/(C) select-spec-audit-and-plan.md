# (C) Select spec v1.0: phase 1 audit and build plan

Date: 2026-11-04 · Against: `input/white-falcon-select-spec.md` v1.0 · Code: `ai-executive-platform` @ cd601b6 + uncommitted work

Status: **audit only, nothing changed in code.** Spec §0.3 asks for approval before large refactors; items marked **[decide]** need Dana/Susie.

---

## 1. Verdict

JD and kit **work functionally** (generate, view, version, approve, export, tenant-isolated) but are **not built on the spec's data model**. Of the 11 acceptance tests: **5 pass, 3 partly, 3 fail.**

The biggest gaps:
1. **JD is a versioned blob, not a structured record.** Every save inserts a new row (test 3 fails by design). No `context / mission / responsibilities / requirements` fields — Markdown only.
2. **Kit competencies are JSON inside `artifacts.envelope`, not tables.** No first-class Competency / Question / Rubric rows, no kit status `approved/locked`. Phase 2 feedback (scores per `competency_id`) can't attach to this cleanly.
3. **Client screens can show the wrong role after fast switching** (no stale-response guard on role and kit loads). Test 5 at risk.
4. **Kit API routes bypass row-level security** (`adminDb` after an access check). Safe today, but the repo's own tenancy check flags all 3 routes.

## 2. Acceptance tests (spec §5)

| # | Test | Result | Why |
|---|---|---|---|
| 1 | Same title in 2 companies, each sees only its own | ✅ Pass | `projects.company_id` from session; `getProjectAccess` returns null cross-company |
| 2 | B/CFO JD empty, not A's | ✅ Pass | JD loaded by `project_id` |
| 3 | Save JD 3× → exactly one JD row | ❌ Fail | `agents/[slug]/save` inserts version+1 every time. Intentional (ADR-008 approval trail) — see **D1** |
| 4 | JD edit → kit "out of date", content unchanged | 🟡 Partly | Banner exists ("Built from JD v2; v3 is available"), kit never regenerates. But it's derived from version numbers, no stored kit flag, wording differs |
| 5 | Fast role switching incl. back/forward | 🟡 At risk | `projects/[id]/page.tsx` and `use-project-detail.ts` and `kit/page.tsx` `load()` have no abort/alive guard; a slow response from role 1 can land after role 2. `KitView` is keyed by `kitId` (good). `DraftReview` already does it right |
| 6 | Switch company → panels clear | ✅ Pass | Company switch is a full page load (`/api/admin/enter` cookie). Customers have one company |
| 7 | Add / reorder / delete competency, children follow, no orphans | ❌ Fail | Competencies aren't rows. Edit can't add/remove/reorder (structure-change edits are refused). No orphans possible, but the feature doesn't exist |
| 8 | Integrity script (FKs all valid) | 🟡 Partly | FKs exist for role→company, artifact→role. No kit children to check. No script exists |
| 9 | Admin of A → B's role = not found | ✅ Pass | 404, same as missing. **But** kit routes use `adminDb` (RLS off) after the check — defense-in-depth gap |
| 10 | Archive role → gone from list, JD/kit retrievable | ✅ Pass | `status = archived`, super-admin only, filtered in UI. Spec wants `archived_at` + server-side filter |
| 11 | Refresh on kit tab reloads same role's kit | ✅ Pass | `/projects/[id]/kit?kit=<id>` in URL |

Test harness note: `npm run rehearse:tenancy` crashed in seeding on a PGlite `ECONNRESET` both runs, so its runtime isolation checks didn't execute. Static part ran: 3 kit routes flagged.

## 3. Mismatch report

| Entity / area | Spec says | Code does | Proposed fix |
|---|---|---|---|
| **Naming** | Company, Role, JD, Kit | `companies`, `projects`, `artifacts(agent_slug='job-description')`, `artifacts(agent_slug='interview-kit')` | Keep table names (renaming = churn). Add a glossary in `docs/repo-structure.md`; use spec names in new code |
| **Roles / users** | Superuser (WF) · Admin (client HM/recruiter) · Interviewer | `users.role`: `admin` = WF superuser, `member` = client. Per-role `owner/editor/viewer` | **[decide] D4** "Admin" means opposite things. Map: Superuser=`admin`, client Admin=`owner/editor`, Interviewer=new. Rename code `admin`→`superuser` |
| Company | `archived_at`, archive cascades to roles | No archive at all | Add `archived_at`; archive sets it on company + roles. Small |
| Role status | `draft → open → on_hold → filled / closed` + `archived_at` | `open / draft / filled / archived` (archive is a status) | Add `on_hold`, `closed`; move archive to `archived_at`; migrate `archived` rows. Small |
| Role owner | `owner_user_id` | `hiring_manager_user_id` (+ pending email) + `created_by` | Equivalent. Keep, alias in glossary |
| Role list | Server never returns other companies' roles; archived hidden | Company filter ✅; archived filtered **client-side only** | Filter `archived_at is null` in `GET /api/projects` (superuser can request archived) |
| **JD — record** | One row per role, `role_id` unique, update in place | N rows per role (versions), latest wins | **[decide] D1** — recommend new `job_descriptions` table (unique `role_id`, current fields) + keep `artifacts` rows as immutable version history for the approval trail |
| JD — fields | `context, mission, responsibilities, requirements, body, updated_by` | `content` Markdown only | Parse sections from the JD writer's output into fields (writer already uses fixed headings) |
| JD → kit staleness | Stored flag "out of date with JD" + banner | Compares `inputs.jdVersion` to latest JD version at read time | Store `kits.generated_from_jd_at`; stale = `jd.updated_at > kit.generated_from_jd_at`. Reword banner |
| **Kit — record** | `kits` table: `version, status, generated_from_jd_at, logic` | `artifacts` row, structure in `envelope` jsonb | New `kits` table (keep versioning, cap 20) |
| Kit status | `draft → approved → locked` | Always `draft`; kit has no approve action | Add status + approve action now; `locked` wired in phase 2 |
| Kit logic | `logic` stored | `howWeAssess()` generated at read time from fixed text | Store it on the kit row at generation |
| **Competency** | First-class row: `name, description, order, weight` | `GuideArea` objects nested under 4 attributes (PE/CC/LF/MF), id from the model | **[decide] D2** — rows, with `attribute` as a column (keeps Susan's 4-cluster structure). Ids = server UUIDs, never model-generated |
| Question / hint | `text, hint, order` | `{q, probes[]}` | `text = q`, `hint = probes` joined (or `hints[]`) |
| Rubric level | `score (1–4), descriptor` | `{level: string, text}` | Map level labels → integer score |
| Recruiter screen part | Not in spec | Separate part with its own areas, questions, rubric | **[decide] D3** — treat screen areas as competencies with `stage = screen`, or keep screen as a kit section outside the model |
| Competency edit ops | Add / reorder / delete, cascade children | Text-only edits; structure changes refused | Build on the new tables |
| Tenancy (kit routes) | Backend enforcement | `kitAccess()` check, then `adminDb` (RLS bypassed) | Move kit routes to `tenantRoute`/`withTenant`; RLS policies on new tables |
| Screen state (test 5) | Never show last-viewed role's data | No stale guard on role and kit option loads | `AbortController` / alive flag keyed on `role_id`, header and panels both read the same response |
| Integrity script (test 8) | Required | None | `scripts/check-integrity.ts`, runs in CI and on demand |
| Automated tests (§0.4) | One per acceptance test | Separate tsx scripts, no shared runner | `npm run test:select-phase1` running all 11 against throwaway PGlite |
| Branding | White Falcon | Exec10X throughout | **[decide] D5** — out of scope for the data model; separate rename task |

## 4. Decisions

**Decided 2026-11-04 (Dana), logged in `docs/decisions.md`:**
- **D1 ✅** One current JD per role, plus a history snapshot for every save and approval. Before approval, the HM edits and saves directly.
- **D2 ✅** PE/CC/LF/MF stay, as a column on competency.
- **D3 ✅** Screen areas = competencies with `stage = screen`.
- **D4 ✅** Superuser = White Falcon; Admin = the client's HM or recruiter, per company. Code `admin` → `superuser`; add a company-level Admin.
- **D5 ✅** Rename to White Falcon goes on the TODO, after phase 1.

JD editing before approval already exists (2026-11-01): Role → Job description → review page → **Edit** under "Your decision". It saves a new draft version. Stage 1b moves it onto the single JD row plus history and makes it easier to find.

Original options, for the record:

- **D1 — JD versions vs. "one JD row" (strong reason to deviate).** The spec's single updated-in-place JD would delete the approval history (who approved which version, ADR-008 / EU AI Act high-risk hiring). Recommend: **one `job_descriptions` row per role = current JD (satisfies the spec and test 3), plus immutable version snapshots on every save/approve.** Test 3 then reads "exactly one JD row; N history rows".
- **D2 — Keep Susan's 4 attributes (PE/CC/LF/MF)?** Recommend yes, as a column on competency, not a 5th entity.
- **D3 — Recruiter screen:** competencies with `stage = screen` (recommended: phase 2 feedback can score the screen too) vs. a free-standing section.
- **D4 — Role vocabulary:** rename code `admin` → `superuser`; client "Admin" = role owner/editor at company level. Needs a company-level admin flag, since today access is per role, not per company.
- **D5 — Exec10X → White Falcon** rename: when, and does the domain change?

## 5. Plan

### Stage 1a — Make what exists safe (no data model change) · ~1 day
1. Stale-response guards on role page, `use-project-detail`, kit page options load (test 5).
2. Kit routes under tenant scope / RLS; tenancy static check goes green (test 9).
3. Server-side archived filter on role list (test 10).
4. Fix the PGlite seeding flake so `rehearse:tenancy` runs end to end.
5. `scripts/check-integrity.ts` for what exists today (test 8, partial).

### Stage 1b — Spec data model · ~4–6 days, after D1–D4
1. Migration: `companies.archived_at`; role `status` values + `archived_at`; migrate `archived`.
2. `job_descriptions` (current) + version snapshots; backfill from latest JD artifact per role, parsing sections into fields.
3. `kits`, `kit_competencies`, `kit_questions`, `kit_rubric_levels`; RLS on all; backfill from existing kit envelopes (all versions).
4. Kit writer saves into tables (model output parsed → rows, server-issued UUIDs). Envelope kept read-only for legacy versions until backfill is verified.
5. Kit status `draft/approved` + approve action; `generated_from_jd_at` + stored "out of date" banner.
6. Competency add / reorder / delete with cascading children, unlocked kits only. Locked = read-only, edit creates a new version (copy rows).
7. JD and kit screens read the new tables; downloads (Word/PDF) render from rows.
8. `npm run test:select-phase1`: all 11 acceptance tests automated on throwaway Postgres. **Phase 1 gate: all green, Dana clicks through signed in.**

### Stage 2a — Candidates & applications (after gate)
- `candidates` (owner = WF or company, dedupe external_id → email → LinkedIn, consent fields) + top-level **Candidates** nav.
- `applications` (unique candidate+role, statuses incl. `withdrawn`) + Role → Candidates tab, assign/unassign.
- Recruiterflow import via MCP (name-only → `needs_enrichment`); manual add (CV / LinkedIn).
- Visibility rule: client sees own + WF candidates only while assigned to its roles.

### Stage 2b — Interviewers & interviews
- Company-level users with Interviewer role; `role_interviewers`; interviewer sees only JD + kit for assigned roles.
- `interviews` (+ panel join), GDPR consent gate before recording/transcription; first interview locks the kit version.

### Stage 2c — Feedback & hire decision
- `feedback` + `competency_scores` (by `competency_id`), AI draft from transcript + kit, blind-until-submitted.
- Hire-decision screen: per-competency averages, disagreements, candidate comparison, "Chat about role fit" grounded only in stored scores/evidence.

### Stage 2d — Finalist checks
- Reference check, background check, onboarding doc, gated on `finalist` / `hired`.

Open questions from spec §6 must be closed before 2a (ownership, retention), 2b ("one mandatory", kit per interviewer) and 2d (onboarding timing).
