import { and, desc, eq, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { adminDb, db, tables } from "@/db";

/**
 * Role credits (ADR-011). Balance = sum of the company's ledger deltas.
 *
 * Customer side runs in the tenant scope (row-level security: own company,
 * spends only). Admin side (grants, all companies) runs on `adminDb()` and is
 * reachable only from `requireAdmin()` routes.
 */

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SGD", "ILS", "AED", "HKD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

/** The current company's balance. Must run inside `withTenant`. */
export async function creditBalance(companyId: string): Promise<number> {
  const [row] = await db()
    .select({ balance: sql<number>`coalesce(sum(${tables.creditLedger.delta}), 0)::int` })
    .from(tables.creditLedger)
    .where(eq(tables.creditLedger.companyId, companyId));
  return row?.balance ?? 0;
}

/**
 * Serialises credit spending per company for the rest of the current
 * transaction, so two simultaneous "open role" requests cannot both spend the
 * last credit. Must run inside `withTenant` (one transaction).
 */
export async function lockCompanyCredits(companyId: string): Promise<void> {
  await db().execute(sql`select pg_advisory_xact_lock(hashtextextended(${"credits:" + companyId}, 0))`);
}

/* ------------------------------------------------------------------ admin */

export type CompanyCredits = {
  id: string;
  name: string;
  clerkOrgId: string;
  balance: number;
  granted: number;
  spent: number;
  roles: number;
  intelAttached: boolean;
};

/** Every customer company with its balance and role count. Admin only. */
export async function allCompanyCredits(): Promise<CompanyCredits[]> {
  const l = tables.creditLedger;
  return adminDb()
    .select({
      id: tables.companies.id,
      name: tables.companies.name,
      clerkOrgId: tables.companies.clerkOrgId,
      balance: sql<number>`coalesce(sum(${l.delta}), 0)::int`,
      granted: sql<number>`coalesce(sum(case when ${l.delta} > 0 then ${l.delta} end), 0)::int`,
      spent: sql<number>`coalesce(-sum(case when ${l.delta} < 0 then ${l.delta} end), 0)::int`,
      roles: sql<number>`(select count(*)::int from projects p where p.company_id = "companies"."id")`,
      intelAttached: sql<boolean>`("companies"."intel_company_id" is not null)`,
    })
    .from(tables.companies)
    .leftJoin(l, eq(l.companyId, tables.companies.id))
    .groupBy(tables.companies.id)
    .orderBy(tables.companies.name);
}

/** One company's full history, newest first. Admin only. */
export async function companyLedger(companyId: string) {
  const l = tables.creditLedger;
  return adminDb()
    .select({
      id: l.id,
      kind: l.kind,
      delta: l.delta,
      priceAmount: l.priceAmount,
      priceCurrency: l.priceCurrency,
      contractRef: l.contractRef,
      note: l.note,
      projectId: l.projectId,
      projectTitle: tables.projects.title,
      createdBy: l.createdBy,
      createdAt: l.createdAt,
    })
    .from(l)
    .leftJoin(tables.projects, eq(tables.projects.id, l.projectId))
    .where(eq(l.companyId, companyId))
    .orderBy(desc(l.createdAt));
}

/** Records an admin action (guardrails.md: "log every admin action"). */
export async function logAdminAction(opts: {
  adminUserId: string;
  action: string;
  companyId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  await adminDb().insert(tables.adminAudit).values({
    adminUserId: opts.adminUserId,
    action: opts.action,
    companyId: opts.companyId ?? null,
    details: opts.details ?? null,
  });
}

/**
 * Sets a company's balance to a new number (Dana 2026-10-18: one "update"
 * box instead of add + correct). History is still append-only (ADR-011): the
 * difference is recorded — an increase as a `grant` against the contract /
 * invoice reference (with the agreed price), a decrease as an `adjustment`
 * with the reason. `expectedBalance` is what the admin saw; if a customer
 * spent a credit in the meantime the update is refused instead of silently
 * landing on the wrong number. Same per-company lock as a customer's spend.
 */
export async function setCreditBalance(opts: {
  companyId: string;
  newBalance: number;
  expectedBalance: number;
  reference: string;
  priceAmount: number | null;
  priceCurrency: Currency | null;
  note: string | null;
  adminUserId: string;
}): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  return adminDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"credits:" + opts.companyId}, 0))`);
    const [row] = await tx
      .select({ balance: sql<number>`coalesce(sum(${tables.creditLedger.delta}), 0)::int` })
      .from(tables.creditLedger)
      .where(eq(tables.creditLedger.companyId, opts.companyId));
    const balance = row?.balance ?? 0;
    if (balance !== opts.expectedBalance) {
      return { ok: false as const, error: `The balance just changed to ${balance}. Check the number and save again.` };
    }
    const delta = opts.newBalance - balance;
    if (delta === 0) return { ok: false as const, error: `The balance is already ${balance}.` };
    const increase = delta > 0;
    await tx.insert(tables.creditLedger).values({
      companyId: opts.companyId,
      kind: increase ? "grant" : "adjustment",
      delta,
      priceAmount: increase ? opts.priceAmount : null,
      priceCurrency: increase ? opts.priceCurrency : null,
      contractRef: increase ? opts.reference : null,
      note: increase ? opts.note : [opts.reference, opts.note].filter(Boolean).join(" — "),
      createdBy: opts.adminUserId,
    });
    await tx.insert(tables.adminAudit).values({
      adminUserId: opts.adminUserId,
      action: "credits.update",
      companyId: opts.companyId,
      details: {
        balanceBefore: balance,
        balanceAfter: opts.newBalance,
        delta,
        reference: opts.reference,
        priceAmount: increase ? opts.priceAmount : null,
        priceCurrency: increase ? opts.priceCurrency : null,
      },
    });
    return { ok: true as const, balance: opts.newBalance };
  });
}

/**
 * Corrects a company's balance up or down (ADR-011 `adjustment`). History is
 * never edited — a correction is a new, signed entry with a required reason.
 * A reduction can never take the balance below zero. Admin only.
 */
export async function adjustCredits(opts: {
  companyId: string;
  delta: number;
  reason: string;
  adminUserId: string;
}): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  return adminDb().transaction(async (tx) => {
    // Same per-company lock as a customer's spend, so the two never race.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"credits:" + opts.companyId}, 0))`);
    const [row] = await tx
      .select({ balance: sql<number>`coalesce(sum(${tables.creditLedger.delta}), 0)::int` })
      .from(tables.creditLedger)
      .where(eq(tables.creditLedger.companyId, opts.companyId));
    const balance = row?.balance ?? 0;
    if (balance + opts.delta < 0) {
      return { ok: false as const, error: `Only ${balance} credit${balance === 1 ? "" : "s"} available — the balance cannot go below zero.` };
    }
    await tx.insert(tables.creditLedger).values({
      companyId: opts.companyId,
      kind: "adjustment",
      delta: opts.delta,
      note: opts.reason,
      createdBy: opts.adminUserId,
    });
    await tx.insert(tables.adminAudit).values({
      adminUserId: opts.adminUserId,
      action: "credits.adjust",
      companyId: opts.companyId,
      details: { delta: opts.delta, reason: opts.reason, balanceBefore: balance },
    });
    return { ok: true as const, balance: balance + opts.delta };
  });
}

