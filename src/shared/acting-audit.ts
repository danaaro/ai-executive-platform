import { errorSummary } from "@/shared/safe-log";
import { logAdminAction } from "@/shared/credits";
import type { CurrentUser } from "@/shared/current-user";

/**
 * Logs every change a super admin makes while working inside another
 * company (Dana 2026-11-01): method and path only, never the content.
 * Reads are not logged per request; entering the company is (company.enter).
 * Never throws — the audit must not cost the user's action.
 */
export async function logActingWrite(user: CurrentUser | null, req: Request): Promise<void> {
  if (!user || user.role !== "admin" || user.homeCompanyId === undefined) return;
  if (req.method === "GET" || req.method === "HEAD") return;
  try {
    await logAdminAction({
      adminUserId: user.id,
      action: "company.write",
      companyId: user.companyId,
      details: { method: req.method, path: new URL(req.url).pathname },
    });
  } catch (err) {
    console.warn("[acting-audit] write not logged:", errorSummary(err));
  }
}
