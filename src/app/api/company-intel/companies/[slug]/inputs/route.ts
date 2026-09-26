import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { adminOr404, companyBySlug } from "../../../guard";

const MAX_CHARS = 60_000; // matches /api/upload-parse

/**
 * Step 2: documents we already hold. The client parses files through the
 * existing /api/upload-parse and posts the text here; pasted text arrives the
 * same way. Only extracted text is stored, never the file.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { user, error } = await adminOr404();
  if (error) return error;
  const company = await companyBySlug((await params).slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim().slice(0, MAX_CHARS) : "";
  if (!filename || !content) {
    return NextResponse.json({ error: "filename and content are required" }, { status: 400 });
  }

  const [row] = await db()
    .insert(tables.companyInputs)
    .values({ companyId: company.id, filename, content, createdBy: user.id })
    .returning({ id: tables.companyInputs.id });
  return NextResponse.json({ id: row.id });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { error } = await adminOr404();
  if (error) return error;
  const company = await companyBySlug((await params).slug);
  const id = req.nextUrl.searchParams.get("id");
  if (!company || !id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db()
    .delete(tables.companyInputs)
    .where(and(eq(tables.companyInputs.id, id), eq(tables.companyInputs.companyId, company.id)));
  return NextResponse.json({ ok: true });
}
