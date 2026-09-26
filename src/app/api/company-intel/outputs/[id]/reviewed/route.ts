import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { adminOr404 } from "../../../guard";

/** Toggles the "reviewed" marker. A plain flag — nothing depends on it (ADR-009 §2). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await adminOr404();
  if (error) return error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reviewed = body.reviewed === true;

  const [row] = await db()
    .update(tables.companyOutputs)
    .set({
      reviewed,
      reviewedBy: reviewed ? user.id : null,
      reviewedAt: reviewed ? new Date() : null,
    })
    .where(eq(tables.companyOutputs.id, id))
    .returning({ id: tables.companyOutputs.id });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
