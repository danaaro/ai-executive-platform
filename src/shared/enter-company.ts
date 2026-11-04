import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { requireUser, dbEnabled } from "@/shared/current-user";
import { adminDb, tables } from "@/db";

/**
 * For page layouts: when a super admin opens a page of another company, the
 * URL to switch into it (/api/admin/enter, logged) and come back to the same
 * page; null when no switch is needed (anyone else, or already inside it).
 * The layout performs the switch as a full page load in the browser
 * (EnterCompany) — never as a server redirect, which background prefetches
 * would also follow. `companyOf` resolves the page's company; null = unknown.
 */
export async function enterUrlForPage(companyOf: () => Promise<string | null>): Promise<string | null> {
  if (!dbEnabled()) return null;
  const user = await requireUser();
  if (user?.role !== "admin") return null;
  const companyId = await companyOf();
  if (!companyId || companyId === user.companyId) return null;
  const path = (await headers()).get("x-pathname") || "/internal/companies";
  return enterUrl(companyId, path);
}

/** The switch-company link: always a plain <a>, never a prefetched <Link>. */
export function enterUrl(companyId: string, next: string): string {
  return `/api/admin/enter?company=${companyId}&next=${encodeURIComponent(next)}`;
}

/** A project's company, outside any tenant scope — only for the redirect above. */
export async function projectCompanyForAdmin(projectId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const [row] = await adminDb()
    .select({ companyId: tables.projects.companyId })
    .from(tables.projects)
    .where(eq(tables.projects.id, projectId))
    .limit(1);
  return row?.companyId ?? null;
}
