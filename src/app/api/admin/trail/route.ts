import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { adminDb, withTenant, db, tables } from "@/db";

/**
 * Super admins only: where they are, for the header path
 * (Companies / company / role / section). The company is the one they are
 * working inside; a role is looked up within that company only.
 *
 *   GET /api/admin/trail?project=<roleId>
 */
export async function GET(req: NextRequest) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const user = gate.user;
  if (!user.companyId) return NextResponse.json({ company: null, role: null });

  const [company] = await adminDb()
    .select({ id: tables.companies.id, name: tables.companies.name })
    .from(tables.companies)
    .where(eq(tables.companies.id, user.companyId))
    .limit(1);

  const projectId = req.nextUrl.searchParams.get("project") ?? "";
  const [role] = /^[0-9a-f-]{36}$/i.test(projectId)
    ? await withTenant(user.companyId, () =>
        db()
          .select({ id: tables.projects.id, title: tables.projects.title })
          .from(tables.projects)
          .where(eq(tables.projects.id, projectId))
          .limit(1)
      )
    : [];

  return NextResponse.json({
    company: company ?? null,
    // Inside another company, not their own (the home company is unset then).
    entered: user.homeCompanyId !== undefined,
    role: role ?? null,
  });
}
