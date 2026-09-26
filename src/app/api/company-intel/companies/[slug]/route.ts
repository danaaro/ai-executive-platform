import { NextRequest, NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { getUserNames } from "@/shared/current-user";
import { latestOutputs, latestResearch, moduleStates } from "@/orchestrator/company-intel";
import { adminOr404, companyBySlug } from "../../guard";
import { usageCost, type RunUsage } from "@/shared/ai-cost";

/**
 * Approximate AI spend (ADR-009 §15):
 *  - thisReport: the research the current report is built on (latest row per
 *    module, even if paid in an earlier run) + writing it + its photo step;
 *  - allTime: every research run, report and photo step for the company.
 * Legacy rows stored one synthesis twice (brief + culture share one usage
 * object), so identical usage objects are counted once.
 */
async function companyCosts(companyId: string, latest: { usage: unknown }[], report: { usage: unknown; data: unknown } | null) {
  const d = db();
  const [research, outputs] = await Promise.all([
    d.select({ usage: tables.companyResearch.usage }).from(tables.companyResearch).where(eq(tables.companyResearch.companyId, companyId)),
    d.select({ usage: tables.companyOutputs.usage, data: tables.companyOutputs.data }).from(tables.companyOutputs).where(eq(tables.companyOutputs.companyId, companyId)),
  ]);
  const photos = (data: unknown) => (data as { photosUsage?: RunUsage } | null)?.photosUsage ?? null;
  const seen = new Set<string>();
  const once = (u: unknown) => {
    if (!u) return 0;
    const key = JSON.stringify(u);
    if (seen.has(key)) return 0;
    seen.add(key);
    return usageCost(u as RunUsage);
  };
  const allTime =
    research.reduce((t, r) => t + once(r.usage), 0) +
    outputs.reduce((t, o) => t + once(o.usage) + once(photos(o.data)), 0);
  const thisReport = report
    ? latest.reduce((t, r) => t + usageCost(r.usage as RunUsage), 0) +
      usageCost(report.usage as RunUsage) +
      usageCost(photos(report.data))
    : null;
  return { thisReport, allTime };
}

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
    company: { slug: company.slug, name: company.name, website: company.website, logoUrl: company.logoUrl },
    modules,
    research: research.map((r) => ({ module: r.module, content: r.content, researchedOn: r.researchedOn })),
    inputs: inputs.map((i) => ({ id: i.id, filename: i.filename, chars: i.chars, createdAt: i.createdAt })),
    report: shape(outputs.report),
    cost: await companyCosts(company.id, research, outputs.report),
  });
}

/**
 * Corrects the official website — the first source of truth for every run
 * (ADR-009 §14). Clearing the logo makes the next run re-find it from the new site.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { error } = await adminOr404();
  if (error) return error;
  const company = await companyBySlug((await params).slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const raw = typeof body.website === "string" ? body.website.trim() : "";
  let website: string | null = null;
  if (raw) {
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!u.hostname.includes(".")) throw new Error();
      website = u.origin;
    } catch {
      return NextResponse.json({ error: "That doesn't look like a website address" }, { status: 400 });
    }
  }
  await db()
    .update(tables.companies)
    .set({ website, logoUrl: website === company.website ? company.logoUrl : null, updatedAt: new Date() })
    .where(eq(tables.companies.id, company.id));
  return NextResponse.json({ website });
}
