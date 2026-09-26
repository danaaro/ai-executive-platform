import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireAdmin, dbEnabled } from "@/shared/current-user";

/**
 * Shared guard for /api/company-intel/* (ADR-009): admins only, DB required.
 * Non-admins get a bare 404 — the tool doesn't exist as far as they can tell.
 */
export async function adminOr404() {
  if (!dbEnabled()) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const user = await requireAdmin();
  if (!user) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { user };
}

export async function companyBySlug(slug: string) {
  const [company] = await db()
    .select()
    .from(tables.companies)
    .where(eq(tables.companies.slug, slug))
    .limit(1);
  return company ?? null;
}
