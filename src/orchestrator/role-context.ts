import { and, desc, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { adminDb, tables } from "@/db";

/**
 * What the JD agent knows about the role before the first question
 * (PRD v3 §3.1.4–5). Facts only — how the agent uses them (Phase 0) lives in
 * prompts/01-job-description.md. Contents: the locked role facts, the company, the customer's own
 * company documents and — hidden from the customer — the attached Company
 * Intel report. Built server-side only and sent to the model as a separate
 * system block after the cached base prompt, so prompt caching still works
 * and none of it ever reaches the browser.
 *
 * Reads with the admin connection on purpose: the caller has already
 * established the project belongs to the session's company (text route) or
 * comes from a signed voice grant (voice route), and the Intel report lives in
 * admin-only tables.
 *
 * Role facts are locked once the role is opened (ADR-011), so the assembled
 * block is cached per project for a few minutes — no database trips on most
 * turns.
 */

const CACHE_MS = 5 * 60 * 1000;
const INTEL_MAX_CHARS = 12_000;
const DOCS_MAX_CHARS = 20_000;
const cache = new Map<string, { text: string; at: number }>();

/** Section headings + usage rules, from prompts/01-job-description-context.md. */
let labels: Record<string, string> | null = null;
function label(name: "facts" | "documents" | "research", fill: Record<string, string>): string {
  if (!labels) {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "products/interview-intelligence/prompts/01-job-description-context.md"),
      "utf-8"
    );
    labels = {};
    for (const part of raw.replace(/^---\n[\s\S]*?\n---\n/, "").split(/^## (?=facts|documents|research)/m).slice(1)) {
      const [key, ...rest] = part.split("\n");
      labels[key.trim()] = rest.join("\n").trim();
    }
  }
  return (labels[name] ?? "").replace(/\{(\w+)\}/g, (_, k: string) => fill[k] ?? "");
}

export async function roleContextBlock(projectId: string): Promise<string> {
  const hit = cache.get(projectId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;

  const db = adminDb();
  const [role] = await db
    .select({
      title: tables.projects.title,
      companyId: tables.projects.companyId,
      salaryMin: tables.projects.salaryMin,
      salaryMax: tables.projects.salaryMax,
      salaryCurrency: tables.projects.salaryCurrency,
      showSalaryOnJd: tables.projects.showSalaryOnJd,
      hiringManagerEmail: tables.projects.hiringManagerEmail,
      companyName: tables.companies.name,
      about: tables.companies.about,
      values: tables.companies.values,
      cultureNotes: tables.companies.cultureNotes,
      intelCompanyId: tables.companies.intelCompanyId,
      intelName: tables.intelCompanies.name,
    })
    .from(tables.projects)
    .innerJoin(tables.companies, eq(tables.companies.id, tables.projects.companyId))
    .leftJoin(tables.intelCompanies, eq(tables.intelCompanies.id, tables.companies.intelCompanyId))
    .where(eq(tables.projects.id, projectId))
    .limit(1);
  if (!role) return "";

  const [docs, intel] = await Promise.all([
    db
      .select({ filename: tables.companyDocuments.filename, content: tables.companyDocuments.content })
      .from(tables.companyDocuments)
      .where(and(eq(tables.companyDocuments.companyId, role.companyId), eq(tables.companyDocuments.visibleToCustomer, true)))
      .orderBy(desc(tables.companyDocuments.createdAt)),
    role.intelCompanyId
      ? db
          .select({ content: tables.intelCompanyOutputs.content })
          .from(tables.intelCompanyOutputs)
          .where(
            and(
              eq(tables.intelCompanyOutputs.intelCompanyId, role.intelCompanyId),
              eq(tables.intelCompanyOutputs.kind, "report")
            )
          )
          .orderBy(desc(tables.intelCompanyOutputs.version))
          .limit(1)
      : Promise.resolve([] as { content: string }[]),
  ]);

  const lines: string[] = [];
  lines.push(label("facts", { company: role.companyName, title: role.title }));
  lines.push("");
  lines.push(`- Company: ${role.companyName}`);
  lines.push(`- Role title (locked): ${role.title}`);
  if (role.salaryMin != null && role.salaryMax != null) {
    lines.push(
      `- Annual base salary range (locked): ${role.salaryMin.toLocaleString("en")}–${role.salaryMax.toLocaleString("en")} ${role.salaryCurrency ?? ""} (${
        role.showSalaryOnJd ? "may appear in the job description" : "internal only"
      })`
    );
  }
  if (role.hiringManagerEmail) lines.push(`- Hiring manager: ${role.hiringManagerEmail}`);

  let budget = DOCS_MAX_CHARS;
  const profile = [
    role.about && `About the company:\n${role.about}`,
    role.values && `Values / leadership behaviours:\n${role.values}`,
    role.cultureNotes && `Culture notes:\n${role.cultureNotes}`,
  ].filter(Boolean) as string[];
  if (profile.length || docs.length) {
    lines.push("");
    lines.push(label("documents", {}));
    for (const p of profile) {
      const chunk = p.slice(0, budget);
      budget -= chunk.length;
      lines.push("", chunk);
    }
    for (const d of docs) {
      if (budget <= 0) break;
      const chunk = d.content.slice(0, budget);
      budget -= chunk.length;
      lines.push("", `### ${d.filename}`, chunk);
    }
  }

  if (intel[0]?.content) {
    lines.push("");
    lines.push(label("research", { research_subject: role.intelName ?? "the company" }));
    lines.push("", intel[0].content.slice(0, INTEL_MAX_CHARS));
  }

  const text = lines.join("\n");
  cache.set(projectId, { text, at: Date.now() });
  return text;
}

/** Forget a project's cached context (e.g. after company documents change). */
export function forgetRoleContext(projectId?: string) {
  if (projectId) cache.delete(projectId);
  else cache.clear();
}
