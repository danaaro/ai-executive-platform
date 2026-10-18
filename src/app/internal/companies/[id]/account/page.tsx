import { notFound } from "next/navigation";
import { requireAdmin } from "@/shared/current-user";
import { CompanyAdminDetail } from "@/components/admin/CompanyAdminDetail";

/** Admin company account — credits, Company Intel, documents, people, credit history. Admins only. */
export const dynamic = "force-dynamic";

export default async function CompanyAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) notFound();
  const { id } = await params;
  return <CompanyAdminDetail companyId={id} view="account" />;
}
