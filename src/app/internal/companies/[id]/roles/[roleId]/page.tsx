import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/shared/current-user";

/**
 * Old address of the read-only admin role view. Super admins now work in the
 * real role page, inside the company (Dana 2026-11-01); the company layout
 * above has already moved them into it.
 */
export const dynamic = "force-dynamic";

export default async function AdminRolePage({ params }: { params: Promise<{ id: string; roleId: string }> }) {
  const user = await requireAdmin();
  if (!user) notFound();
  const { roleId } = await params;
  redirect(`/projects/${roleId}`);
}
