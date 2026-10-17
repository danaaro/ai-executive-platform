"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { MarkdownLite } from "@/components/review/MarkdownLite";
import { relativeTime } from "@/lib/utils";

/**
 * Admin read-only view of one customer role (Dana 2026-10-18: roles on the
 * admin company page are clickable). Role facts, the job description versions
 * and the briefing conversation as the customer saw it. Nothing here can be
 * changed; every visit is logged.
 */

type Data = {
  role: {
    title: string;
    status: string;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    showSalaryOnJd: boolean;
    hiringManagerEmail: string | null;
    createdBy: string;
    createdAt: string;
    companyName: string;
  };
  artifacts: { id: string; agentSlug: string; version: number; status: string; content: string; createdBy: string; createdAt: string }[];
  messages: { role: "user" | "assistant"; content: string; createdAt: string }[];
};

export function AdminRoleView({ companyId, roleId }: { companyId: string; roleId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/companies/${companyId}/roles/${roleId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load the role");
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the role"));
  }, [companyId, roleId]);

  const jds = data?.artifacts.filter((a) => a.agentSlug === "job-description") ?? [];
  const shown = jds.find((a) => a.id === version) ?? jds[0] ?? null;
  const r = data?.role;

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="label-mono mb-3">
          <Link href="/internal/companies" className="hover:text-ink">
            Companies &amp; credits
          </Link>{" "}
          /{" "}
          <Link href={`/internal/companies/${companyId}`} className="hover:text-ink">
            {r?.companyName ?? "Company"}
          </Link>{" "}
          / Role · read-only
        </p>
        {error && <Alert tone="danger">{error}</Alert>}
        {!r ? (
          !error && <Skeleton className="h-10 w-1/2" />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h1 className="font-display text-4xl font-normal text-ink">{r.title}</h1>
              <span className="label-mono">{r.status}</span>
            </div>
            <p className="mt-3 text-sm text-muted">
              {r.salaryMin !== null && r.salaryMax !== null
                ? `${r.salaryMin.toLocaleString()}–${r.salaryMax.toLocaleString()} ${r.salaryCurrency ?? ""} (${r.showSalaryOnJd ? "shown on JD" : "internal"})`
                : "No salary range"}
              {" · "}opened by {r.createdBy} {relativeTime(r.createdAt)}
              {r.hiringManagerEmail && <> · hiring manager {r.hiringManagerEmail}</>}
            </p>

            <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_380px]">
              <section className="card-surface min-w-0 p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="label-mono">Job description</p>
                  {jds.length > 1 && (
                    <select className="field w-auto" value={shown?.id ?? ""} onChange={(e) => setVersion(e.target.value)} aria-label="Version">
                      {jds.map((a) => (
                        <option key={a.id} value={a.id}>
                          v{a.version} · {a.status}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {shown ? (
                  <>
                    <p className="mb-4 text-xs text-faint">
                      v{shown.version} · {shown.status} · by {shown.createdBy} · {relativeTime(shown.createdAt)}
                    </p>
                    <div className="text-[15px]">
                      <MarkdownLite text={shown.content} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted">No job description saved yet.</p>
                )}
              </section>

              <section className="card-surface p-6 lg:max-h-[80vh] lg:overflow-y-auto">
                <p className="label-mono mb-4">Briefing conversation</p>
                {data.messages.length === 0 ? (
                  <p className="text-sm text-muted">No conversation yet.</p>
                ) : (
                  <ul className="space-y-4 text-sm">
                    {data.messages.map((m, i) => (
                      <li key={i}>
                        <p className="label-mono mb-1">{m.role === "assistant" ? "Agent" : "Customer"}</p>
                        <p className="whitespace-pre-wrap text-ink">
                          {m.content.length > 1500 ? `${m.content.slice(0, 1500)}…` : m.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </>
  );
}
