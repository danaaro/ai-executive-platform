import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { latestOutputs } from "@/orchestrator/company-intel";
import { renderCockpitHtml } from "@/orchestrator/exec10x-render";
import { CockpitRejected, runCockpit } from "@/orchestrator/exec10x-writers";
import { isCockpit } from "@/shared/exec10x";
import { adminOr404, companyBySlug } from "../../../guard";

/**
 * GET: a v3 report rendered in Susan's template (ADR-009 §18) — `?r=<reportId>`
 * (the one the results page shows), or the latest. Served same-origin so the
 * results page can show it in an iframe and print it.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { error } = await adminOr404();
  if (error) return error;
  const company = await companyBySlug((await params).slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const id = req.nextUrl.searchParams.get("r");
  const report =
    id && /^[0-9a-f-]{36}$/i.test(id)
      ? (
          await db()
            .select()
            .from(tables.companyOutputs)
            .where(and(eq(tables.companyOutputs.id, id), eq(tables.companyOutputs.companyId, company.id), eq(tables.companyOutputs.kind, "report")))
            .limit(1)
        )[0]
      : id
        ? undefined
        : (await latestOutputs(company.id)).report;
  if (!report || !isCockpit(report.data)) return NextResponse.json({ error: "No Exec10X report yet" }, { status: 404 });

  return new NextResponse(renderCockpitHtml(report.data, company.name), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** POST {runId}: merge this run's four writer parts, validate, save. No model call. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { user, error } = await adminOr404();
  if (error) return error;
  const company = await companyBySlug((await params).slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const runId = typeof body.runId === "string" ? body.runId : null;
  if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: "runId is required" }, { status: 400 });
  try {
    const { row, validation } = await runCockpit({ companyId: company.id, runId, userId: user.id });
    return NextResponse.json({ id: row.id, version: row.version, warnings: validation.warnings, droppedSources: validation.droppedSources.length, downgraded: validation.downgraded.length });
  } catch (e) {
    // 422 tells the page to write the parts again; anything else (database,
    // network) keeps the run so a retry only re-assembles.
    const rejected = e instanceof CockpitRejected;
    if (!rejected) console.error("Exec10X assembly failed", e);
    return NextResponse.json(
      { error: rejected ? e.message : "The report couldn't be saved because of a server error. Click Run again: the written parts are kept." },
      { status: rejected ? 422 : 500 }
    );
  }
}
