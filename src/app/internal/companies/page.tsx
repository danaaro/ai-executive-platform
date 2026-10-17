import { notFound } from "next/navigation";
import { requireAdmin } from "@/shared/current-user";
import { CompaniesAdmin } from "@/components/admin/CompaniesAdmin";

/**
 * Companies & credits (ADR-011) — admins only (Dana + Susan). Anyone else gets
 * the app's plain 404. Moves to admin.exec10x.ai with the back office.
 */
export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const user = await requireAdmin();
  if (!user) notFound();
  return <CompaniesAdmin />;
}
