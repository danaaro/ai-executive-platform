import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { tenantRoute } from "@/shared/tenant-route";
import { requireUser, dbEnabled } from "@/shared/current-user";
import { forgetRoleContext } from "@/orchestrator/role-context";

/**
 * The customer's company documents (D9): reusable hiring material the JD
 * agent reads on every role. Scoped to the session's company by row-level
 * security (only documents visible to the customer). Text only — files are
 * parsed in /api/upload-parse first.
 */
const MAX_CHARS = 60_000;

export const GET = tenantRoute(async function GET() {
  if (!dbEnabled()) return NextResponse.json({ documents: [] });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ documents: [] });
  const rows = await db()
    .select({
      id: tables.companyDocuments.id,
      filename: tables.companyDocuments.filename,
      chars: tables.companyDocuments.content,
      createdAt: tables.companyDocuments.createdAt,
    })
    .from(tables.companyDocuments)
    .where(eq(tables.companyDocuments.companyId, user.companyId))
    .orderBy(desc(tables.companyDocuments.createdAt));
  return NextResponse.json({
    documents: rows.map((r) => ({ id: r.id, filename: r.filename, words: r.chars.split(/\s+/).length, createdAt: r.createdAt })),
  });
});

export const POST = tenantRoute(async function POST(req: NextRequest) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ error: "Your account is not linked to a company yet." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const filename = String(body.filename ?? "").trim().slice(0, 200);
  const content = String(body.content ?? "").trim();
  if (!filename || !content) return NextResponse.json({ error: "A document name and its text are required." }, { status: 400 });
  if (content.length > MAX_CHARS) return NextResponse.json({ error: "That document is too long (60,000 characters)." }, { status: 400 });

  const [row] = await db()
    .insert(tables.companyDocuments)
    .values({ companyId: user.companyId, filename, content, uploadedBy: user.id })
    .returning({ id: tables.companyDocuments.id });
  forgetRoleContext();
  return NextResponse.json({ id: row.id });
});

export const DELETE = tenantRoute(async function DELETE(req: NextRequest) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db()
    .delete(tables.companyDocuments)
    .where(and(eq(tables.companyDocuments.id, id), eq(tables.companyDocuments.companyId, user.companyId)));
  forgetRoleContext();
  return NextResponse.json({ removed: true });
});
