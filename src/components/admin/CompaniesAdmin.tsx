"use client";

import { useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { relativeTime } from "@/lib/utils";

/**
 * Companies & credits (ADR-011, admins only). Each customer company with its
 * balance; pick one to add credits against a signed contract and to see every
 * grant and spend. Credits appear only through this screen.
 */

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SGD", "ILS", "AED", "HKD"] as const;

type Company = { id: string; name: string; clerkOrgId: string; balance: number; granted: number; spent: number };
type Entry = {
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
  const [selected, setSelected] = useState<string | null>(null);
  const [ledger, setLedger] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/companies")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load companies");
        setCompanies(d.companies);
        if (d.companies.length) setSelected((s) => s ?? d.companies[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load companies"));
  }, []);

  const loadLedger = useCallback((id: string) => {
    setLedger(null);
    fetch(`/api/admin/companies/${id}/ledger`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load the history");
        setLedger(d.ledger);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the history"));
  }, []);

  useEffect(() => {
    if (selected) loadLedger(selected);
  }, [selected, loadLedger]);

  const company = companies?.find((c) => c.id === selected) ?? null;

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="label-mono mb-3">Admin</p>
        <h1 className="font-display text-4xl font-normal text-ink">Companies &amp; credits</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Credits are added here when a customer&apos;s contract is signed. Each role a customer
          opens spends one credit.
        </p>

        {error && (
          <Alert tone="danger" className="mt-6">
            {error}
          </Alert>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            {companies === null
              ? [0, 1].map((i) => (
                  <div key={i} className="card-surface p-5">
                    <Skeleton className="h-5 w-1/2" />
                  </div>
                ))
              : companies.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className={`card-surface block w-full p-5 text-left transition hover:border-accent/50 ${
                      c.id === selected ? "border-accent" : ""
                    }`}
                  >
                    <h3 className="font-display text-xl font-normal text-ink">{c.name}</h3>
                    <p className="mt-2 font-mono text-xs text-muted">
                      {c.balance} available · {c.granted} granted · {c.spent} spent
                    </p>
                  </button>
                ))}
          </div>

          {company && (
            <div className="space-y-6">
              <GrantForm
                company={company}
                onGranted={(list) => {
                  setCompanies(list);
                  loadLedger(company.id);
                }}
              />
              <section className="card-surface p-6">
                <p className="label-mono mb-4">History · {company.name}</p>
                {ledger === null ? (
                  <Skeleton className="h-4 w-2/3" />
                ) : ledger.length === 0 ? (
                  <p className="text-sm text-muted">No credits yet.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {ledger.map((e) => (
                      <li key={e.id} className="flex items-start gap-4 py-3 text-sm">
                        <span
                          className={`w-12 shrink-0 font-mono ${e.delta > 0 ? "text-success" : "text-ink"}`}
                        >
                          {e.delta > 0 ? `+${e.delta}` : e.delta}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-ink">
                            {e.kind === "spend"
                              ? `Role opened: ${e.projectTitle ?? e.note ?? "—"}`
                              : e.kind === "grant"
                                ? `Contract ${e.contractRef ?? "—"}`
                                : `Adjustment${e.note ? `: ${e.note}` : ""}`}
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
                )}
              </section>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function GrantForm({ company, onGranted }: { company: Company; onGranted: (list: Company[]) => void }) {
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
          <span className="label-mono">Credits</span>
          <input className="field" type="number" min={1} max={1000} value={credits} onChange={(e) => setCredits(e.target.value)} required />
        </label>
        <label className="block space-y-2">
          <span className="label-mono">Contract / invoice reference</span>
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
      <button className="btn btn-gold mt-5" disabled={busy || !contractRef.trim()}>
        {busy ? "Adding…" : "Add credits"}
      </button>
    </form>
  );
}
