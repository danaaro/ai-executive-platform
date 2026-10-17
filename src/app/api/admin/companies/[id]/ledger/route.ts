import { NextRequest, NextResponse } from "next/server";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { companyLedger } from "@/shared/credits";
import { getUserNames } from "@/shared/current-user";

/** Admin: one company's credit history, newest first (ADR-011). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await companyLedger(id);
  const names = await getUserNames(rows.map((r) => r.createdBy));
  return NextResponse.json({
    ledger: rows.map((r) => ({ ...r, createdBy: names[r.createdBy] ?? r.createdBy })),
  });
}
