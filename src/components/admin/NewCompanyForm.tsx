"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";

/**
 * New customer company (Stage A, admins only). One submit creates the company
 * (its Clerk Organization), attaches the hidden Company Intel, records the
 * opening credits against the contract and invites the first user — then
 * opens the company page, where all of it can be changed later.
 */

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SGD", "ILS", "AED", "HKD"] as const;

type Intel = { id: string; name: string };

function Req() {
  return (
    <span className="text-accent" aria-hidden>
      *
    </span>
  );
}

export function NewCompanyForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [intel, setIntel] = useState<Intel[] | null>(null);
  const [name, setName] = useState("");
  const [intelCompanyId, setIntelCompanyId] = useState("");
  const [credits, setCredits] = useState("0");
  const [reference, setReference] = useState("");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState<string>("EUR");
  const [note, setNote] = useState("");
  const [firstUserEmail, setFirstUserEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/company-intel/companies")
      .then((r) => r.json())
      .then((d) => setIntel(((d.companies ?? []) as Intel[]).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setIntel([]));
  }, []);

  const n = Number(credits);
  const withCredits = Number.isInteger(n) && n > 0;
  const valid =
    name.trim().length >= 2 && Number.isInteger(n) && n >= 0 && (!withCredits || reference.trim().length > 0);

  // Choosing a researched company fills an empty name with it.
  function chooseIntel(id: string) {
    setIntelCompanyId(id);
    const picked = intel?.find((i) => i.id === id);
    if (picked && !name.trim()) setName(picked.name);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          intelCompanyId: intelCompanyId || null,
          credits: n,
          reference,
          priceAmount: withCredits && priceAmount !== "" ? Number(priceAmount) : null,
          priceCurrency,
          note,
          firstUserEmail,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not create the company");
      const q = d.invite === "failed" ? "?invite=failed" : "";
      router.push(`/internal/companies/${d.companyId}${q}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the company");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-surface mt-8 p-6">
      <p className="label-mono">New company</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="label-mono">
            Company name <Req />
          </span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus />
        </label>
        <label className="block space-y-2">
          <span className="label-mono">Company Intel (optional, hidden from the customer)</span>
          <select className="field" value={intelCompanyId} onChange={(e) => chooseIntel(e.target.value)}>
            <option value="">{intel === null ? "Loading…" : "None for now"}</option>
            {intel?.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="label-mono mt-8">Opening credits</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="label-mono">
            Credits <Req />
          </span>
          <input className="field" type="number" min={0} max={10000} value={credits} onChange={(e) => setCredits(e.target.value)} required />
          <span className="block text-xs text-faint">0 = add credits later, on the company page</span>
        </label>
        {withCredits && (
          <>
            <label className="block space-y-2">
              <span className="label-mono">
                Contract / invoice reference <Req />
              </span>
              <input
                className="field"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. SPP-2026-014"
                maxLength={200}
                required
              />
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
          </>
        )}
      </div>

      <p className="label-mono mt-8">First user</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="label-mono">Email (optional)</span>
          <input
            className="field"
            type="email"
            value={firstUserEmail}
            onChange={(e) => setFirstUserEmail(e.target.value)}
            placeholder="name@customer.com"
            maxLength={254}
          />
          <span className="block text-xs text-faint">Gets an email invitation to join the company</span>
        </label>
      </div>

      {error && (
        <Alert tone="danger" className="mt-5">
          {error}
        </Alert>
      )}
      <p className="mt-5 text-xs text-faint">* Required · logged in the admin activity log.</p>
      <div className="mt-3 flex gap-2">
        <button className="btn btn-gold" disabled={busy || !valid}>
          {busy ? "Creating…" : "Create company"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
