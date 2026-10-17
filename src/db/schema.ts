import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  jsonb,
  index,
  uniqueIndex,
  boolean,
  date,
  type AnyPgColumn,
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
  // Home company (ADR-010). Nullable: a first sign-in is mirrored before its
  // organization is known. Access is decided by the session's organization.
  companyId: uuid("company_id").references((): AnyPgColumn => companies.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The paying customer (ADR-010). One row per Clerk Organization; everything a
 * customer owns carries this row's id as `company_id`, taken from the signed-in
 * session, never from the browser.
 *
 * Not the same thing as `intel_companies` (admin-only research, ADR-009): a
 * customer may have no research, or research on a parent or other entity. An
 * admin may attach ONE report as hidden company context for every job
 * description run; renewing = detach, then attach the new one.
 */
export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
  // Hidden from the customer; set and cleared by admins only.
  intelCompanyId: uuid("intel_company_id").references((): AnyPgColumn => intelCompanies.id, {
    onDelete: "set null",
  }),
  // The customer's own profile, reused on every role (docs/customer-journey.md).
  about: text("about"),
  values: text("values"),
  cultureNotes: text("culture_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  // ADR-010: the owning customer, from the creator's session.
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  title: text("title").notNull(), // the role being hired for — locked once opened (ADR-011)
  // Locked role facts (ADR-011): set when the role is opened, never edited.
  // Annual base salary range; null only on roles opened before credits.
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryCurrency: text("salary_currency"),
  showSalaryOnJd: boolean("show_salary_on_jd").notNull().default(false),
  // The person who will approve the job description (enforced in JD v3).
  // Pending by email until they sign in.
  hiringManagerUserId: text("hiring_manager_user_id").references(() => users.id),
  hiringManagerEmail: text("hiring_manager_email"),
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
 * Role credits (ADR-011): an append-only ledger per company. Balance = sum of
 * `delta`. `grant` / `adjustment` rows are written by admins only (contract
 * reference, agreed price); customers can only insert a `spend` of −1, and
 * only by opening a role. Rows are never updated or deleted.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    kind: text("kind", { enum: ["grant", "spend", "adjustment"] }).notNull(),
    delta: integer("delta").notNull(),
    // Grants: what was agreed with the customer.
    priceAmount: integer("price_amount"), // whole currency units
    priceCurrency: text("price_currency"),
    contractRef: text("contract_ref"),
    note: text("note"),
    // Spends: the role this credit opened.
    projectId: uuid("project_id").references(() => projects.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("credit_ledger_company_idx").on(t.companyId, t.createdAt)]
);

/**
 * Admin activity log (guardrails.md: "log every admin action"). One row per
 * admin action — viewing a company, granting or correcting credits. Admin
 * connection only; customers have no access. Append-only.
 */
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(), // e.g. "company.view", "credits.grant", "credits.adjust"
    companyId: uuid("company_id").references(() => companies.id),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_audit_created_idx").on(t.createdAt)]
);

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
    // ADR-010: the owning customer. Copied from the parent row, never taken
    // from the browser.
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
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
    // ADR-010: the owning customer. Copied from the parent row, never taken
    // from the browser.
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
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
    // ADR-010: the owning customer. Copied from the parent row, never taken
    // from the browser.
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.seq),
    // Seq is UNIQUE per conversation, which makes an insert idempotent under
    // `onConflictDoNothing()`. The voice channel needs this: ElevenLabs
    // retries a custom-LLM callback on timeout, and the server persists the
    // in-session history on every callback — without the constraint a retry
    // would duplicate turns instead of no-op'ing.
    uniqueIndex("messages_conversation_seq_uniq").on(t.conversationId, t.seq),
  ]
);

/**
 * The intake record, stored as ANSWERS rather than transcript (2026-09-05).
 *
 * Until now the only machine-readable intake state was `conversations.coverage`
 * — a cached LLM re-judgement of the whole transcript, recomputed every turn,
 * carrying nothing but covered/partial/missing per section. Three things the
 * product now promises are impossible on that: per-section provenance ("how
 * each section was captured"), the guarantee that switching intake mode keeps
 * every answer, and a gap checklist that is a query rather than a summary.
 *
 * One row per (conversation, question-bank question ID). The transcript stays
 * the human-readable record; this is the structured one. The Phase-3 JSON the
 * agent emits at the end becomes a SERIALISATION of these rows instead of the
 * only place the state lives.
 */
