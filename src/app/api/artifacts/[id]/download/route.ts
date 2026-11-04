import { tenantRoute } from "@/shared/tenant-route";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminDb, db, tables } from "@/db";
import { requireUser, dbEnabled, getProjectAccess } from "@/shared/current-user";
import { errorSummary } from "@/shared/safe-log";
import { exportFilename, loadClientLogo, renderDocx, renderHtml, renderPdf, renderText, roleId, type ExportMeta } from "@/shared/jd-export";
import { cleanDeliverable } from "@/shared/clean-deliverable";
import { kitMarkdown, renderKitDocx, renderKitHtml, renderKitText, type KitDoc } from "@/shared/kit-export";
import { assembleInputTexts } from "@/shared/kit-inputs";
import { howWeAssess } from "@/orchestrator/interview-kit";
import { KIT_SLUG, type InterviewGuide, type KitEnvelope, type RecruiterScreen } from "@/shared/interview-kit-types";

/**
 * Branded download of one artifact version (PRD v4 §13): every version, draft
 * or approved, from the moment a job description exists. Job descriptions and
 * interview kits.
 *
 *   GET /api/artifacts/<id>/download?format=docx|pdf|html|md|txt[&inline=1]
 *
 * html is also what "Open in Google Docs" copies (inline=1: shown, not saved);
 * md suits Notion and similar tools; txt suits ATS fields (Ashby, Workday).
 *
 * Access comes from the PROJECT like every artifact route (ADR-008 §6): any
 * member who can see the role may download. Title and company are read from
 * the locked role and the session's company, never from the request. The
 * client's logo comes from the Company Intel record an admin linked to the
 * company; without one the header shows the company name.
 */
export const GET = tenantRoute(async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const format = req.nextUrl.searchParams.get("format") as Format | null;
  if (!format || !(format in TYPES)) {
    return NextResponse.json({ error: "format must be docx, pdf, html, md or txt" }, { status: 400 });
  }
  const inline = req.nextUrl.searchParams.get("inline") === "1";

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = db();
  const [row] = await d
    .select({
      content: tables.artifacts.content,
      agentSlug: tables.artifacts.agentSlug,
      envelope: tables.artifacts.envelope,
      version: tables.artifacts.version,
      status: tables.artifacts.status,
      projectId: tables.artifacts.projectId,
      title: tables.projects.title,
      company: tables.companies.name,
      companyId: tables.companies.id,
    })
    .from(tables.artifacts)
    .innerJoin(tables.projects, eq(tables.projects.id, tables.artifacts.projectId))
    .innerJoin(tables.companies, eq(tables.companies.id, tables.artifacts.companyId))
    .where(eq(tables.artifacts.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await getProjectAccess(row.projectId, user);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meta: ExportMeta = {
    title: row.title,
    company: row.company,
    roleId: roleId(row.projectId),
    version: row.version,
    status: row.status,
    clientLogo: await loadClientLogo(await clientLogoUrl(row.companyId)),
  };

  if (row.agentSlug === KIT_SLUG) {
    try {
      const env = row.envelope as KitEnvelope;
      let company = row.company;
      try {
        company = (await assembleInputTexts(row.projectId, env.inputs)).company;
      } catch {
        /* JD version gone: the account name stands in */
      }
      const kit: KitDoc = {
        company,
        howWeAssess: howWeAssess(company),
        screen: (env.parts.screen?.data as RecruiterScreen | null) ?? null,
        interviews: (env.parts.interviews?.data as InterviewGuide | null) ?? null,
        roleLevel: env.inputs.roleLevel,
      };
      const kitMeta: ExportMeta = { ...meta, company, docLabel: "Interview kit", noState: true };
      const file =
        format === "docx"
          ? await renderKitDocx(kit, kitMeta)
          : format === "pdf"
            ? await renderPdf(kitMarkdown(kit), kitMeta)
            : format === "html"
              ? renderKitHtml(kit, kitMeta)
              : format === "md"
                ? kitMarkdown(kit)
                : renderKitText(kit, kitMeta);
      return fileResponse(file, format, exportFilename(kitMeta, format), inline);
    } catch (err) {
      console.error("[artifact-download] kit", errorSummary(err));
      return NextResponse.json({ error: "Could not build the file" }, { status: 500 });
    }
  }

  try {
    // Cleaned here too, so versions saved before the save-time cleanup export clean.
    const doc = cleanDeliverable(row.content);
    const file =
      format === "docx"
        ? await renderDocx(doc, meta)
        : format === "pdf"
          ? await renderPdf(doc, meta)
          : format === "html"
            ? renderHtml(doc, meta)
            : format === "md"
              ? doc
              : renderText(doc, meta);
    return fileResponse(file, format, exportFilename(meta, format), inline);
  } catch (err) {
    console.error("[artifact-download]", errorSummary(err));
    return NextResponse.json({ error: "Could not build the file" }, { status: 500 });
  }
});

type Format = "docx" | "pdf" | "html" | "md" | "txt";
const TYPES: Record<Format, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  html: "text/html; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

function fileResponse(file: Buffer | string, format: Format, filename: string, inline: boolean): Response {
  return new Response(typeof file === "string" ? file : new Uint8Array(file), {
    headers: {
      "Content-Type": TYPES[format],
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      // A downloaded HTML file is ours, not a page to run scripts in.
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    },
  });
}

/**
 * The client's logo URL, found on its own site by Company Intel. Intel tables
 * are admin-only and invisible to the tenant role, so this is a deliberate
 * adminDb() exception (ADR-010 §7): it reads one URL, for the company whose
 * artifact the caller was just authorised to download, and nothing else.
 */
async function clientLogoUrl(companyId: string): Promise<string | null> {
  try {
    const [r] = await adminDb()
      .select({ logoUrl: tables.intelCompanies.logoUrl })
      .from(tables.companies)
      .innerJoin(tables.intelCompanies, eq(tables.intelCompanies.id, tables.companies.intelCompanyId))
      .where(eq(tables.companies.id, companyId))
      .limit(1);
    return r?.logoUrl ?? null;
  } catch {
    return null;
  }
}
