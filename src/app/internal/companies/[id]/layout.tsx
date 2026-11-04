import { enterUrlForPage } from "@/shared/enter-company";
import { EnterCompany } from "@/components/admin/EnterCompany";

/** Opening a company in admin means working inside it (Dana 2026-11-01). */
export default async function AdminCompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const enter = await enterUrlForPage(async () => (/^[0-9a-f-]{36}$/i.test(id) ? id : null));
  return enter ? <EnterCompany href={enter} /> : children;
}
