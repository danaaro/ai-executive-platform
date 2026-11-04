import { and, desc, eq, inArray } from "drizzle-orm";
import { adminDb, tables } from "@/db";
import { cleanDeliverable } from "@/shared/clean-deliverable";
import { clientName } from "@/shared/jd-export";
import { questionBankIndex } from "@/orchestrator/job-description-orchestrator";
import { competencyOptions, coreCompetencies, INPUT_LIMITS } from "@/orchestrator/interview-kit";
import {
  KIT_LANGUAGES,
  KIT_SLUG,
  ROLE_LEVELS,
  type CompetencyOption,
  type KitInputs,
  type RoleLevel,
} from "@/shared/interview-kit-types";

/**
 * Where the Interview Kit's inputs come from (PRD §3, §5). Everything is read
 * from the role's own workspace; the browser only sends ids and choices, which
 * are re-checked here against the role and its company.
 *
 * Reads with the admin connection on purpose, like role-context.ts: every
 * caller has already established that the project belongs to the session's
 * company, and the Company Intel report lives in admin-only tables. The Intel
 * TEXT never leaves the server — the options only say whether one is attached.
 */

export type KitOptions = {
  company: string;
  title: string;
  jdVersions: { id: string; version: number; status: "draft" | "approved"; createdAt: string }[];
  hasResearch: boolean;
  hasProfile: boolean;
  documents: { id: string; filename: string }[];
  competencies: CompetencyOption[];
  defaults: Omit<KitInputs, "jdArtifactId" | "jdVersion"> & { jdArtifactId: string | null };
  kits: { id: string; version: number; createdAt: string; jdVersion: number | null }[];
};

const C_LEVEL = /\b(chief|ceo|cfo|coo|cto|cio|cmo|chro|cpo|cdo|president|managing director|general manager)\b/i;
export const guessRoleLevel = (title: string): RoleLevel => (C_LEVEL.test(title) ? "C-level" : "N-1 executive");

async function roleRow(projectId: string) {
  const [row] = await adminDb()
    .select({
      title: tables.projects.title,
      companyId: tables.projects.companyId,
      company: tables.companies.name,
      about: tables.companies.about,
      values: tables.companies.values,
      cultureNotes: tables.companies.cultureNotes,
      intelCompanyId: tables.companies.intelCompanyId,
    })
    .from(tables.projects)
    .innerJoin(tables.companies, eq(tables.companies.id, tables.projects.companyId))
    .where(eq(tables.projects.id, projectId))
    .limit(1);
  return row ?? null;
}

export async function kitOptions(projectId: string): Promise<KitOptions | null> {
  const role = await roleRow(projectId);
  if (!role) return null;
  const db = adminDb();
  const [jds, docs, kits] = await Promise.all([
    db
      .select({ id: tables.artifacts.id, version: tables.artifacts.version, status: tables.artifacts.status, createdAt: tables.artifacts.createdAt })
      .from(tables.artifacts)
      .where(and(eq(tables.artifacts.projectId, projectId), eq(tables.artifacts.agentSlug, "job-description")))
      .orderBy(desc(tables.artifacts.version)),
    db
      .select({ id: tables.companyDocuments.id, filename: tables.companyDocuments.filename })
      .from(tables.companyDocuments)
      .where(and(eq(tables.companyDocuments.companyId, role.companyId), eq(tables.companyDocuments.visibleToCustomer, true)))
      .orderBy(desc(tables.companyDocuments.createdAt)),
    db
      .select({ id: tables.artifacts.id, version: tables.artifacts.version, createdAt: tables.artifacts.createdAt, envelope: tables.artifacts.envelope })
      .from(tables.artifacts)
      .where(and(eq(tables.artifacts.projectId, projectId), eq(tables.artifacts.agentSlug, KIT_SLUG)))
      .orderBy(desc(tables.artifacts.version)),
  ]);
  const hasResearch = role.intelCompanyId ? Boolean(await intelReport(role.intelCompanyId)) : false;
  const preferred = jds.find((j) => j.status === "approved") ?? jds[0] ?? null;
  let company = role.company;
  if (preferred) {
    const [jd] = await db.select({ content: tables.artifacts.content }).from(tables.artifacts).where(eq(tables.artifacts.id, preferred.id)).limit(1);
    if (jd) company = clientName(cleanDeliverable(jd.content), role.company);
  }
  return {
    company,
    title: role.title,
    jdVersions: jds.map((j) => ({ ...j, createdAt: j.createdAt.toISOString() })),
    hasResearch,
    hasProfile: Boolean(role.about || role.values || role.cultureNotes),
    documents: docs,
    competencies: competencyOptions(),
    defaults: {
      jdArtifactId: preferred?.id ?? null,
      roleAndLevel: role.title,
      useResearch: hasResearch,
      useProfile: true,
      documentIds: docs.map((d) => d.id),
      extra: [],
      notes: "",
      roleLevel: guessRoleLevel(role.title),
      competencies: coreCompetencies(),
      suggest: false,
      language: "English",
    },
    kits: kits.map((k) => ({
      id: k.id,
      version: k.version,
      createdAt: k.createdAt.toISOString(),
      jdVersion: (k.envelope as { inputs?: { jdVersion?: number } } | null)?.inputs?.jdVersion ?? null,
    })),
  };
}

