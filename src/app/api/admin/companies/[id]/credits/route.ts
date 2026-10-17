import { NextRequest, NextResponse } from "next/server";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { allCompanyCredits, isCurrency, setCreditBalance } from "@/shared/credits";

/**
 * Admin: update a company's credit balance to a new number (one box, Dana
 * 2026-10-18). The ledger records the difference — see setCreditBalance.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const newBalance = Number(body.newBalance);
  const expectedBalance = Number(body.expectedBalance);
  const reference = String(body.reference ?? "").trim();
  const note = String(body.note ?? "").trim();
  const priceRaw = body.priceAmount;
  const priceAmount = priceRaw === "" || priceRaw == null ? null : Number(priceRaw);

  if (!Number.isInteger(newBalance) || newBalance < 0 || newBalance > 10_000) {
    return NextResponse.json({ error: "The new balance must be a whole number from 0 to 10,000." }, { status: 400 });
  }
  if (!Number.isInteger(expectedBalance)) {
    return NextResponse.json({ error: "Reload the page and try again." }, { status: 400 });
  }
  if (!reference || reference.length > 200) {
    return NextResponse.json({ error: "Add the contract / invoice reference or the reason." }, { status: 400 });
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

  const result = await setCreditBalance({
    companyId: id,
    newBalance,
    expectedBalance,
    reference,
    priceAmount,
    priceCurrency: priceAmount !== null ? body.priceCurrency : null,
    note: note || null,
    adminUserId: gate.user.id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ balance: result.balance, companies: await allCompanyCredits() });
}
