import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminDb, tables } from "@/db";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { adminInviteToCompany, allCompanyCredits, createCompany, isCurrency, logAdminAction } from "@/shared/credits";

/**
 * Admin: customer companies and their role credits (ADR-011). Admins only —
 * anyone else gets a bare 404. Balances are updated per company at
 * /api/admin/companies/[id]/credits.
 */
export async function GET() {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  return NextResponse.json({ companies: await allCompanyCredits() });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Admin: create a customer company (Stage A). One submit: the Clerk
 * Organization and our row, optionally the hidden Company Intel, the opening
 * credits against the contract, and the first user's invitation.
 */
export async function POST(req: NextRequest) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  const intelCompanyId: string | null = body.intelCompanyId || null;
  const credits = Number(body.credits ?? 0);
  const reference = String(body.reference ?? "").trim();
  const note = String(body.note ?? "").trim();
  const priceRaw = body.priceAmount;
  const priceAmount = priceRaw === "" || priceRaw == null ? null : Number(priceRaw);
  const firstUserEmail = String(body.firstUserEmail ?? "").trim().toLowerCase();

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "Add the company name (2–120 characters)." }, { status: 400 });
  }
  if (intelCompanyId !== null && !/^[0-9a-f-]{36}$/i.test(intelCompanyId)) {
    return NextResponse.json({ error: "Choose a researched company." }, { status: 400 });
  }
  if (!Number.isInteger(credits) || credits < 0 || credits > 10_000) {
    return NextResponse.json({ error: "Opening credits must be a whole number from 0 to 10,000." }, { status: 400 });
  }
  if (credits > 0 && (!reference || reference.length > 200)) {
    return NextResponse.json({ error: "Add the contract / invoice reference for the opening credits." }, { status: 400 });
  }
  if (priceAmount !== null && (!Number.isInteger(priceAmount) || priceAmount < 0 || priceAmount > 100_000_000)) {
    return NextResponse.json({ error: "The agreed price must be a whole, non-negative number." }, { status: 400 });
  }
  if (priceAmount !== null && !isCurrency(body.priceCurrency)) {
    return NextResponse.json({ error: "Choose the price currency." }, { status: 400 });
  }
  if (note.length > 1000) {
    return NextResponse.json({ error: "The note is too long (1000 characters)." }, { status: 400 });
  }
  if (firstUserEmail && (firstUserEmail.length > 254 || !EMAIL.test(firstUserEmail))) {
    return NextResponse.json({ error: "The first user's email doesn't look right." }, { status: 400 });
  }

  const result = await createCompany({
    name,
    intelCompanyId,
    credits,
    reference: credits > 0 ? reference : null,
    priceAmount: credits > 0 ? priceAmount : null,
    priceCurrency: credits > 0 && priceAmount !== null ? body.priceCurrency : null,
    note: credits > 0 && note ? note : null,
    adminUserId: gate.user.id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // The company exists from here on; a failed invitation is reported, not fatal.
  let invite: "invited" | "already" | "failed" | null = null;
  if (firstUserEmail) {
    const [row] = await adminDb()
      .select({ clerkOrgId: tables.companies.clerkOrgId })
      .from(tables.companies)
      .where(eq(tables.companies.id, result.companyId))
      .limit(1);
    invite = await adminInviteToCompany(row.clerkOrgId, firstUserEmail).catch(() => "failed" as const);
    if (invite !== "failed") {
      await logAdminAction({ adminUserId: gate.user.id, action: "company.invite", companyId: result.companyId, details: { email: firstUserEmail } });
    }
  }
  return NextResponse.json({ companyId: result.companyId, invite }, { status: 201 });
}
