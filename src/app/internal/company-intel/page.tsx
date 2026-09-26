import { notFound } from "next/navigation";
import { requireAdmin } from "@/shared/current-user";
import { CompanyIntel } from "@/components/company-intel/CompanyIntel";

/**
 * Company Intelligence (ADR-009) — internal, admins only (Dana + Susan).
 * Anyone else gets the app's plain 404: the page does not exist for them.
 */
export const dynamic = "force-dynamic";

export default async function CompanyIntelPage() {
  const user = await requireAdmin();
  if (!user) notFound();

  return <CompanyIntel />;
}
