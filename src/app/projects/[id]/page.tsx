"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { ArrowUpRight, ClipboardList, FileText, Lock } from "lucide-react";
import type { ProjectDetail, Stage } from "@/components/board/stage-types";

/**
 * Role page — the hub for one role, in the Exec10X/Lovable layout: the role's
 * locked facts, then the two steps of the customer journey as boxes:
 * Job Description (Step 1 — opens the briefing or the review) and the
 * Interview kit (Step 2 — placeholder until it is built; unlocks on approval).
 * The older agent stages are hidden for now (Dana, 2026-10-17).
 */
export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <Board />
    </Suspense>
  );
}

const STATUS_TONE = {
  open: "active",
  draft: "draft",
  filled: "done",
  archived: "neutral",
} as const;

function Board() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${params.id}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not load this role");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this role");
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Older links opened the job description in a drawer (?stage=…).
  useEffect(() => {
    if (searchParams.get("stage") === "job-description") {
      router.replace(`/projects/${params.id}/interview`);
    }
  }, [searchParams, router, params.id]);

  if (error) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-12">
          <Alert tone="danger">{error}</Alert>
          <Link href="/projects" className="label-mono mt-4 inline-block text-accent hover:underline">
            ← Back to roles
          </Link>
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-12">
          <Skeleton className="h-10 w-72" />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </main>
      </>
    );
  }

  const jd = data.stages.find((s) => s.slug === "job-description") ?? null;

  return (
    <>
      <AppHeader
        breadcrumb={
          <Link href="/projects" className="label-mono truncate hover:text-ink">
            Executive roles
          </Link>
        }
      >
        {data.members.length > 1 && (
          <span
            className="hidden items-center gap-1 text-[12px] text-muted sm:flex"
            title={data.members.map((m) => `${m.name} (${m.role})`).join(", ")}
          >
            <Users className="size-3.5" />
            {data.members.length}
          </span>
        )}
      </AppHeader>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="label-mono mb-3">Role</p>
            <h1 className="font-display text-4xl font-normal text-ink">{data.project.title}</h1>
            <p className="mt-3 text-sm text-muted">
              {data.project.salaryMin != null && data.project.salaryMax != null && (
                <>
                  {data.project.salaryMin.toLocaleString()}–{data.project.salaryMax.toLocaleString()}{" "}
                  {data.project.salaryCurrency} base
                  {data.project.showSalaryOnJd ? " · shown on the job description" : " · internal"}
                </>
              )}
              {data.project.hiringManagerEmail && <> · Hiring manager {data.project.hiringManagerEmail}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[data.project.status]}>{data.project.status}</Badge>
            {data.viewerRole === "viewer" && <Badge tone="neutral">view only</Badge>}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {jd && <JobDescriptionBox projectId={params.id} stage={jd} />}
          <InterviewKitBox unlocked={jd?.status === "done"} />
        </div>
      </main>
    </>
  );
}

function jdStatus(stage: Stage): { label: string; className: string } {
  if (stage.status === "done" && stage.approved) return { label: `Approved · v${stage.approved.version}`, className: "text-success" };
  if (stage.latest) return { label: `Draft ready · v${stage.latest.version}`, className: "text-ink" };
  if (stage.threadId) return { label: "Interviewing", className: "text-accent" };
  return { label: "Not started", className: "text-faint" };
}

function JobDescriptionBox({ projectId, stage }: { projectId: string; stage: Stage }) {
  const status = jdStatus(stage);
  const href = stage.latest ? `/projects/${projectId}/review?artifact=${(stage.approved ?? stage.latest).id}` : `/projects/${projectId}/interview`;
  return (
    <div className="card-surface flex flex-col p-7">
      <div className="flex items-start justify-between">
        <div className="flex size-12 items-center justify-center rounded-full bg-elevated text-accent">
          <FileText className="size-5" />
        </div>
        <span className={`label-mono ${status.className}`}>{status.label}</span>
      </div>
      <p className="label-mono mt-6">Step 1</p>
      <h2 className="mt-1 font-display text-2xl font-normal text-ink">Job description</h2>
      <p className="mt-2 text-sm text-muted">
        A short briefing with the hiring manager, one question at a time, then a job description ready to take to market.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href={href} className="btn btn-gold">
          {stage.latest ? (stage.approved ? "View job description" : "Review draft") : stage.threadId ? "Continue briefing" : "Start briefing"}
          <ArrowUpRight className="size-4" />
        </Link>
        {stage.latest && !stage.approved && (
          <Link href={`/projects/${projectId}/interview`} className="btn btn-ghost">
            Back to briefing
          </Link>
        )}
      </div>
    </div>
  );
}

function InterviewKitBox({ unlocked }: { unlocked: boolean }) {
  return (
    <div className="card-surface flex flex-col p-7 opacity-80">
      <div className="flex items-start justify-between">
        <div className="flex size-12 items-center justify-center rounded-full bg-elevated text-faint">
          <ClipboardList className="size-5" />
        </div>
        <span className="label-mono">Coming next</span>
      </div>
      <p className="label-mono mt-6">Step 2</p>
      <h2 className="mt-1 font-display text-2xl font-normal text-ink">Interview kit</h2>
      <p className="mt-2 text-sm text-muted">
        Built from the approved job description: the interview plan, questions and the confidential recruiter brief.
      </p>
      <div className="mt-6">
        <span className="btn btn-ghost pointer-events-none opacity-60">
          <Lock className="size-4" /> {unlocked ? "Coming soon" : "Unlocks when the job description is approved"}
        </span>
      </div>
    </div>
  );
}
