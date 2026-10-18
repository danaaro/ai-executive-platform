import { redirect } from "next/navigation";
import { requireUser } from "@/shared/current-user";

/**
 * Front door. Customers land on their company home (roles + credits); admins
 * (Dana, Susan) land on the companies overview, where they create companies
 * and move between them (Lovable "Organizations", Dana 2026-10-18). The former
 * agent chat lives on at /agents.
 */
export default async function RootPage() {
  const user = await requireUser().catch(() => null);
  redirect(user?.role === "admin" ? "/internal/companies" : "/projects");
}
