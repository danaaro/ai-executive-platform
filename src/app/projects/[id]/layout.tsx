import { enterUrlForPage, projectCompanyForAdmin } from "@/shared/enter-company";
import { EnterCompany } from "@/components/admin/EnterCompany";

/** A super admin opening another company's role is moved into that company first. */
export default async function RoleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const enter = await enterUrlForPage(() => projectCompanyForAdmin(id));
  return enter ? <EnterCompany href={enter} /> : children;
}
