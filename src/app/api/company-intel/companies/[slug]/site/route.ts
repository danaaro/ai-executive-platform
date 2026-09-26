import { NextRequest, NextResponse } from "next/server";
import { refreshCompanySite } from "@/orchestrator/company-intel";
import { adminOr404, companyBySlug } from "../../../guard";

export const maxDuration = 120;

/** Step 0 of a run: read the company's own website into a dated input. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { user, error } = await adminOr404();
  if (error) return error;
  const company = await companyBySlug((await params).slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json(await refreshCompanySite(company.id, user.id));
  } catch (err) {
    console.error("[company-intel/site]", err);
    return NextResponse.json({ error: "Could not read the company website" }, { status: 502 });
  }
}
