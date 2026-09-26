import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, tables } from "@/db";
import { slugify } from "@/orchestrator/company-intel";
import { adminOr404, companyBySlug } from "../guard";

/** Past research list + find-or-create by name (step 1 of the flow). */
export async function GET() {
  const { error } = await adminOr404();
  if (error) return error;

  const rows = await db()
    .select({
      slug: tables.companies.slug,
      name: tables.companies.name,
      updatedAt: tables.companies.updatedAt,
    })
    .from(tables.companies)
    .orderBy(desc(tables.companies.updatedAt))
    .limit(200);
  return NextResponse.json({ companies: rows });
}

export async function POST(req: NextRequest) {
  const { user, error } = await adminOr404();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const website = typeof body.website === "string" && body.website.trim() ? body.website.trim() : null;
  const slug = slugify(name);
  if (!name || !slug) return NextResponse.json({ error: "Company name is required" }, { status: 400 });

  // Same slug = same company: re-entering a name reopens its research (and cache).
  const existing = await companyBySlug(slug);
  if (existing) {
    return NextResponse.json({ slug, existed: true });
  }

  await db()
    .insert(tables.companies)
    .values({ slug, name, website, createdBy: user.id })
    .onConflictDoNothing();
  return NextResponse.json({ slug, existed: false });
}
