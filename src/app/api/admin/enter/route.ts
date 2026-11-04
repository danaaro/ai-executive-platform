import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { logAdminAction } from "@/shared/credits";
import { ACTING_COMPANY_COOKIE } from "@/shared/current-user";
import { adminDb, tables } from "@/db";

/**
 * Super admins only: work inside a company (Dana 2026-11-01). Sets
 * ACTING_COMPANY_COOKIE and continues to `next`; every screen and route then
 * acts as that company for this super admin (see shared/current-user.ts).
 * `company=own` returns to the admin's own company. Every entry is logged.
 *
 *   GET /api/admin/enter?company=<id>|own&next=/projects/<roleId>
 */
export async function GET(req: NextRequest) {
  // Only a real navigation may switch company. Next.js prefetches links and
  // fetches server components in the background; when those reached this
  // route they switched company behind the admin's back (2026-11-02: Muse
  // opened as SusanDana). Links here are plain <a>, and anything that is not
  // a full page load is refused.
  const h = req.headers;
  if (h.get("rsc") || h.get("next-router-prefetch") || h.get("purpose") === "prefetch" || h.get("sec-purpose")?.includes("prefetch")) {
    return new NextResponse(null, { status: 204 });
  }
  const gate = await adminOr404();
  if (gate.error) return gate.error;

  const company = req.nextUrl.searchParams.get("company") ?? "";
  const nextParam = req.nextUrl.searchParams.get("next") ?? "";
  // Same-site paths only — never an open redirect.
  const next = /^\/(?!\/)[^\s\\]*$/.test(nextParam) ? nextParam : "/internal/companies";
  const res = NextResponse.redirect(new URL(next, req.url));

  if (company === "own") {
    res.cookies.delete(ACTING_COMPANY_COOKIE);
    return res;
  }

  const [row] = /^[0-9a-f-]{36}$/i.test(company)
    ? await adminDb().select({ id: tables.companies.id }).from(tables.companies).where(eq(tables.companies.id, company)).limit(1)
    : [];
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  res.cookies.set(ACTING_COMPANY_COOKIE, row.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  await logAdminAction({ adminUserId: gate.user.id, action: "company.enter", companyId: row.id, details: { next } });
  return res;
}
