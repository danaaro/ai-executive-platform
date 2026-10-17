import { notFound } from "next/navigation";
import { requireAdmin } from "@/shared/current-user";
import { AdminRoleView } from "@/components/admin/AdminRoleView";

/** Admin read-only view of one customer role. Admins only; others get 404. */
export const dynamic = "force-dynamic";

export default async function AdminRolePage({ params }: { params: Promise<{ id: string; roleId: string }> }) {
  const user = await requireAdmin();
  if (!user) notFound();
  const { id, roleId } = await params;
  // Own company: the admin is also a customer user there and can work the role in the app.
  return <AdminRoleView companyId={id} roleId={roleId} ownCompany={user.companyId === id} />;
}
