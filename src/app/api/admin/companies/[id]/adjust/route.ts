import { NextRequest, NextResponse } from "next/server";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { adjustCredits, allCompanyCredits } from "@/shared/credits";

/**
 * Admin: correct a company's credit balance (ADR-011 `adjustment`). History is
 * never edited — this adds a signed entry with a required reason; the balance
 * cannot go below zero. Logged in the admin activity log.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const delta = Number(body.delta);
  const reason = String(body.reason ?? "").trim();
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) {
    return NextResponse.json(
      { error: "Enter a whole number of credits to add (e.g. 2) or remove (e.g. -2)." },
      { status: 400 }
    );
  }
  if (!reason || reason.length > 1000) {
    return NextResponse.json({ error: "Give a reason for the correction." }, { status: 400 });
  }

  const result = await adjustCredits({ companyId: id, delta, reason, adminUserId: gate.user.id });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ balance: result.balance, companies: await allCompanyCredits() });
}
