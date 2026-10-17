"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { AppHeader } from "@/components/AppHeader";
import { NewPositionDialog } from "@/components/project/NewPositionDialog";
import type { MiniStage } from "@/components/project/StageMiniProgress";
import { relativeTime } from "@/lib/utils";

/**
 * Company home — the customer's roles, in the Exec10X mockup's layout
 * ("Organization detail", UI review 2026-10-17): company name as the title,
 * gold "Start new role", one row per role with progress and status. Roles the
 * user owns come first; roles shared with them follow.
 */

type Project = {
  id: string;
  title: string;
  status: "open" | "draft" | "filled" | "archived";
  updatedAt: string;
  ownerName: string;
  isOwner: boolean;
  viewerRole: string;
  artifactCount: number;
  stages: MiniStage[];
  doneCount: number;
  stageCount: number;
};

export default function ProjectsPage() {
  const [owned, setOwned] = useState<Project[] | null>(null);
  const [shared, setShared] = useState<Project[]>([]);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ADR-010: signed in, but not (yet) part of a customer company.
  const [noCompany, setNoCompany] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load your roles");
        setNoCompany(Boolean(d.noCompany));
        setCompanyName(d.companyName ?? null);
        setOwned(d.owned ?? []);
        setShared(d.shared ?? []);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Could not load your roles");
        setOwned([]);
      });
  }, []);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-mono mb-3">Executive roles</p>
            <h1 className="font-display text-4xl font-normal text-ink">
              {companyName ?? "Your roles"}
            </h1>
          </div>
          {!noCompany && <NewPositionDialog />}
        </div>

        {error && (
          <Alert tone="danger" className="mb-6">
            {error}
          </Alert>
        )}

        {noCompany && (
          <Alert className="mb-6">
            Your account is not linked to a company yet. If you were invited, open the invitation
            email and accept it, then sign in again. Otherwise, contact the person who invited you.
          </Alert>
        )}

        {owned === null ? (
          <LoadingRows />
        ) : owned.length === 0 && shared.length === 0 ? (
          !noCompany && (
            <div className="card-surface border-dashed px-6 py-12 text-center text-muted">
              No roles yet. Start one and the agent will interview you to build the brief.
            </div>
          )
        ) : (
          <div className="space-y-3">
            {owned.map((p) => (
              <RoleRow key={p.id} project={p} />
            ))}
          </div>
        )}

        {shared.length > 0 && (
          <section className="mt-12">
            <p className="label-mono mb-4">Shared with you</p>
            <div className="space-y-3">
              {shared.map((p) => (
                <RoleRow key={p.id} project={p} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

/**
 * The role's status in the mockup's words, read from its Job Description
 * stage: approved JD → Approved; a saved draft → Draft ready; otherwise the
 * briefing is still going → Interviewing.
 */
function roleStatus(p: Project): { label: string; className: string } {
  const jd = p.stages.find((s) => s.slug === "job-description") ?? p.stages[0];
  if (jd?.status === "done") return { label: "Approved", className: "text-success" };
  if (jd?.version) return { label: "Draft ready", className: "text-ink" };
  return { label: "Interviewing", className: "text-accent" };
}

function RoleRow({ project: p }: { project: Project }) {
  const status = roleStatus(p);
  const pct = p.stageCount ? Math.round((p.doneCount / p.stageCount) * 100) : 0;
  return (
    <Link
      href={`/projects/${p.id}`}
      className="card-surface flex items-center gap-6 p-5 transition hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-xl font-normal text-ink">{p.title}</h3>
        <p className="mt-1 text-xs text-faint">
          Updated {relativeTime(p.updatedAt)}
          {!p.isOwner && <> · {p.ownerName} · you are a {p.viewerRole}</>}
        </p>
      </div>
      <div className="hidden w-48 sm:block">
        <div className="h-1 overflow-hidden rounded-full bg-elevated">
          <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 font-mono text-xs text-muted">
          {p.doneCount} of {p.stageCount} stages
        </p>
      </div>
      <span className={`label-mono w-28 text-right ${status.className}`}>{status.label}</span>
    </Link>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card-surface flex items-center gap-6 p-5">
          <div className="flex-1">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
          <Skeleton className="hidden h-1 w-48 sm:block" />
        </div>
      ))}
    </div>
  );
}
