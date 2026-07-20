# ADR-007 — Project as the Primary Entity

Date: 2026-07-21 | Status: **accepted** (Dana, 2026-07-21 — via AskUserQuestion during the build)

## Title
Introduce `projects` as the platform's top-level, unique-key entity. Every persisted conversation and artifact belongs to exactly one project; agent versioning moves from per-owner to per-project.

## Context
Build-queue step 3 ("roles/requisitions") was already planned as a linking layer between artifacts. Dana's framing raised the stakes: with 10 agents now runnable and Susan actively testing, artifacts and sessions were accumulating with no shared home — versioned per *user*, not per *hiring role*. Dana's own words: "project should be opened with whatever job they're trying to hire... under the project we'd have job description, competencies, and all artifacts... unique key and main ID for the whole thing." Without this, two job openings run by the same person collide into one version history, and there is no natural place to see "everything we have for this role" — the exact gap the original UX mockup's two-zone board assumed existed.

## Decision
1. **New `projects` table** — `id`, `title` (the role, e.g. "Head of DevOps"), `status` (open/filled/archived), `createdBy`, timestamps. This is the entity Dana calls the "main ID."
2. **`conversations.projectId` and `artifacts.projectId` are both NOT NULL.** Every persisted agent run happens inside a project (Dana's call: required, not optional, to keep one unique key for everything — no orphan/standalone case to design around).
3. **Artifact versioning key changes from (owner, agentSlug) to (projectId, agentSlug).** Two different projects each start their JD at v1; the version history Dana wants to browse per role now actually reads as one continuous history.
4. **Scope: Phase-1 only (Dana's call).** Projects bundle the four candidate-agnostic agents that chain together — job-description, competency-builder, panel-designer, interview-system-builder — plus screening-guide (the fifth persistable agent). Phase-2 candidate-scoped agents (feedback, rationale, blueprint, coach, recruiter-evaluation-report) stay outside the project model, per ADR-006 §5's existing personal-data boundary; a candidate sub-entity under project is explicitly deferred, not designed for yet.
5. **Migration (Dana's call): auto-migrate, don't orphan.** Existing conversations/artifacts (Dana's + Susan's live testing data) were backfilled into a "Legacy imports (<name>)" project per owner via `scripts/migrate-projects.ts` — nothing lost, nothing requires manual re-filing.
6. **RBAC unchanged**: projects follow the same admin-sees-all / member-sees-own model as everything else, keyed on `projects.createdBy`.

## Consequences
- Data model: `conversations` and `artifacts` both gain a required FK to `projects`; the previously-reserved, never-used `artifacts.roleId` column is dropped in favor of the real `projectId`.
- UI: a `/projects` list + `/projects/[id]` workspace become the new primary surface for the five persistable agents; the existing single-page chat now requires a project to be selected before starting or resuming one of those agents. The four Phase-2 agents keep their current ad-hoc, non-project flow unchanged.
- Chaining (agent 2's input auto-filled from agent 1's approved output within the same project) is enabled by this ADR but not built by it — it's the next step once the project entity exists.
- Migration executed once, live, against production data before this ADR was written up — see `scripts/migrate-projects.ts` for the exact steps (idempotent, safe to re-run).
- Deferred consciously: project deletion/archival UI, candidate sub-entities (Phase 2), cross-project reporting.
