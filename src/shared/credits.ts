import { desc, eq, sql } from "drizzle-orm";
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
};

/** Every customer company with its balance. Admin only. */
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

/** Adds credits against a contract. Admin only — the only way credits appear. */
export async function grantCredits(opts: {
  companyId: string;
  credits: number;
  priceAmount: number | null;
  priceCurrency: Currency | null;
  contractRef: string;
  note: string | null;
  adminUserId: string;
}): Promise<void> {
  await adminDb().insert(tables.creditLedger).values({
    companyId: opts.companyId,
    kind: "grant",
    delta: opts.credits,
    priceAmount: opts.priceAmount,
    priceCurrency: opts.priceCurrency,
    contractRef: opts.contractRef,
    note: opts.note,
    createdBy: opts.adminUserId,
  });
}
