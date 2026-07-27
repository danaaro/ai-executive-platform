# ADR-008 — Project Sharing and the Approval Trail

Date: 2026-07-26 | Status: **accepted** (Dana, 2026-07-26 — during the JD board-flow build)

## Title
Introduce per-project membership (`owner`/`editor`/`viewer`) as the platform's authorization unit, and make artifact approval an explicit, logged, human action that gates hand-off to downstream agents.

## Context
Two forces landed at once.

**The wireframes** (`input/AI hiring workspace wireframes.zip`, handoff 2026-07-26) specify a pipeline board per hiring position. Two of their screens have no backend at all: Home (`#4b`) splits positions into "Owned by you" and "Shared with you" with a per-viewer permission level, and New Position (`#4c`) invites collaborators at creation time. Equally, the board's central promise — "each stage's **approved** output automatically feeds the next stage's input" — depends on an approve action that does not exist. `artifacts.status` has carried a `draft | approved` enum since ADR-006, but nothing has ever written `approved`.

**The authorization model** inherited from ADR-006/007 is `createdBy === user.id || role === "admin"`. That was correct while SusieBrain had exactly two users who were both admins. It cannot express "Susan owns this search, the hiring manager can draft in it, the client can read it" — which is the actual product. Worse, it is scattered: eight route handlers each re-derive ownership from a `createdBy` column, and `appendTurns()` silently **forks a conversation** when `createdBy` doesn't match, which on a shared board would fragment a stage's thread every time a second person typed into it.

Human oversight is also a compliance requirement, not only a UX one: the EU AI Act treats hiring as high-risk, and "a human approved this artifact, at this time, with this note" is the record that has to exist. UX-Shell.md already committed to it ("Every approval is logged — visible in the UI, not buried"); it was never built.

## Decision

1. **`project_members` is the authorization unit.** `(projectId, userId, role, invitedEmail, invitedBy)`, roles `owner | editor | viewer`. A project's creator gets an `owner` row at creation. Existing projects are backfilled one owner row each (`scripts/backfill-project-members.ts`) — the backfill must run *before* the access refactor deploys, or every existing project becomes invisible to its owner.

2. **Invitations are by email and may precede the account.** A row with `invitedEmail` and a null `userId` is a pending invite; it binds to a `userId` on first sign-in with that address. This matches the Clerk invite-only sign-up mode already in force and avoids requiring the inviter to know a Clerk user id.

3. **`getProjectAccess(projectId, user)` replaces `assertProjectAccess`, and is the single choke point.** It returns `owner | editor | viewer | admin | null`. Every `createdBy === user.id` ownership check in the API layer is converted to call it. Admin (from Clerk `publicMetadata.role`, per ADR-006) continues to see everything and is not represented as a member row.

4. **Write access is `owner | editor | admin`.** Viewers may read a project, its board, its conversations and its artifacts; they may not send turns, save artifacts, approve, or invite.

5. **`appendTurns()` gates on project write access, not `createdBy`.** The existing "fork on mismatch" behaviour is retained *only* for a genuine mismatch of project or agent — never for a different-but-authorized user. A stage thread is shared by the people working the stage.

6. **Artifact access derives from the project, not from `artifacts.createdBy`.** A collaborator who can see a stage on the board can open the artifact behind it. `createdBy` remains as provenance.

7. **Approval is explicit, human, versioned and logged.** `POST /api/artifacts/[id]/approve` sets `status = "approved"` on the latest version of a `(project, agent)` slot and writes an `artifact_approvals` row `(artifactId, action, actorId, note, createdAt)`. `POST .../request-changes` writes the same row with `action = "changes_requested"` and a note that re-enters the agent conversation. Only the latest version in a slot is approvable — approving history would make "which one feeds downstream?" ambiguous.

8. **Approval gates hand-off, but not access — gating is flexible** (wireframe `#3b`, superseding UX-Shell.md decision 2). Every stage stays open to work on at any time; opening a stage whose dependency lacks an approved artifact shows a soft warning, not a lock. What approval controls is **inheritance**: only an approved upstream artifact is injected into a downstream agent's first turn.

9. **Inheritance is assembled server-side.** `POST /api/agents/[slug]` accepts `inherit: true` on the first turn of an empty thread; the server reads the approved artifacts of the slug's declared `dependsOn` slots and prepends them. The client never carries the upstream content, so it cannot be substituted, and the voice channel gets the same behaviour for free.

## Consequences

- **The access refactor is one atomic change across eight handlers** (`projects`, `projects/[id]`, `artifacts`, `conversations` ×4, `voice-token`) plus `appendTurns`. Partial application would leak data between projects; it lands together or not at all.
- **`GET /api/projects` now returns `owned` and `shared` separately**, and both project endpoints return a derived stage rollup — Home's 4-node indicator and the board's card states come from one server-side function (`src/orchestrator/stages.ts`) rather than being re-derived per screen.
- **Roles are per project, not per organization.** Clerk Organizations (build-queue step 6, multi-tenancy) remains a separate, later decision; this ADR deliberately does not pre-empt it. When tenancy lands, `project_members` becomes tenant-scoped rather than being replaced.
- **`artifact_approvals` is append-only** and is the EU AI Act human-oversight record. Nothing deletes from it, including when an artifact is superseded.
- **`projects.status` gains `draft`** (wireframe chips: `open / draft / filled / archived`). It is a plain `text` column with a TypeScript-level enum, so this is a code-only change.
- **Deferred consciously:** inline comment-on-a-line markup for request-changes (free-text note instead, per Dana 2026-07-26), per-method provenance on intake answers, notification/email on invite, and revoking an approval (a new version supersedes instead).
