import { NextRequest, NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { getUserNames } from "@/shared/current-user";
import { latestOutputs, latestResearch, moduleStates } from "@/orchestrator/company-intel";
import { adminOr404, companyBySlug } from "../../guard";

/** Everything the page needs for one company: cache table, inputs, outputs. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { error } = await adminOr404();
  if (error) return error;
  const company = await companyBySlug((await params).slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [modules, research, outputs, inputs] = await Promise.all([
    moduleStates(company.id),
    latestResearch(company.id),
    latestOutputs(company.id),
    db()
      .select({
        id: tables.companyInputs.id,
        filename: tables.companyInputs.filename,
        chars: sql<number>`length(${tables.companyInputs.content})::int`,
        createdAt: tables.companyInputs.createdAt,
      })
      .from(tables.companyInputs)
      .where(eq(tables.companyInputs.companyId, company.id))
      .orderBy(asc(tables.companyInputs.createdAt)),
  ]);

  const names = await getUserNames(outputs.report?.reviewedBy ? [outputs.report.reviewedBy] : []);
  const shape = (o: typeof outputs.report) =>
    o && {
      id: o.id,
      version: o.version,
      mode: o.mode,
      content: o.content,
      data: o.data,
      reviewed: o.reviewed,
      reviewedBy: o.reviewedBy ? (names[o.reviewedBy] ?? o.reviewedBy) : null,
      reviewedAt: o.reviewedAt,
      createdAt: o.createdAt,
    };

  return NextResponse.json({
    company: { slug: company.slug, name: company.name, website: company.website },
    modules,
    research: research.map((r) => ({ module: r.module, content: r.content, researchedOn: r.researchedOn })),
    inputs: inputs.map((i) => ({ id: i.id, filename: i.filename, chars: i.chars, createdAt: i.createdAt })),
    report: shape(outputs.report),
  });
}
