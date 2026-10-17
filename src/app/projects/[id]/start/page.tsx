"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FileUp, Keyboard, Mic } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Skeleton } from "@/components/ui/field";
import { useProjectDetail } from "@/components/project/use-project-detail";

/**
 * "How would you like to begin?" — the Lovable mockup's new-role screen
 * (organizations.$orgId.jobs.new) with the three start options agreed in the
 * UI review (U7). Each opens the briefing ready for that method; switching
 * stays possible throughout.
 */
const OPTIONS = [
  {
    mode: "upload",
    icon: FileUp,
    title: "Upload documents",
    desc: "Share an existing job description, notes, or your leadership and culture documents. The agent reads them first and skips what they already answer.",
  },
  {
    mode: "voice",
    icon: Mic,
    title: "Voice conversation",
    desc: "Speak with the agent. It listens and asks one question at a time.",
  },
  {
    mode: "type",
    icon: Keyboard,
    title: "Type",
    desc: "Answer in writing, at your own pace. Rough notes are fine.",
  },
] as const;

export default function StartPage() {
  const params = useParams<{ id: string }>();
  const { data } = useProjectDetail(params.id);

  return (
    <>
      <AppHeader
        breadcrumb={
          <span className="truncate text-sm text-muted">
            <Link href="/projects" className="hover:text-ink">
              Executive roles
            </Link>{" "}
            /{" "}
            <Link href={`/projects/${params.id}`} className="hover:text-ink">
              {data?.project.title ?? "Role"}
            </Link>{" "}
            / Start
          </span>
        }
      />
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <p className="label-mono mb-3 text-center">
          New role · {data ? data.project.title : <Skeleton className="inline-block h-3 w-32 align-middle" />}
        </p>
        <h1 className="text-center font-display text-5xl font-normal text-ink">How would you like to begin?</h1>
        <p className="mx-auto mt-4 max-w-lg text-center text-muted">
          You can switch between documents, voice and typing at any point during the briefing.
        </p>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {OPTIONS.map(({ mode, icon: Icon, title, desc }) => (
            <Link
              key={mode}
              href={`/projects/${params.id}/interview?mode=${mode}`}
              className="card-surface group p-7 transition hover:border-accent/60 hover:gold-glow"
            >
              <div className="flex size-12 items-center justify-center rounded-full bg-elevated text-accent transition group-hover:bg-accent group-hover:text-card">
                <Icon className="size-5" />
              </div>
              <h3 className="mt-6 font-display text-2xl font-normal text-ink">{title}</h3>
              <p className="mt-2 text-sm text-muted">{desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
