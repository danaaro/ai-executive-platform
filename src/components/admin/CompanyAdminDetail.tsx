"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { relativeTime } from "@/lib/utils";
import { AdjustForm, GrantForm, LedgerList, type Company, type Entry } from "./CompaniesAdmin";

/**
 * Admin company page (admins only): balance, add credits against a contract,
 * correct the balance, full credit history, and the company's roles
 * (read-only). Every visit is written to the admin activity log.
 */

type Role = {
  id: string;
  title: string;
  status: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  hiringManagerEmail: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function CompanyAdminDetail({ companyId }: { companyId: string }) {
  const [info, setInfo] = useState<{ name: string; clerkOrgId: string; intelCompanyId: string | null } | null>(null);
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [credits, setCredits] = useState<Company | null>(null);
  const [ledger, setLedger] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts: { withCompany: boolean }) => {
    try {
      const [cRes, lRes, dRes] = await Promise.all([
        fetch("/api/admin/companies"),
        fetch(`/api/admin/companies/${companyId}/ledger`),
        opts.withCompany ? fetch(`/api/admin/companies/${companyId}`) : Promise.resolve(null),
      ]);
      const c = await cRes.json();
      const l = await lRes.json();
      if (!cRes.ok) throw new Error(c.error ?? "Could not load credits");
      if (!lRes.ok) throw new Error(l.error ?? "Could not load the history");
      setCredits((c.companies as Company[]).find((x) => x.id === companyId) ?? null);
      setLedger(l.ledger);
      if (dRes) {
        const d = await dRes.json();
        if (!dRes.ok) throw new Error(d.error ?? "Company not found");
        setInfo(d.company);
        setRoles(d.roles);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the company");
    }
  }, [companyId]);

  useEffect(() => {
    void load({ withCompany: true });
  }, [load]);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="label-mono mb-3">
          <Link href="/internal/companies" className="hover:text-ink">
            Companies &amp; credits
          </Link>{" "}
          / Company
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-4xl font-normal text-ink">{info?.name ?? "…"}</h1>
          {credits && (
            <p className="font-display text-3xl text-ink">
              {credits.balance} <span className="text-base text-muted">credits available</span>
            </p>
          )}
        </div>
        {credits && (
          <p className="mt-2 font-mono text-xs text-muted">
            {credits.granted} added · {credits.spent} spent
          </p>
        )}

        {error && (
          <Alert tone="danger" className="mt-6">
            {error}
          </Alert>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {credits && (
            <>
              <GrantForm company={credits} onGranted={() => void load({ withCompany: false })} />
              <AdjustForm company={credits} onDone={() => void load({ withCompany: false })} />
            </>
          )}
        </div>

        <section className="card-surface mt-6 p-6">
          <p className="label-mono mb-4">Roles</p>
          {roles === null ? (
            <Skeleton className="h-4 w-1/2" />
          ) : roles.length === 0 ? (
            <p className="text-sm text-muted">No roles opened yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {roles.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-3 text-sm">
                  <span className="min-w-0 flex-1 font-display text-lg text-ink">{r.title}</span>
                  <span className="font-mono text-xs text-muted">
                    {r.salaryMin !== null && r.salaryMax !== null
                      ? `${r.salaryMin.toLocaleString()}–${r.salaryMax.toLocaleString()} ${r.salaryCurrency ?? ""}`
                      : "no salary range"}
                  </span>
                  <span className="text-xs text-faint">
                    opened by {r.createdBy} · {relativeTime(r.createdAt)}
                    {r.hiringManagerEmail && <> · HM {r.hiringManagerEmail}</>}
                  </span>
                  <span className="label-mono w-20 text-right">{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-surface mt-6 p-6">
          <p className="label-mono mb-4">Credit history</p>
          <LedgerList ledger={ledger} />
        </section>
      </main>
    </>
  );
}
