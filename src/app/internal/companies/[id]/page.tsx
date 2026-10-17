import { notFound } from "next/navigation";
import { requireAdmin } from "@/shared/current-user";
import { CompanyAdminDetail } from "@/components/admin/CompanyAdminDetail";

/** Admin company page (read-only roles + credits). Admins only; others get 404. */
export const dynamic = "force-dynamic";

export default async function CompanyAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) notFound();
  const { id } = await params;
  return <CompanyAdminDetail companyId={id} />;
}