/** A company's record and roles, for the admin company page. Admin only. */
export async function companyForAdmin(companyId: string) {
  const [company] = await adminDb()
    .select({
      id: tables.companies.id,
      name: tables.companies.name,
      clerkOrgId: tables.companies.clerkOrgId,
      intelCompanyId: tables.companies.intelCompanyId,
      createdAt: tables.companies.createdAt,
    })
    .from(tables.companies)
    .where(eq(tables.companies.id, companyId))
    .limit(1);
  if (!company) return null;
  const roles = await adminDb()
    .select({
      id: tables.projects.id,
      title: tables.projects.title,
      status: tables.projects.status,
      salaryMin: tables.projects.salaryMin,
      salaryMax: tables.projects.salaryMax,
      salaryCurrency: tables.projects.salaryCurrency,
      hiringManagerEmail: tables.projects.hiringManagerEmail,
      createdBy: tables.projects.createdBy,
      createdAt: tables.projects.createdAt,
      updatedAt: tables.projects.updatedAt,
    })
    .from(tables.projects)
    .where(eq(tables.projects.companyId, companyId))
    .orderBy(desc(tables.projects.updatedAt));
  // The job description's state per role, in the customer home's words.
  const jd = roles.length
    ? await adminDb()
        .select({ projectId: tables.artifacts.projectId, status: tables.artifacts.status })
        .from(tables.artifacts)
        .where(and(eq(tables.artifacts.companyId, companyId), eq(tables.artifacts.agentSlug, "job-description")))
    : [];
  return {
    company,
    roles: roles.map((r) => {
      const mine = jd.filter((a) => a.projectId === r.id);
      const stage = mine.some((a) => a.status === "approved") ? "Approved" : mine.length ? "Draft ready" : "Interviewing";
      return { ...r, stage };
    }),
  };
}

