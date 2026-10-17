import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { adminDb, tables } from "@/db";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { logAdminAction } from "@/shared/credits";
import { forgetRoleContext } from "@/orchestrator/role-context";

/**
 * Admin: the Company Intel report attached to a customer company (ADR-010 §3)
 * — hidden from the customer, read by every JD run. One at a time; renewing =
 * detach and attach the new one. GET lists the company's attachment, the
 * researched companies to choose from, and all the company's documents.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = adminDb();
  const [[company], intel, docs] = await Promise.all([
    db.select({ intelCompanyId: tables.companies.intelCompanyId }).from(tables.companies).where(eq(tables.companies.id, id)).limit(1),
    db
      .select({ id: tables.intelCompanies.id, name: tables.intelCompanies.name, slug: tables.intelCompanies.slug })
      .from(tables.intelCompanies)
      .orderBy(tables.intelCompanies.name),
    db
      .select({
        id: tables.companyDocuments.id,
        filename: tables.companyDocuments.filename,
        visibleToCustomer: tables.companyDocuments.visibleToCustomer,
        createdAt: tables.companyDocuments.createdAt,
      })
      .from(tables.companyDocuments)
      .where(eq(tables.companyDocuments.companyId, id))
      .orderBy(desc(tables.companyDocuments.createdAt)),
  ]);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ attached: company.intelCompanyId, intel, documents: docs });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const intelCompanyId: string | null = body.intelCompanyId ?? null;
  if (intelCompanyId !== null && !/^[0-9a-f-]{36}$/i.test(intelCompanyId)) {
    return NextResponse.json({ error: "Choose a researched company." }, { status: 400 });
  }
  if (intelCompanyId) {
    const [exists] = await adminDb()
      .select({ id: tables.intelCompanies.id })
      .from(tables.intelCompanies)
      .where(eq(tables.intelCompanies.id, intelCompanyId))
      .limit(1);
    if (!exists) return NextResponse.json({ error: "That researched company no longer exists." }, { status: 404 });
  }
  await adminDb()
    .update(tables.companies)
    .set({ intelCompanyId, updatedAt: new Date() })
    .where(eq(tables.companies.id, id));
  await logAdminAction({
    adminUserId: gate.user.id,
    action: intelCompanyId ? "intel.attach" : "intel.detach",
    companyId: id,
    details: { intelCompanyId },
  });
  forgetRoleContext();
  return NextResponse.json({ attached: intelCompanyId });
}
