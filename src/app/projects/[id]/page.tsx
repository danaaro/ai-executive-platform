"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ConversationProvider } from "@elevenlabs/react";
import { Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { StageCard, Connector } from "@/components/board/StageCard";
import { StageDrawer } from "@/components/board/StageDrawer";
import type { ProjectDetail, Stage } from "@/components/board/stage-types";

/**
 * Board (#1b) — the hub for one hiring position: the full stage pipeline on a
 * dot-grid canvas, with a work drawer per stage.
 *
 * Stage state comes entirely from the server (src/orchestrator/stages.ts), so
 * this page renders the pipeline rather than reasoning about it.
 */
export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <ConversationProvider>
        <Board />
      </ConversationProvider>
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
  const [openSlug, setOpenSlug] = useState<string | null>(searchParams.get("stage"));

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${params.id}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not load this position");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this position");
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const phase1 = data?.stages.filter((s) => s.phase === 1) ?? [];
  const phase2 = data?.stages.filter((s) => s.phase === 2) ?? [];
  const openStage = data?.stages.find((s) => s.slug === openSlug) ?? null;

  function openDrawer(stage: Stage) {
    setOpenSlug(stage.slug);
    router.replace(`/projects/${params.id}?stage=${stage.slug}`, { scroll: false });
  }

  function closeDrawer() {
    setOpenSlug(null);
    router.replace(`/projects/${params.id}`, { scroll: false });
  }

  if (error) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Alert tone="danger">{error}</Alert>
          <Link
            href="/projects"
            className="mt-4 inline-block text-[13px] font-medium text-accent-ink hover:underline"
          >
            ← Back to positions
          </Link>
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Skeleton className="h-6 w-56" />
          <div className="mt-8 flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-[212px]" />
            ))}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader
        breadcrumb={
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-display text-[14px] font-semibold text-ink">
              {data.project.title}
            </span>
            <Badge tone={STATUS_TONE[data.project.status]}>{data.project.status}</Badge>
            {data.viewerRole === "viewer" && <Badge tone="neutral">view only</Badge>}
          </div>
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

      <main className="board-canvas min-h-[calc(100vh-3.5rem)] px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <p className="mb-4 text-[11.5px] text-muted">
            Each stage&apos;s approved output feeds the next. Open any stage at any time — nothing
            is locked.
          </p>

          {/* Phase 1 — the candidate-agnostic role setup pipeline. */}
          <div className="flex items-stretch overflow-x-auto pb-3">
            {phase1.map((stage, i) => (
              <div key={stage.slug} className="flex items-center">
                {i > 0 && (
                  <Connector
                    solid={
                      phase1[i - 1].status === "done" &&
                      (stage.status === "done" || stage.status === "active")
                    }
                  />
                )}
                <StageCard stage={stage} onOpen={openDrawer} />
              </div>
            ))}
          </div>

          {phase2.length > 0 && (
            <>
              <div className="mt-8 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-center text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted">
                  Interviews happen outside the system · then, per candidate
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <div className="mt-4 flex items-stretch gap-2 overflow-x-auto pb-3">
                {phase2.map((stage) => (
                  <StageCard key={stage.slug} stage={stage} onOpen={openDrawer} compact />
                ))}
              </div>
              <p className="mt-1 text-[11.5px] text-muted">
                Phase 2 — per-candidate stages, on the roadmap. Nothing personal is stored yet.
              </p>
            </>
          )}
        </div>
      </main>

      <StageDrawer
        stage={openStage}
        projectId={params.id}
        canWrite={data.canWrite}
        onClose={closeDrawer}
        onChanged={load}
      />
    </>
  );
}
