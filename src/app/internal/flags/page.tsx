import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/shared/current-user";
import { adminDb, tables } from "@/db";
import { AppHeader } from "@/components/AppHeader";

/**
 * Flagged activity (admins only): users who tried to take an agent off-topic,
 * probed how it works, or attempted a prompt injection. Written by
 * src/shared/security-flags.ts. Shows a short excerpt of what they typed.
 */
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  ip_probe: "Asked how it works",
  off_topic: "Off-topic",
  injection: "Prompt injection",
};

export default async function FlagsPage() {
  const user = await requireAdmin();
  if (!user) notFound();

  const rows = await adminDb()
    .select({
      id: tables.securityFlags.id,
      kind: tables.securityFlags.kind,
      channel: tables.securityFlags.channel,
      excerpt: tables.securityFlags.excerpt,
      createdAt: tables.securityFlags.createdAt,
      userId: tables.securityFlags.userId,
      company: tables.companies.name,
      role: tables.projects.title,
    })
    .from(tables.securityFlags)
    .leftJoin(tables.companies, eq(tables.companies.id, tables.securityFlags.companyId))
    .leftJoin(tables.projects, eq(tables.projects.id, tables.securityFlags.projectId))
    .orderBy(desc(tables.securityFlags.createdAt))
    .limit(200);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-10">
          <p className="label-mono mb-3">Security</p>
          <h1 className="font-display text-4xl font-normal text-ink">Flagged activity</h1>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Nothing flagged yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-4 text-sm sm:flex-row sm:gap-6">
                <div className="w-48 shrink-0">
                  <p className="font-medium text-ink">{KIND_LABEL[r.kind] ?? r.kind}</p>
                  <p className="text-muted">
                    {r.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {r.channel}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-muted">
                    {r.company ?? "Unknown company"}
                    {r.role ? ` · ${r.role}` : ""}
                    {r.userId ? ` · ${r.userId}` : ""}
                  </p>
                  <p className="mt-1 text-ink">“{r.excerpt}”</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
