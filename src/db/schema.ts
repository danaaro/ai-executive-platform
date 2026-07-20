import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Persistence layer v1 (ADR-006) + Project as primary entity (ADR-007).
 * - Per-user data; `admin` role sees everything (role mirrored from Clerk
 *   publicMetadata — Clerk stays the identity source of truth).
 * - A `project` = one hiring role/requisition ("Head of DevOps"). It is the
 *   unique key everything else hangs off: every persisted conversation and
 *   every artifact belongs to exactly one project. Phase-1 only (ADR-007) —
 *   candidate-scoped agents stay outside the project model for now.
 * - Conversations exist ONLY for role-scoped agents (no personal data in
 *   the DB until Phase 2 retention lands) — enforced in the API layer.
 * - Artifacts are versioned slots per (project, agent); the `status` field
 *   is pre-wired for the draft-&-approve step.
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
  status: text("status", { enum: ["open", "filled", "archived"] }).notNull().default("open"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
