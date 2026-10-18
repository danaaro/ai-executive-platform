import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminDb, tables, withTenant } from "@/db";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { adminInviteToCompany, logAdminAction } from "@/shared/credits";
import { openRole } from "@/shared/open-role";

/**
 * Admin: open a role for a customer company (Dana 2026-10-18). Same rules as a
 * customer opening one — one credit, locked title and salary — run inside that
 * company's tenant scope, so the same row-level security applies. The admin
 * names the customer's hiring manager, who is invited into the company.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [company] = await adminDb()
    .select({ clerkOrgId: tables.companies.clerkOrgId })
    .from(tables.companies)
    .where(eq(tables.companies.id, id))
    .limit(1);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const r = await withTenant(id, () =>
    openRole({
      companyId: id,
      actor: { id: gate.user.id, email: gate.user.email },
      body,
      onBehalf: true,
      invite: (email) => adminInviteToCompany(company.clerkOrgId, email).catch(() => "failed"),
    })
  );
  if (r.status === 200) {
    const project = r.json.project as { id: string; title: string };
    await logAdminAction({
      adminUserId: gate.user.id,
      action: "role.open",
      companyId: id,
      details: { projectId: project.id, title: project.title, hiringManagerEmail: body.hiringManagerEmail ?? null },
    });
  }
  return NextResponse.json(r.json, { status: r.status });
}
