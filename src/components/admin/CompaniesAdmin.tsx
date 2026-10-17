"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { relativeTime } from "@/lib/utils";

/**
 * Companies & credits (ADR-011, admins only). The list of customer companies
 * with their balances; each opens the admin company page, where credits are
 * added (against a contract) or corrected, and history and roles are shown.
 * Credits appear only through these screens.
 */

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SGD", "ILS", "AED", "HKD"] as const;

export type Company = { id: string; name: string; clerkOrgId: string; balance: number; granted: number; spent: number };
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

  useEffect(() => {
    fetch("/api/admin/companies")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load companies");
        setCompanies(d.companies);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load companies"));
  }, []);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="label-mono mb-3">Admin</p>
        <h1 className="font-display text-4xl font-normal text-ink">Companies &amp; credits</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Open a company to add or correct its credits, see its history and its roles. Credits are
          added when a customer&apos;s contract is signed; each role a customer opens spends one.
        </p>

        {error && (
          <Alert tone="danger" className="mt-6">
            {error}
          </Alert>
        )}

        <div className="mt-10 space-y-3">
          {companies === null
            ? [0, 1].map((i) => (
                <div key={i} className="card-surface p-5">
                  <Skeleton className="h-5 w-1/3" />
                </div>
              ))
            : companies.map((c) => (
                <Link
                  key={c.id}
                  href={`/internal/companies/${c.id}`}
                  className="card-surface flex items-center gap-6 p-5 transition hover:border-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-xl font-normal text-ink">{c.name}</h3>
                    <p className="mt-1 font-mono text-xs text-muted">
                      {c.granted} added · {c.spent} spent
                    </p>
                  </div>
                  <p className="font-display text-2xl text-ink">
                    {c.balance} <span className="text-sm text-muted">available</span>
                  </p>
                  <ArrowUpRight className="size-4 text-faint" />
                </Link>
              ))}
        </div>
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

export function AdjustForm({ company, onDone }: { company: Company; onDone: () => void }) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "info"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/companies/${company.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: Number(delta), reason }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not correct the balance");
      setMessage({ tone: "info", text: `Balance corrected — now ${d.balance} available.` });
      setDelta("");
      setReason("");
      onDone();
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : "Could not correct the balance" });
    } finally {
      setBusy(false);
    }
  }

  const n = Number(delta);
  const valid = Number.isInteger(n) && n !== 0 && reason.trim().length > 0;

  return (
    <form onSubmit={submit} className="card-surface p-6">
      <p className="label-mono">Correct balance</p>
      <p className="mt-2 text-sm text-muted">
        History is never edited: a correction is a new entry. Use a negative number to remove
        credits (e.g. -2). The balance cannot go below zero.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-[160px_1fr]">
        <label className="block space-y-2">
          <span className="label-mono">
            Credits (+/−) <span className="text-accent" aria-hidden>*</span>
          </span>
          <input className="field" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="-2" required />
        </label>
        <label className="block space-y-2">
          <span className="label-mono">
            Reason <span className="text-accent" aria-hidden>*</span>
          </span>
          <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Contract amended to 3 roles" required maxLength={1000} />
        </label>
      </div>
      {message && (
        <Alert tone={message.tone === "danger" ? "danger" : undefined} className="mt-4">
          {message.text}
        </Alert>
      )}
      <p className="mt-4 text-xs text-faint">* Required</p>
      <button className="btn btn-ghost mt-3" disabled={busy || !valid}>
        {busy ? "Saving…" : "Save correction"}
      </button>
    </form>
  );
}

export function GrantForm({ company, onGranted }: { company: Company; onGranted: (list: Company[]) => void }) {
  const [credits, setCredits] = useState("1");
  const [contractRef, setContractRef] = useState("");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState<string>("EUR");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "info"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company.id,
          credits: Number(credits),
          contractRef,
          priceAmount: priceAmount === "" ? null : Number(priceAmount),
          priceCurrency,
          note,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not add credits");
      setMessage({ tone: "info", text: `Added ${credits} credit${credits === "1" ? "" : "s"} to ${company.name}.` });
      setContractRef("");
      setPriceAmount("");
      setNote("");
      setCredits("1");
      onGranted(d.companies);
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : "Could not add credits" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-mono">Add credits · {company.name}</p>
        <p className="font-display text-2xl text-ink">
          {company.balance} <span className="text-base text-muted">available</span>
        </p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="label-mono">Credits <span className="text-accent" aria-hidden>*</span></span>
          <input className="field" type="number" min={1} max={1000} value={credits} onChange={(e) => setCredits(e.target.value)} required />
        </label>
        <label className="block space-y-2">
          <span className="label-mono">Contract / invoice reference <span className="text-accent" aria-hidden>*</span></span>
          <input className="field" value={contractRef} onChange={(e) => setContractRef(e.target.value)} placeholder="e.g. SPP-2026-014" required maxLength={200} />
        </label>
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
      <p className="mt-4 text-xs text-faint">* Required</p>
      <button className="btn btn-gold mt-3" disabled={busy || !contractRef.trim()}>
        {busy ? "Adding…" : "Add credits"}
      </button>
    </form>
  );
}
