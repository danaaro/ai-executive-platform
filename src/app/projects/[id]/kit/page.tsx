"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { parseJson } from "@/lib/api";
import { KitSetup, type KitOptionsResponse } from "@/components/kit/KitSetup";
import { KitView, type KitResponse } from "@/components/kit/KitView";

/**
 * Interview kit (Step 2) for one role. Without a kit, or with ?new=1, the
 * input screen; otherwise the chosen version (?kit=) or the latest one.
 * ?run=1 marks a version just created here: its missing parts start writing.
 */
export default function KitPage() {
  return (
    <Suspense fallback={null}>
      <Kit />
    </Suspense>
  );
}

function Kit() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [options, setOptions] = useState<KitOptionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<KitResponse["inputs"] | null>(null);

  const load = useCallback(async () => {
    try {
      setOptions(await parseJson<KitOptionsResponse>(await fetch(`/api/projects/${params.id}/interview-kit`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the interview kit");
    }
  }, [params.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const base = `/projects/${params.id}/kit`;
  const kitId = search.get("kit") ?? options?.kits[0]?.id ?? null;
  const showSetup = Boolean(options) && (search.get("new") === "1" || !kitId);

  const header = (
    <AppHeader
      breadcrumb={
        <span className="truncate text-sm text-muted">
          <Link href="/projects" className="hover:text-ink">
            Executive roles
          </Link>{" "}
          /{" "}
          <Link href={`/projects/${params.id}`} className="hover:text-ink">
            {options?.title ?? "Role"}
          </Link>{" "}
          / Interview kit
        </span>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <main className="mx-auto max-w-6xl px-4 py-12">
          <Alert tone="danger">{error}</Alert>
        </main>
      </>
    );
  }
  if (!options) {
    return (
      <>
        {header}
        <main className="mx-auto max-w-6xl px-4 py-12">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="mt-6 h-64" />
        </main>
      </>
    );
  }

  return (
    <>
      {header}
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="label-mono mb-3">Step 2 · Interview kit</p>
            <h1 className="font-display text-4xl font-normal text-ink">{options.title}</h1>
            <p className="mt-2 text-sm text-muted">How we assess, the recruiter screen and the interview guide, with questions and a rubric for every area.</p>
          </div>
          {!showSetup && options.kits.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                className="field w-auto"
                value={kitId ?? ""}
                onChange={(e) => router.push(`${base}?kit=${e.target.value}`)}
                aria-label="Kit version"
              >
                {options.kits.map((k) => (
                  <option key={k.id} value={k.id}>
                    Kit v{k.version}
                    {k.jdVersion ? ` · JD v${k.jdVersion}` : ""}
                  </option>
                ))}
              </select>
              {options.canWrite && (
                <Link href={`${base}?new=1`} className="btn btn-ghost">
                  New kit
                </Link>
              )}
            </div>
          )}
        </div>

        {options.jdVersions.length === 0 ? (
          <Alert tone="info">The interview kit opens once the job description has been generated.</Alert>
        ) : showSetup ? (
          <div className="max-w-3xl">
            <KitSetup
              projectId={params.id}
              options={options}
              start={
                prefill
                  ? { ...prefill, extra: [], jdArtifactId: options.defaults.jdArtifactId }
                  : undefined
              }
              onCreated={async (id) => {
                await load();
                router.push(`${base}?kit=${id}&run=1`);
              }}
              onCancel={options.kits.length ? () => router.push(base) : undefined}
            />
          </div>
        ) : (
          kitId && (
            <KitView
              key={kitId}
              projectId={params.id}
              kitId={kitId}
              autoRun={search.get("run") === "1"}
              onNewVersion={async (id, run) => {
                await load();
                router.push(`${base}?kit=${id}${run ? "&run=1" : ""}`);
              }}
              onChangeInputs={(inputs) => {
                setPrefill(inputs);
                router.push(`${base}?new=1`);
              }}
            />
          )
        )}
      </main>
    </>
  );
}
