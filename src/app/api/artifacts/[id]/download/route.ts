import { tenantRoute } from "@/shared/tenant-route";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminDb, db, tables } from "@/db";
import { requireUser, dbEnabled, getProjectAccess } from "@/shared/current-user";
import { errorSummary } from "@/shared/safe-log";
import { exportFilename, loadClientLogo, renderDocx, renderPdf, roleId, type ExportMeta } from "@/shared/jd-export";
import { cleanDeliverable } from "@/shared/clean-deliverable";

/**
 * Branded Word / PDF download of one artifact version (PRD v4 §13): every
 * version, draft or approved, from the moment a job description exists.
 *
 *   GET /api/artifacts/<id>/download?format=docx|pdf
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

  const format = req.nextUrl.searchParams.get("format");
  if (format !== "docx" && format !== "pdf") {
    return NextResponse.json({ error: "format must be docx or pdf" }, { status: 400 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = db();
  const [row] = await d
    .select({
      content: tables.artifacts.content,
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

  try {
    // Cleaned here too, so versions saved before the save-time cleanup export clean.
    const doc = cleanDeliverable(row.content);
    const file = format === "docx" ? await renderDocx(doc, meta) : await renderPdf(doc, meta);
    const filename = exportFilename(meta, format);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type":
          format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[artifact-download]", errorSummary(err));
    return NextResponse.json({ error: "Could not build the file" }, { status: 500 });
  }
});

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
