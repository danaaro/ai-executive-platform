import { NextResponse } from "next/server";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { allCompanyCredits } from "@/shared/credits";

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
