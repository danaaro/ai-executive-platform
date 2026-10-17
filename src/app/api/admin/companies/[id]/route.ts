import { NextRequest, NextResponse } from "next/server";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { companyForAdmin, logAdminAction } from "@/shared/credits";
import { getUserNames } from "@/shared/current-user";

/**
 * Admin: one customer company — record and roles (read-only). This is the
 * audited cross-company path (ADR-010 §1): every view is logged.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await companyForAdmin(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await logAdminAction({ adminUserId: gate.user.id, action: "company.view", companyId: id });

  const names = await getUserNames(data.roles.map((r) => r.createdBy));
  return NextResponse.json({
    company: data.company,
    roles: data.roles.map((r) => ({ ...r, createdBy: names[r.createdBy] ?? r.createdBy })),
  });
}
