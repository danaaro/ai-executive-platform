"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NewPositionDialog } from "@/components/project/NewPositionDialog";
import { ArrowUpRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { relativeTime } from "@/lib/utils";
import { CreditsForm, LedgerList, type Company, type Entry } from "./CompaniesAdmin";

/**
 * Admin company page (admins only), in the Lovable "Organization detail"
 * layout: company name, "Start new role" (opens a role for the customer,
 * spending one of its credits) and the roles — each opens the admin role
 * view. Below: credits, Company Intel and documents, people, credit history.
 * Every visit is written to the admin activity log.
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
  stage: "Interviewing" | "Draft ready" | "Approved";
};

const stageClass: Record<Role["stage"], string> = {
  Interviewing: "text-accent",
  "Draft ready": "text-ink",
  Approved: "text-success",
};

export function CompanyAdminDetail({ companyId }: { companyId: string }) {
  const [info, setInfo] = useState<{ name: string; clerkOrgId: string; intelCompanyId: string | null } | null>(null);
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [credits, setCredits] = useState<Company | null>(null);
  const [ledger, setLedger] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
      <AppHeader
        breadcrumb={
          <p className="truncate text-sm text-muted">
            <Link href="/internal/companies" className="hover:text-ink">
              Companies
            </Link>{" "}
            / {info?.name ?? "…"}
          </p>
        }
      />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-mono mb-3">
              {roles ? `${roles.length} ${roles.length === 1 ? "role" : "roles"}` : "Roles"}
              {credits && <> · {credits.granted} credits added · {credits.spent} spent</>}
            </p>
            <h1 className="font-display text-4xl font-normal text-ink">{info?.name ?? "…"}</h1>
          </div>
          {info && credits && (
            <NewPositionDialog
              credits={credits.balance}
              forCompany={{
                id: companyId,
                name: info.name,
                onCreated: (pid) => router.push(`/internal/companies/${companyId}/roles/${pid}`),
              }}
            />
          )}
        </div>

        {error && (
          <Alert tone="danger" className="mb-6">
            {error}
          </Alert>
        )}

        <div id="roles" className="scroll-mt-24 space-y-3">
          {roles === null ? (
            [0, 1].map((i) => (
              <div key={i} className="card-surface p-5">
                <Skeleton className="h-5 w-1/3" />
              </div>
            ))
          ) : roles.length === 0 ? (
            <div className="card-surface border-dashed px-6 py-12 text-center text-muted">
              No roles yet. Use <span className="text-ink">Start new role</span> to open the first one for{" "}
              {info?.name}, or let the customer open it themselves.
            </div>
          ) : (
            roles.map((r) => (
              <Link
                key={r.id}
                href={`/internal/companies/${companyId}/roles/${r.id}`}
                className="card-surface flex flex-wrap items-center gap-x-6 gap-y-2 p-5 transition hover:border-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-display text-xl font-normal text-ink">{r.title}</h3>
                  <p className="mt-1 text-xs text-faint">
                    Updated {relativeTime(r.updatedAt)} · opened by {r.createdBy}
                    {r.hiringManagerEmail && <> · HM {r.hiringManagerEmail}</>}
                  </p>
                </div>
                <span className="hidden font-mono text-xs text-muted sm:inline">
                  {r.salaryMin !== null && r.salaryMax !== null
                    ? `${r.salaryMin.toLocaleString()}–${r.salaryMax.toLocaleString()} ${r.salaryCurrency ?? ""}`
                    : "no salary range"}
                </span>
                <span className={`label-mono w-28 text-right ${stageClass[r.stage]}`}>{r.stage}</span>
                <ArrowUpRight className="size-4 text-faint" />
              </Link>
            ))
          )}
        </div>

        <p className="label-mono mt-14 mb-4">Account</p>
        {credits && <CreditsForm company={credits} onDone={() => void load({ withCompany: true })} />}

        <IntelAndDocuments companyId={companyId} />

        <People companyId={companyId} />

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

type Person = { email: string; name: string | null; status: "member" | "invited"; since: string; link: string | null };

/**
 * The company's people: members of its Clerk Organization and pending
 * invitations. An admin can invite someone here (e.g. the first user).
 */
function People({ companyId }: { companyId: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "info"; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/companies/${companyId}/users`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load the people");
        setPeople(d.people);
      })
      .catch((e) => {
        setPeople([]);
        setMessage({ tone: "danger", text: e instanceof Error ? e.message : "Could not load the people" });
      });
  }, [companyId]);

  async function send(to: string, resend: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/admin/companies/${companyId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: to, resend }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not send the invitation");
      setPeople(d.people);
      setMessage({
        tone: "info",
        text:
          d.result === "already"
            ? `${to} is already a member or invited — use Resend or Copy link on their row.`
            : `Invitation ${resend ? "re-sent" : "sent"} to ${to}. If it doesn't arrive, use Copy link and send it yourself.`,
      });
      if (!resend) setEmail("");
    } catch (err) {
      setMessage({ tone: "danger", text: err instanceof Error ? err.message : "Could not send the invitation" });
    } finally {
      setBusy(false);
    }
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    void send(email.trim().toLowerCase(), false);
  }

  async function copy(p: Person) {
    if (!p.link) return;
    try {
      await navigator.clipboard.writeText(p.link);
      setMessage({ tone: "info", text: `Invite link for ${p.email} copied — paste it into your own email or WhatsApp.` });
    } catch {
      window.prompt("Copy the invite link:", p.link);
    }
  }

  return (
    <section className="card-surface mt-6 p-6">
      <p className="label-mono mb-4">People</p>
      {people === null ? (
        <Skeleton className="h-4 w-1/2" />
      ) : people.length === 0 ? (
        <p className="text-sm text-muted">No one yet. Invite the customer&apos;s first user below.</p>
      ) : (
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <li key={`${p.status}:${p.email}`} className="flex items-baseline gap-4 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink">
                {p.name ? `${p.name} · ` : ""}
                {p.email}
              </span>
              {p.status === "invited" && (
                <span className="flex gap-3 text-xs">
                  {p.link && (
                    <button type="button" className="text-accent hover:underline" onClick={() => void copy(p)}>
                      Copy link
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-accent hover:underline disabled:opacity-50"
                    onClick={() => void send(p.email, true)}
                    disabled={busy}
                  >
                    Resend
                  </button>
                </span>
              )}
              <span className="text-xs text-faint">{relativeTime(p.since)}</span>
              <span className={`label-mono w-20 text-right ${p.status === "invited" ? "text-muted" : ""}`}>
                {p.status === "invited" ? "Invited" : "Member"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={invite} className="mt-5 flex flex-wrap gap-2">
        <input
          className="field flex-1"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@customer.com"
          aria-label="Email to invite"
          maxLength={254}
          required
        />
        <button className="btn btn-gold" disabled={busy || !email.trim()}>
          {busy ? "Sending…" : "Invite"}
        </button>
      </form>
      {message && (
        <Alert tone={message.tone === "danger" ? "danger" : undefined} className="mt-4">
          {message.text}
        </Alert>
      )}
    </section>
  );
}
