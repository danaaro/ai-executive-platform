"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { useProjectDetail } from "@/components/project/use-project-detail";

/** Job description review for one role — full page (Lovable mockup). */
export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <Review />
    </Suspense>
  );
}

function Review() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { data, error, reload } = useProjectDetail(params.id);
  const stage = data?.stages.find((s) => s.slug === "job-description") ?? null;
  const artifactId = search.get("artifact") ?? stage?.latest?.id ?? null;

  useEffect(() => {
    // Nothing saved yet: the briefing is where to go.
    if (data && stage && !artifactId) router.replace(`/projects/${params.id}/interview`);
  }, [data, stage, artifactId, router, params.id]);

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
  if (!data || !artifactId) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-12">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="mt-6 h-64" />
        </main>
      </>
    );
  }
  return <ReviewWorkspace key={artifactId} projectId={params.id} data={data} artifactId={artifactId} onChanged={reload} />;
}
