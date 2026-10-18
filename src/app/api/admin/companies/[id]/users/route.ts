import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminDb, tables } from "@/db";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { adminInviteToCompany, companyPeople, logAdminAction } from "@/shared/credits";

/**
 * Admin: the people of one customer company — members and pending
 * invitations, read from its Clerk Organization — and inviting someone new.
 */
async function orgOf(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await adminDb()
    .select({ clerkOrgId: tables.companies.clerkOrgId })
    .from(tables.companies)
    .where(eq(tables.companies.id, id))
    .limit(1);
  return row?.clerkOrgId ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const { id } = await params;
  const clerkOrgId = await orgOf(id);
  if (!clerkOrgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json({ people: await companyPeople(clerkOrgId) });
  } catch {
    return NextResponse.json({ error: "Could not load the people from Clerk." }, { status: 502 });
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const { id } = await params;
  const clerkOrgId = await orgOf(id);
  if (!clerkOrgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL.test(email)) {
    return NextResponse.json({ error: "Add a valid email address." }, { status: 400 });
  }
  try {
    const result = await adminInviteToCompany(clerkOrgId, email);
    await logAdminAction({ adminUserId: gate.user.id, action: "company.invite", companyId: id, details: { email } });
    return NextResponse.json({ result, people: await companyPeople(clerkOrgId) });
  } catch {
    return NextResponse.json({ error: "Clerk could not send the invitation. Try again." }, { status: 502 });
  }
}
