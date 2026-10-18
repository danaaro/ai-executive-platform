"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { relativeTime } from "@/lib/utils";
import { NewCompanyForm, type Created } from "./NewCompanyForm";

/**
 * Companies & credits (ADR-011, admins only). The list of customer companies
 * with their balances; each opens the admin company page, where credits are
 * added (against a contract) or corrected, and history and roles are shown.
 * Credits appear only through these screens.
 */

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SGD", "ILS", "AED", "HKD"] as const;

export type Company = {
  id: string;
  name: string;
  clerkOrgId: string;
  balance: number;
  granted: number;
  spent: number;
  roles: number;
  intelAttached: boolean;
};
export type Entry = {
  id: string;
  kind: "grant" | "spend" | "adjustment";
  delta: number;
  priceAmount: number | null;
  priceCurrency: string | null;
  contractRef: string | null;
  note: string | null;
  projectTitle: string | null;
  createdBy: string;
  createdAt: string;
};

export function CompaniesAdmin() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/companies")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load companies");
        setCompanies(d.companies);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load companies"));
  }, []);

  useEffect(load, [load]);

  // After saving: back to the overview, the new company confirmed and highlighted.
  function onCreated(c: Created) {
    setAdding(false);
    setCreated(c);
    load();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-mono mb-3">Clients</p>
            <h1 className="font-display text-4xl font-normal text-ink">Companies</h1>
          </div>
          {!adding && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setCreated(null);
                setAdding(true);
              }}
            >
              <Plus className="size-4" /> Add company
            </button>
          )}
        </div>

        {adding && <NewCompanyForm onCancel={() => setAdding(false)} onCreated={onCreated} />}

        {created && (
          <Alert tone={created.invite === "failed" ? "danger" : undefined} className="mb-6">
            {created.name} is created.{" "}
            {created.invite === "failed"
              ? "The first user's invitation could not be sent; open the company and invite them under People."
              : created.invite
                ? "The first user's invitation is on its way."
                : "Open it to add people, credits or Company Intel."}
          </Alert>
        )}

        {error && (
          <Alert tone="danger" className="mb-6">
            {error}
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {companies === null
            ? [0, 1, 2].map((i) => (
                <div key={i} className="card-surface p-6">
                  <Skeleton className="h-11 w-11" />
                  <Skeleton className="mt-6 h-6 w-2/3" />
                  <Skeleton className="mt-6 h-3 w-1/3" />
                </div>
              ))
            : companies.map((c) => (
                <Link
                  key={c.id}
                  href={`/internal/companies/${c.id}`}
                  className={`card-surface group p-6 transition hover:border-accent/50 ${
                    created?.companyId === c.id ? "border-accent ring-1 ring-accent/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-wash text-accent">
                      <Building2 className="size-5" />
                    </div>
                    {created?.companyId === c.id ? (
                      <span className="label-mono text-accent">New</span>
                    ) : (
                      <ArrowUpRight className="size-4 text-faint transition group-hover:text-accent" />
                    )}
                  </div>
                  <h3 className="mt-6 truncate font-display text-2xl font-normal text-ink">{c.name}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {c.balance} credit{c.balance === 1 ? "" : "s"} available · {c.spent} spent
                  </p>
                  <div className="mt-6 flex items-center justify-between">
                    <p className="label-mono">
                      {c.roles} {c.roles === 1 ? "role" : "roles"}
                    </p>
                    <p className={`label-mono ${c.intelAttached ? "text-success" : "text-faint"}`}>
                      {c.intelAttached ? "Intel attached" : "No Intel"}
                    </p>
                  </div>
                </Link>
              ))}
        </div>
        {companies?.length === 0 && !adding && <p className="text-muted">No companies yet.</p>}
      </main>
    </>
  );
}

export function LedgerList({ ledger }: { ledger: Entry[] | null }) {
  if (ledger === null) return <Skeleton className="h-4 w-2/3" />;
  if (ledger.length === 0) return <p className="text-sm text-muted">No credits yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {ledger.map((e) => (
        <li key={e.id} className="flex items-start gap-4 py-3 text-sm">
          <span className={`w-12 shrink-0 font-mono ${e.delta > 0 ? "text-success" : "text-ink"}`}>
            {e.delta > 0 ? `+${e.delta}` : e.delta}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-ink">
              {e.kind === "spend"
                ? `Role opened: ${e.projectTitle ?? e.note ?? "—"}`
                : e.kind === "grant"
                  ? `Contract ${e.contractRef ?? "—"}`
                  : `Correction: ${e.note ?? "—"}`}
            </p>
            <p className="mt-0.5 text-xs text-faint">
              {e.kind === "grant" && e.priceAmount !== null && (
                <>
                  {e.priceAmount.toLocaleString()} {e.priceCurrency} ·{" "}
                </>
              )}
              {e.kind === "grant" && e.note && <>{e.note} · </>}
              {e.createdBy} · {relativeTime(e.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * One credits box (Dana 2026-10-18): the admin types the new balance. The
 * ledger records the difference — an increase against the contract / invoice
 * reference (with the agreed price), a decrease with the reason.
 */
export function CreditsForm({ company, onDone }: { company: Company; onDone: () => void }) {
  const [balance, setBalance] = useState(String(company.balance));
  const [reference, setReference] = useState("");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState<string>("EUR");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "info"; text: string } | null>(null);

  useEffect(() => {
    setBalance(String(company.balance));
  }, [company.balance]);

  const n = Number(balance);
  const delta = Number.isInteger(n) ? n - company.balance : 0;
  const increase = delta > 0;
  const valid = Number.isInteger(n) && n >= 0 && delta !== 0 && reference.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newBalance: n,
          expectedBalance: company.balance,
          reference,
          priceAmount: increase && priceAmount !== "" ? Number(priceAmount) : null,
          priceCurrency,
          note,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not update the credits");
      setMessage({ tone: "info", text: `Updated — ${d.balance} credit${d.balance === 1 ? "" : "s"} available.` });
      setReference("");
      setPriceAmount("");
      setNote("");
      onDone();
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : "Could not update the credits" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-mono">Credits · {company.name}</p>
        <p className="font-display text-2xl text-ink">
          {company.balance} <span className="text-base text-muted">available</span>
        </p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="label-mono">
            New balance <span className="text-accent" aria-hidden>*</span>
          </span>
          <input className="field" type="number" min={0} max={10000} value={balance} onChange={(e) => setBalance(e.target.value)} required />
          <span className="block text-xs text-faint">
            {delta > 0 ? `Adds ${delta}` : delta < 0 ? `Removes ${-delta}` : "Type the number of credits the company should have"}
          </span>
        </label>
        <label className="block space-y-2">
          <span className="label-mono">
            {delta < 0 ? "Reason" : "Contract / invoice reference"} <span className="text-accent" aria-hidden>*</span>
          </span>
          <input
            className="field"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={delta < 0 ? "e.g. Contract amended to 3 roles" : "e.g. SPP-2026-014"}
            required
            maxLength={200}
          />
        </label>
        {increase && (
          <label className="block space-y-2">
            <span className="label-mono">Agreed price (optional)</span>
            <div className="flex gap-2">
              <input className="field" type="number" min={0} value={priceAmount} onChange={(e) => setPriceAmount(e.target.value)} placeholder="Total" />
              <select className="field w-28" value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value)} aria-label="Currency">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </label>
        )}
        <label className="block space-y-2">
          <span className="label-mono">Note (optional)</span>
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </label>
      </div>
      {message && (
        <Alert tone={message.tone === "danger" ? "danger" : undefined} className="mt-4">
          {message.text}
        </Alert>
      )}
      <p className="mt-4 text-xs text-faint">* Required · every change is kept in the credit history.</p>
      <button className="btn btn-gold mt-3" disabled={busy || !valid}>
        {busy ? "Saving…" : "Update"}
      </button>
    </form>
  );
}