/**
 * Creates a customer company (Stage A, Dana 2026-10-18): a Clerk Organization
 * with no members — the admin is deliberately NOT added, or their own session
 * would belong to two organizations — plus our `companies` row, the optional
 * Company Intel attachment and the opening credit grant, in one transaction.
 * If the database step fails the new organization is deleted again, so a
 * half-made company never exists. Admin only.
 */
export async function createCompany(opts: {
  name: string;
  intelCompanyId: string | null;
  credits: number;
  reference: string | null;
  priceAmount: number | null;
  priceCurrency: Currency | null;
  note: string | null;
  adminUserId: string;
}): Promise<{ ok: true; companyId: string } | { ok: false; error: string; status: number }> {
  const [dupe] = await adminDb()
    .select({ id: tables.companies.id })
    .from(tables.companies)
    .where(sql`lower(${tables.companies.name}) = lower(${opts.name})`)
    .limit(1);
  if (dupe) return { ok: false, error: `A company called "${opts.name}" already exists.`, status: 409 };
  if (opts.intelCompanyId) {
    const [exists] = await adminDb()
      .select({ id: tables.intelCompanies.id })
      .from(tables.intelCompanies)
      .where(eq(tables.intelCompanies.id, opts.intelCompanyId))
      .limit(1);
    if (!exists) return { ok: false, error: "That researched company no longer exists.", status: 404 };
  }

  const clerk = await clerkClient();
  const org = await clerk.organizations.createOrganization({ name: opts.name });
  try {
    const companyId = await adminDb().transaction(async (tx) => {
      const [row] = await tx
        .insert(tables.companies)
        .values({ clerkOrgId: org.id, name: opts.name, intelCompanyId: opts.intelCompanyId })
        .returning({ id: tables.companies.id });
      if (opts.credits > 0) {
        await tx.insert(tables.creditLedger).values({
          companyId: row.id,
          kind: "grant",
          delta: opts.credits,
          priceAmount: opts.priceAmount,
          priceCurrency: opts.priceAmount !== null ? opts.priceCurrency : null,
          contractRef: opts.reference,
          note: opts.note,
          createdBy: opts.adminUserId,
        });
      }
      await tx.insert(tables.adminAudit).values({
        adminUserId: opts.adminUserId,
        action: "company.create",
        companyId: row.id,
        details: {
          name: opts.name,
          clerkOrgId: org.id,
          intelCompanyId: opts.intelCompanyId,
          credits: opts.credits,
          reference: opts.reference,
          priceAmount: opts.priceAmount,
          priceCurrency: opts.priceAmount !== null ? opts.priceCurrency : null,
        },
      });
      return row.id;
    });
    return { ok: true, companyId };
  } catch (err) {
    await clerk.organizations.deleteOrganization(org.id).catch(() => null);
    throw err;
  }
}

export type CompanyPerson = { email: string; name: string | null; status: "member" | "invited"; since: string };

/** Who is in a company: Clerk members plus pending invitations. Admin only. */
export async function companyPeople(clerkOrgId: string): Promise<CompanyPerson[]> {
  const clerk = await clerkClient();
  const [members, invites] = await Promise.all([
    clerk.organizations.getOrganizationMembershipList({ organizationId: clerkOrgId, limit: 100 }),
    clerk.organizations.getOrganizationInvitationList({ organizationId: clerkOrgId, status: ["pending"], limit: 100 }),
  ]);
  return [
    ...members.data.map((m) => ({
      email: m.publicUserData?.identifier ?? "—",
      name: [m.publicUserData?.firstName, m.publicUserData?.lastName].filter(Boolean).join(" ") || null,
      status: "member" as const,
      since: new Date(m.createdAt).toISOString(),
    })),
    ...invites.data.map((i) => ({
      email: i.emailAddress,
      name: null,
      status: "invited" as const,
      since: new Date(i.createdAt).toISOString(),
    })),
  ];
}

/**
 * An admin invites someone into a customer company. No inviter is named: the
 * admin is not a member of the organization (see createCompany).
 */
export async function adminInviteToCompany(clerkOrgId: string, email: string): Promise<"invited" | "already"> {
  const clerk = await clerkClient();
  try {
    await clerk.organizations.createOrganizationInvitation({
      organizationId: clerkOrgId,
      emailAddress: email,
      role: "org:member",
    });
    return "invited";
  } catch (err) {
    const codes = ((err as { errors?: { code?: string }[] })?.errors ?? []).map((e) => e.code ?? "");
    if (codes.some((c) => /already|duplicate/.test(c))) return "already";
    throw err;
  }
}