export const intakeAnswers = pgTable(
  "intake_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // ADR-010: the owning customer. Copied from the parent row, never taken
    // from the browser.
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** Question-bank ID, e.g. "1.3" — the questionnaire is the source of truth. */
    questionId: text("question_id").notNull(),
    /**
     * The section number from `questionId` ("1.3" → 1), stored rather than
     * derived: the coverage meter groups by section on every read, and an
     * indexed column serves that directly instead of string-splitting in SQL.
     */
    sectionId: integer("section_id").notNull(),
    answer: text("answer"),
    /**
     * The prompt's completion vocabulary, unchanged: a question is complete
     * when answered, credited from something said elsewhere (`inferred`), or
     * explicitly marked unknown / not yet decided / skipped.
     */
    status: text("status", {
      enum: ["answered", "inferred", "unknown", "not_yet_decided", "skipped"],
    }).notNull(),
    /** Which intake method actually captured it — this is the provenance. */
    source: text("source", {
      enum: ["document", "voice", "dictation", "typed"],
    }).notNull(),
    /** File name for a document sweep, message id otherwise. */
    sourceRef: text("source_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A later turn REPLACES an earlier answer to the same question (the hiring
    // manager corrects themselves, or a document answer is refined in
    // conversation), so writes are upserts on this key, never appends.
    uniqueIndex("intake_answers_conversation_question_uniq").on(
      t.conversationId,
      t.questionId
    ),
    index("intake_answers_conversation_section_idx").on(t.conversationId, t.sectionId),
  ]
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // ADR-010: the owning customer. Copied from the parent row, never taken
    // from the browser.
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
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
    // ADR-010: the owning customer. Copied from the parent row, never taken
    // from the browser.
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
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

/**
 * Company Intelligence (ADR-009) — INTERNAL, admin-only research tool.
 * Renamed with an `intel_` prefix by ADR-010 so `companies` / `company_id`
 * mean the paying customer. Admins may attach one report to a customer
 * company (ADR-010 §3); nothing else links here.
 *
 * These four tables are the interim seed of the future CRM company record:
 * `intel_companies` is the entity the CRM will extend (contacts, deals, activity),
 * so nothing here is shaped around the research tool alone. Not connected to
 * projects, conversations or artifacts — the tool feeds no other agent.
 */
export const intelCompanies = pgTable("intel_companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  // lowercase, hyphenated, legal suffix stripped ("Acme Corp Ltd." → "acme")
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  website: text("website"),
  // Found from the company's own site (orchestrator/company-logo.ts); URL only.
  logoUrl: text("logo_url"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Documents we already hold about a company — highest-trust research source. */
export const intelCompanyInputs = pgTable(
  "intel_company_inputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intelCompanyId: uuid("intel_company_id")
      .notNull()
      .references(() => intelCompanies.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    content: text("content").notNull(), // extracted text, not the file
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("intel_company_inputs_company_idx").on(t.intelCompanyId)]
);

/**
 * The FACTS layer: one row per module run. The latest row per
 * (company, module) is current; older rows are history. Freshness =
 * researchedOn + shelfLifeDays vs today (the package's cache rule).
 */
export const intelCompanyResearch = pgTable(
  "intel_company_research",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intelCompanyId: uuid("intel_company_id")
      .notNull()
      .references(() => intelCompanies.id, { onDelete: "cascade" }),
    module: text("module").notNull(), // e.g. "05-culture-voice"
    content: text("content").notNull(), // the research-module Markdown, frontmatter included
    researchedOn: date("researched_on").notNull(),
    shelfLifeDays: integer("shelf_life_days").notNull(),
    coverage: text("coverage"), // full | partial | thin (as reported by the researcher)
    sourcesCount: integer("sources_count"),
    usage: jsonb("usage"), // tokens + web searches, the cost signal
    // The brief's "**Version:**" when researched; null = written before
    // versioning (treated as 1). A lower version than the current brief means
    // "saved — earlier brief": reused, but its new questions show as Unknown.
    briefVersion: integer("brief_version"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("intel_company_research_company_module_idx").on(t.intelCompanyId, t.module, t.createdAt)]
);

/** The INTERPRETATION layer: the versioned final report per company. */
export const intelCompanyOutputs = pgTable(
  "intel_company_outputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intelCompanyId: uuid("intel_company_id")
      .notNull()
      .references(() => intelCompanies.id, { onDelete: "cascade" }),
    // "report" is the deliverable; "brief"/"culture" = pre-2026-09-26 format, history only.
    // "section" = one category writer's output within a v2 run (ADR-009 §17).
    kind: text("kind", { enum: ["report", "section", "brief", "culture"] }).notNull(),
    /** Groups the section rows and the final report of one v2 run. */
    runId: uuid("run_id"),
    version: integer("version").notNull(),
    mode: text("mode", { enum: ["full", "culture-only"] }).notNull(),
    content: text("content").notNull(),
    // Structured report (src/shared/company-report.ts) — drives the visual page.
    // Null for pre-2026-09-26 rows, which only have Markdown.
    data: jsonb("data"),
    // A plain marker, not a gate — nothing depends on it (ADR-009 §2).
    reviewed: boolean("reviewed").notNull().default(false),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    usage: jsonb("usage"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("intel_company_outputs_company_kind_version_uq")
      .on(t.intelCompanyId, t.kind, t.version)
      .where(sql`${t.kind} <> 'section'`),
  ]
);