async function intelReport(intelCompanyId: string): Promise<string> {
  const [r] = await adminDb()
    .select({ content: tables.intelCompanyOutputs.content })
    .from(tables.intelCompanyOutputs)
    .where(and(eq(tables.intelCompanyOutputs.intelCompanyId, intelCompanyId), eq(tables.intelCompanyOutputs.kind, "report")))
    .orderBy(desc(tables.intelCompanyOutputs.version))
    .limit(1);
  return r?.content ?? "";
}

/**
 * The briefing's confidential answers (the `[internal]` sections of the JD
 * questionnaire: the Manager section, incl. 6.8 "why people struggled"), as
 * plain lines for the optional notes box (K3). Only ever added by the user.
 */
export async function briefingNotes(projectId: string): Promise<string> {
  const db = adminDb();
  const [conv] = await db
    .select({ id: tables.conversations.id })
    .from(tables.conversations)
    .where(and(eq(tables.conversations.projectId, projectId), eq(tables.conversations.agentSlug, "job-description")))
    .orderBy(desc(tables.conversations.updatedAt))
    .limit(1);
  if (!conv) return "";
  const bank = questionBankIndex();
  const rows = await db
    .select({ questionId: tables.intakeAnswers.questionId, answer: tables.intakeAnswers.answer })
    .from(tables.intakeAnswers)
    .where(eq(tables.intakeAnswers.conversationId, conv.id))
    .orderBy(tables.intakeAnswers.sectionId, tables.intakeAnswers.questionId);
  return rows
    .filter((r) => r.answer?.trim() && bank.get(r.questionId)?.tag === "internal")
    .map((r) => `- ${bank.get(r.questionId)!.text} ${r.answer!.trim()}`)
    .join("\n");
}

