import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { adminDb, tables } from "@/db";
import { forgetRoleContext } from "@/orchestrator/role-context";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { companyForAdmin, logAdminAction } from "@/shared/credits";
import { getUserNames } from "@/shared/current-user";

/**
 * Admin: one customer company — record and roles. GET is read-only; PATCH
 * edits the company's details (name and profile). This is the
 * audited cross-company path (ADR-010 §1): every view is logged.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await companyForAdmin(id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await logAdminAction({ adminUserId: gate.user.id, action: "company.view", companyId: id });

  const names = await getUserNames(data.roles.map((r) => r.createdBy));
  return NextResponse.json({
    company: data.company,
    roles: data.roles.map((r) => ({ ...r, createdBy: names[r.createdBy] ?? r.createdBy })),
  });
}

const LIMIT = 8000;

/**
 * Admin: edit the company's details after creation — name, and the profile
 * the JD agent reads on every role (about, values, culture notes). Logged in
 * the admin activity log; the Clerk organization is renamed to match.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "Add the company name (2–120 characters)." }, { status: 400 });
  }
  const text = (v: unknown) => {
    const t = String(v ?? "").trim();
    return t ? t : null;
  };
  const about = text(body.about);
  const values = text(body.values);
  const cultureNotes = text(body.cultureNotes);
  if ([about, values, cultureNotes].some((t) => t && t.length > LIMIT)) {
    return NextResponse.json({ error: `Each text field can hold up to ${LIMIT} characters.` }, { status: 400 });
  }

  const db = adminDb();
  const [before] = await db
    .select({ name: tables.companies.name, clerkOrgId: tables.companies.clerkOrgId })
    .from(tables.companies)
    .where(eq(tables.companies.id, id))
    .limit(1);
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(tables.companies)
    .set({ name, about, values, cultureNotes, updatedAt: new Date() })
    .where(eq(tables.companies.id, id));

  if (name !== before.name) {
    // Keeps the customer's organization switcher in step; the database is the source of truth.
    const clerk = await clerkClient();
    await clerk.organizations.updateOrganization(before.clerkOrgId, { name }).catch(() => undefined);
  }
  forgetRoleContext(); // roles re-read the profile on their next turn
  await logAdminAction({
    adminUserId: gate.user.id,
    action: "company.update",
    companyId: id,
    details: { renamed: name !== before.name ? { from: before.name, to: name } : undefined },
  });
  return NextResponse.json({ ok: true });
}
