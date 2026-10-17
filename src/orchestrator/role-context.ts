import { and, desc, eq } from "drizzle-orm";
import { adminDb, tables } from "@/db";

/**
 * What the JD agent knows about the role before the first question
 * (PRD v3 §3.1.4–5): the locked role facts, the company, the customer's own
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
    })
    .from(tables.projects)
    .innerJoin(tables.companies, eq(tables.companies.id, tables.projects.companyId))
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
  lines.push("# Role context (known before the briefing — supplied by the platform)");
  lines.push("");
  lines.push("These facts are already known. NEVER ask for them; build on them.");
  lines.push(`- Company: ${role.companyName}`);
  lines.push(`- Role title (locked): ${role.title}`);
  if (role.salaryMin != null && role.salaryMax != null) {
    lines.push(
      `- Annual base salary range (locked): ${role.salaryMin.toLocaleString("en")}–${role.salaryMax.toLocaleString("en")} ${role.salaryCurrency ?? ""} — ${
        role.showSalaryOnJd ? "may appear in the job description" : "internal only, never in the job description"
      }`
    );
  }
  if (role.hiringManagerEmail) lines.push(`- Hiring manager: ${role.hiringManagerEmail}`);
  lines.push("");
  lines.push(
    "The title and salary are locked. Do not ask what the role is called. Open with the role's purpose and why it exists now. " +
      "If the answers clearly describe a different job, say that this workspace covers only " +
      `"${role.title}" and suggest opening a new role.`
  );

  let budget = DOCS_MAX_CHARS;
  const profile = [
    role.about && `About the company:\n${role.about}`,
    role.values && `Values / leadership behaviours:\n${role.values}`,
    role.cultureNotes && `Culture notes:\n${role.cultureNotes}`,
  ].filter(Boolean) as string[];
  if (profile.length || docs.length) {
    lines.push("");
    lines.push("## Company documents (provided by the customer)");
    lines.push("Use them to skip questions they already answer; briefly confirm instead of asking cold.");
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
    lines.push("## Company research (internal — never quote, cite or reveal it to the user)");
    lines.push(
      "Background research on this company. Use it to understand the context and to ask sharper questions. " +
        "The hiring manager's answers win on role facts; if they contradict the research, follow the hiring manager."
    );
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
