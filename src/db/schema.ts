import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Persistence layer v1 (ADR-006) + Project as primary entity (ADR-007)
 * + Project sharing and the approval trail (ADR-008).
 * - A `project` = one hiring role/requisition ("Head of DevOps"). It is the
 *   unique key everything else hangs off: every persisted conversation and
 *   every artifact belongs to exactly one project. Phase-1 only (ADR-007) —
 *   candidate-scoped agents stay outside the project model for now.
 * - Authorization is per-project membership (ADR-008), NOT `createdBy`.
 *   `project_members` is the unit; `admin` (mirrored from Clerk
 *   publicMetadata — Clerk stays the identity source of truth) sees
 *   everything and is not represented as a member row.
 * - Conversations exist ONLY for role-scoped agents (no personal data in
 *   the DB until Phase 2 retention lands) — enforced in the API layer.
 * - Artifacts are versioned slots per (project, agent); `status` moves
 *   draft → approved through an explicit, logged human action.
 */

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id
  email: text("email"),
  name: text("name"),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(), // the role being hired for, e.g. "Head of DevOps"
  // "draft" added for the wireframe #4b status chips. Plain text column with
  // a TS-level enum, so widening it needs no migration.
  status: text("status", { enum: ["open", "draft", "filled", "archived"] })
    .notNull()
    .default("open"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-project membership — the authorization unit (ADR-008 §1-4).
 *
 * `userId` is null for a pending invite: collaborators are invited by email
 * (wireframe #4c) and may not have signed in yet, so the row is created
 * against `invitedEmail` and bound to a Clerk id on first sign-in with that
 * address. Exactly one of (userId, invitedEmail) identifies a row, hence two
 * partial unique indexes rather than one composite key.
 *
 * Admins are NOT members — admin access comes from Clerk publicMetadata and
 * is resolved in getProjectAccess().
 */
export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    invitedEmail: text("invited_email"),
    role: text("role", { enum: ["owner", "editor", "viewer"] })
      .notNull()
      .default("viewer"),
    invitedBy: text("invited_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [
    index("project_members_project_idx").on(t.projectId),
    index("project_members_user_idx").on(t.userId),
    index("project_members_email_idx").on(t.invitedEmail),
    uniqueIndex("project_members_project_user_uq")
      .on(t.projectId, t.userId)
      .where(sql`${t.userId} is not null`),
    uniqueIndex("project_members_project_email_uq")
      .on(t.projectId, t.invitedEmail)
      .where(sql`${t.invitedEmail} is not null`),
  ]
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    agentSlug: text("agent_slug").notNull(),
    title: text("title"), // derived from the first real user message
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Intake-progress meter (2026-07-19): cached per-section coverage
    // {sections: [{id, name, status}]}, valid while coverageSeq equals the
    // conversation's message count — recomputed on demand when stale.
    coverage: jsonb("coverage"),
    coverageSeq: integer("coverage_seq"),
  },
  (t) => [
    index("conversations_owner_idx").on(t.createdBy, t.agentSlug),
    index("conversations_project_idx").on(t.projectId, t.agentSlug),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.seq)]
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    agentSlug: text("agent_slug").notNull(),
    // Slot key = (projectId, agentSlug). Version increments within the
    // slot; history is kept. Versioning moved from per-owner to per-project
    // (ADR-007) — two projects each start their JD at v1.
    version: integer("version").notNull(),
    label: text("label").notNull(),
    artifactType: text("artifact_type").notNull().default("final-output"),
    status: text("status", { enum: ["draft", "approved"] }).notNull().default("draft"),
    content: text("content").notNull(), // the Markdown artifact
    envelope: jsonb("envelope"), // structured extras: inputsSummary, promptVersion…
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("artifacts_slot_idx").on(t.projectId, t.agentSlug, t.version)]
);

/**
 * The human-oversight trail (ADR-008 §7). Append-only: nothing deletes from
 * here, including when an artifact is superseded by a later version. This is
 * the record that answers "who approved this hiring artifact, when, and with
 * what note" — an EU AI Act requirement for high-risk hiring systems, and the
 * thing UX-Shell.md meant by "every approval is logged, visible in the UI".
 *
 * `changes_requested` rows carry the note that re-enters the agent
 * conversation, so the revision loop is auditable too, not just the approval.
 */
export const artifactApprovals = pgTable(
  "artifact_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    action: text("action", { enum: ["approved", "changes_requested"] }).notNull(),
    note: text("note"),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("artifact_approvals_artifact_idx").on(t.artifactId, t.createdAt)]
);
