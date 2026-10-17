"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { relativeTime } from "@/lib/utils";
import { CreditsForm, LedgerList, type Company, type Entry } from "./CompaniesAdmin";

/**
 * Admin company page (admins only): one credits box (update the balance),
 * full credit history, and the company's roles — each opens a read-only
 * admin view. Every visit is written to the admin activity log.
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

        <div className="mt-10">
          {credits && <CreditsForm company={credits} onDone={() => void load({ withCompany: false })} />}
        </div>

        <IntelAndDocuments companyId={companyId} />

        <section className="card-surface mt-6 p-6">
          <p className="label-mono mb-4">Roles</p>
          {roles === null ? (
            <Skeleton className="h-4 w-1/2" />
          ) : roles.length === 0 ? (
            <p className="text-sm text-muted">No roles opened yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {roles.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/internal/companies/${companyId}/roles/${r.id}`}
                    className="group flex flex-wrap items-baseline gap-x-6 gap-y-1 py-3 text-sm"
                  >
                  <span className="min-w-0 flex-1 font-display text-lg text-ink group-hover:text-accent">
                    {r.title} <ArrowUpRight className="inline size-4 text-faint group-hover:text-accent" />
                  </span>
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
                  </Link>
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

type IntelInfo = {
  attached: string | null;
  intel: { id: string; name: string; slug: string }[];
  documents: { id: string; filename: string; visibleToCustomer: boolean; createdAt: string }[];
};

/**
 * Company research (hidden from the customer) + the company's documents.
 * One Intel report at a time; renewing = detach, then attach the new one.
 */
function IntelAndDocuments({ companyId }: { companyId: string }) {
  const [info, setInfo] = useState<IntelInfo | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/companies/${companyId}/intel`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not load");
      setInfo(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function set(intelCompanyId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/companies/${companyId}/intel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intelCompanyId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not save");
      setChoice("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const attached = info?.intel.find((i) => i.id === info.attached) ?? null;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <section className="card-surface p-6">
        <p className="label-mono mb-2">Company research · hidden from the customer</p>
        <p className="text-sm text-muted">
          The attached Company Intel report is read by the agent in every job description briefing for
          this company. The customer never sees it.
        </p>
        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}
        {info === null ? (
          <Skeleton className="mt-4 h-4 w-1/2" />
        ) : attached ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-xl text-ink">{attached.name}</p>
            <button className="btn btn-ghost" onClick={() => void set(null)} disabled={busy}>
              Detach
            </button>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap gap-2">
            <select className="field flex-1" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Researched company">
              <option value="">Choose a researched company…</option>
              {info.intel.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <button className="btn btn-gold" onClick={() => void set(choice)} disabled={busy || !choice}>
              Attach
            </button>
          </div>
        )}
      </section>

      <section className="card-surface p-6">
        <p className="label-mono mb-2">Company documents</p>
        <p className="text-sm text-muted">Uploaded by the customer on their Company documents page.</p>
        {info === null ? (
          <Skeleton className="mt-4 h-4 w-1/2" />
        ) : info.documents.length === 0 ? (
          <p className="mt-4 text-sm text-faint">None yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {info.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate text-ink">{d.filename}</span>
                <span className="shrink-0 text-xs text-faint">{relativeTime(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
