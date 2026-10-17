"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ConversationProvider } from "@elevenlabs/react";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { InterviewWorkspace } from "@/components/intake/InterviewWorkspace";
import { useProjectDetail } from "@/components/project/use-project-detail";

/** The job description briefing for one role — full page (Lovable mockup). */
export default function InterviewPage() {
  return (
    <Suspense fallback={null}>
      <ConversationProvider>
        <Interview />
      </ConversationProvider>
    </Suspense>
  );
}

function Interview() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const modeParam = search.get("mode");
  const mode = modeParam === "upload" || modeParam === "voice" || modeParam === "type" ? modeParam : null;
  const { data, error, reload } = useProjectDetail(params.id);
  const stage = data?.stages.find((s) => s.slug === "job-description") ?? null;

  if (error) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-12">
          <Alert tone="danger">{error}</Alert>
        </main>
      </>
    );
  }
  if (!data || !stage) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_360px]">
          <Skeleton className="h-[70vh]" />
          <Skeleton className="h-80" />
        </main>
      </>
    );
  }
  // Keyed by role only: the session keeps its own conversation once started.
  return (
    <InterviewWorkspace key={params.id} projectId={params.id} data={data} stage={stage} mode={mode} onChanged={reload} />
  );
}
