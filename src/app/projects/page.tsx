"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { AppHeader } from "@/components/AppHeader";
import { NewPositionDialog } from "@/components/project/NewPositionDialog";
import {
  StageMiniProgress,
  type MiniStage,
} from "@/components/project/StageMiniProgress";
import { relativeTime } from "@/lib/utils";

/**
 * Home (#4b) — "Your hiring positions": what you own, and what was shared
 * with you. Each card carries the 4-node stage indicator so the state of a
 * whole search reads at a glance.
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load your positions");
        setOwned(d.owned ?? []);
        setShared(d.shared ?? []);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Could not load your positions");
        setOwned([]);
      });
  }, []);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[22px] font-semibold text-ink">
            Your hiring positions
          </h1>
          <NewPositionDialog />
        </div>

        {error && (
          <Alert tone="danger" className="mt-5">
            {error}
          </Alert>
        )}

        <Section title="Owned by you">
          {owned === null ? (
            <LoadingGrid />
          ) : owned.length === 0 ? (
            <EmptyCard>
              No positions yet. Start one and the Job Description agent will interview you.
            </EmptyCard>
          ) : (
            <Grid>
              {owned.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </Grid>
          )}
        </Section>

        {shared.length > 0 && (
          <Section title="Shared with you">
            <Grid>
              {shared.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </Grid>
          </Section>
        )}
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  );
}

const STATUS_TONE = {
  open: "active",
  draft: "draft",
  filled: "done",
  archived: "neutral",
} as const;

function ProjectCard({ project: p }: { project: Project }) {
  return (
    <Link
      href={`/projects/${p.id}`}
      className="flex flex-col gap-3 rounded-card border border-line bg-card p-4 transition-all hover:border-line-strong hover:shadow-[0_2px_10px_rgba(10,17,25,0.07)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-[15px] font-semibold leading-tight text-ink">
          {p.title}
        </h3>
        <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
      </div>

      <StageMiniProgress stages={p.stages} />

      <p className="text-[11.5px] leading-snug text-muted">
        {p.doneCount} of {p.stageCount} stages · updated {relativeTime(p.updatedAt)}
        {!p.isOwner && (
          <>
            <br />
            {p.ownerName} · you are a {p.viewerRole}
          </>
        )}
      </p>
    </Link>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-muted">
      {children}
    </div>
  );
}

function LoadingGrid() {
  return (
    <Grid>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-card border border-line bg-card p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-3 h-[18px] w-32" />
          <Skeleton className="mt-3 h-3 w-full" />
        </div>
      ))}
    </Grid>
  );
}