/** Validates the browser's choices against the role. Returns a clean copy or an error sentence. */
export async function sanitizeInputs(
  projectId: string,
  raw: unknown
): Promise<{ ok: true; inputs: KitInputs } | { ok: false; error: string }> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const role = await roleRow(projectId);
  if (!role) return { ok: false, error: "Role not found" };

  const jdId = str(b.jdArtifactId, 64);
  const [jd] = jdId
    ? await adminDb()
        .select({ id: tables.artifacts.id, version: tables.artifacts.version })
        .from(tables.artifacts)
        .where(and(eq(tables.artifacts.id, jdId), eq(tables.artifacts.projectId, projectId), eq(tables.artifacts.agentSlug, "job-description")))
        .limit(1)
    : [];
  if (!jd) return { ok: false, error: "Choose a job description version first." };

  const wanted = Array.isArray(b.documentIds) ? b.documentIds.filter((x): x is string => typeof x === "string").slice(0, 50) : [];
  const docs = wanted.length
    ? await adminDb()
        .select({ id: tables.companyDocuments.id })
        .from(tables.companyDocuments)
        .where(and(inArray(tables.companyDocuments.id, wanted), eq(tables.companyDocuments.companyId, role.companyId), eq(tables.companyDocuments.visibleToCustomer, true)))
    : [];

  const extra = (Array.isArray(b.extra) ? b.extra : [])
    .slice(0, 10)
    .map((e) => ({ name: str((e as Record<string, unknown>)?.name, 200), text: str((e as Record<string, unknown>)?.text, INPUT_LIMITS.intelligence) }))
    .filter((e) => e.text.trim());

  const valid = new Set(competencyOptions().map((c) => c.no));
  const competencies = [...new Set((Array.isArray(b.competencies) ? b.competencies : []).filter((n): n is number => typeof n === "number" && valid.has(n)))].sort((x, y) => x - y);
  if (competencies.length < 1 || competencies.length > 10) return { ok: false, error: "Choose between 1 and 10 leadership competencies." };

  const roleLevel = ROLE_LEVELS.includes(b.roleLevel as RoleLevel) ? (b.roleLevel as RoleLevel) : guessRoleLevel(role.title);
  const language = KIT_LANGUAGES.includes(b.language as never) ? (b.language as KitInputs["language"]) : "English";

  return {
    ok: true,
    inputs: {
      jdArtifactId: jd.id,
      jdVersion: jd.version,
      roleAndLevel: str(b.roleAndLevel, 300).trim() || role.title,
      useResearch: Boolean(b.useResearch) && Boolean(role.intelCompanyId),
      useProfile: Boolean(b.useProfile),
      documentIds: docs.map((d) => d.id),
      extra,
      notes: str(b.notes, INPUT_LIMITS.notes),
      roleLevel,
      competencies,
      suggest: Boolean(b.suggest),
      language,
    },
  };
}

/** The three input texts for INPUT BLOCK A, assembled from the stored choices. */
export async function assembleInputTexts(projectId: string, inputs: KitInputs): Promise<{ company: string; jd: string; intelligence: string; notes: string }> {
  const role = await roleRow(projectId);
  if (!role) throw new Error("Role not found");
  const db = adminDb();
  const [jd] = await db
    .select({ content: tables.artifacts.content })
    .from(tables.artifacts)
    .where(and(eq(tables.artifacts.id, inputs.jdArtifactId), eq(tables.artifacts.projectId, projectId)))
    .limit(1);
  if (!jd) throw new Error("The chosen job description version no longer exists.");

  const parts: string[] = [];
  if (inputs.useResearch && role.intelCompanyId) {
    const report = await intelReport(role.intelCompanyId);
    if (report) parts.push(`# Company research\n\n${report}`);
  }
  if (inputs.useProfile) {
    const profile = [
      role.about && `About the company:\n${role.about}`,
      role.values && `Values / leadership behaviours:\n${role.values}`,
      role.cultureNotes && `Culture notes:\n${role.cultureNotes}`,
    ].filter(Boolean);
    if (profile.length) parts.push(`# Company profile\n\n${profile.join("\n\n")}`);
  }
  if (inputs.documentIds.length) {
    const docs = await db
      .select({ filename: tables.companyDocuments.filename, content: tables.companyDocuments.content })
      .from(tables.companyDocuments)
      .where(and(inArray(tables.companyDocuments.id, inputs.documentIds), eq(tables.companyDocuments.companyId, role.companyId)));
    for (const d of docs) parts.push(`# Company document: ${d.filename}\n\n${d.content}`);
  }
  for (const e of inputs.extra) parts.push(`# Added document: ${e.name || "untitled"}\n\n${e.text}`);

  // The client named in the JD (a search firm's account writes JDs for its clients), else the account.
  const jdText = cleanDeliverable(jd.content);
  return { company: clientName(jdText, role.company), jd: jdText, intelligence: parts.join("\n\n---\n\n"), notes: inputs.notes };
}
