import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminDb, tables } from "@/db";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { allCompanyCredits, grantCredits, isCurrency } from "@/shared/credits";

/**
 * Admin: customer companies and their role credits (ADR-011). Admins only —
 * anyone else gets a bare 404. Credits are added here and nowhere else, each
 * grant tied to a contract reference.
 */
export async function GET() {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  return NextResponse.json({ companies: await allCompanyCredits() });
}

export async function POST(req: NextRequest) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  const credits = Number(body.credits);
  const contractRef = String(body.contractRef ?? "").trim();
  const note = String(body.note ?? "").trim();
  const priceRaw = body.priceAmount;
  const priceAmount = priceRaw === "" || priceRaw == null ? null : Number(priceRaw);

  if (!Number.isInteger(credits) || credits < 1 || credits > 1000) {
    return NextResponse.json({ error: "Credits must be a whole number from 1 to 1000." }, { status: 400 });
  }
  if (!contractRef || contractRef.length > 200) {
    return NextResponse.json({ error: "Add the contract or invoice reference." }, { status: 400 });
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
  const [company] = await adminDb()
    .select({ id: tables.companies.id })
    .from(tables.companies)
    .where(eq(tables.companies.id, companyId))
    .limit(1);
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  await grantCredits({
    companyId,
    credits,
    priceAmount,
    priceCurrency: priceAmount !== null ? body.priceCurrency : null,
    contractRef,
    note: note || null,
    adminUserId: gate.user.id,
  });
  return NextResponse.json({ companies: await allCompanyCredits() });
}
