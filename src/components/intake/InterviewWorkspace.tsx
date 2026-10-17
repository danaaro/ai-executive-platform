"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileText, Lock, Phone, PhoneOff, RotateCw, Save, Sparkles } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { ChatThread } from "./ChatThread";
import { Composer } from "./Composer";
import { coverageSummary, useIntakeSession } from "./use-intake-session";
import { findDeliverable, generateDraftPrompt } from "@/components/review/deliverable";
import { INTAKE_START } from "@/shared/intake-openers";
import { parseJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ProjectDetail, Stage } from "@/components/board/stage-types";

/** "Generate job description" unlocks at this completeness (UI review U3). */
export const GENERATE_THRESHOLD = 80;

/** A revision request handed over from the review page (sent on arrival). */
export const pendingTurnKey = (projectId: string) => `exec10x:pending-turn:${projectId}`;

/**
 * Agent interview workspace — the Lovable mockup's "Agent interview" screen
 * (danaaro/executive-job-studio, jobs.$jobId.interview): the conversation on
 * the left; on the right the completeness ring with the locked/unlocked
 * Generate button, the questionnaire sections with ticks, and the documents.
 *
 * Logic is the same intake session the stage drawer used (text, dictation,
 * live voice, uploads, coverage, saving); only the layout is the mockup's.
 */
export function InterviewWorkspace({
  projectId,
  data,
  stage,
  onChanged,
}: {
  projectId: string;
  data: ProjectDetail;
  stage: Stage;
  onChanged: () => void;
}) {
  const router = useRouter();
  const canWrite = data.canWrite;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const uploadRef = useRef<HTMLInputElement>(null);

  const session = useIntakeSession({
    agentSlug: stage.slug,
    projectId,
    initialConversationId: stage.threadId,
    inherit: false,
    voiceEnabled: true,
    coverageEnabled: true,
    onTurnComplete: onChanged,
  });

  useEffect(() => {
    if (!session.loading) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [session.loading]);

  const elapsedLabel = useMemo(() => {
    if (!session.loading) return null;
    if (elapsed < 8) return "Agent is thinking…";
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `Working — ${mins ? `${mins}m ${secs}s` : `${secs}s`}. Long answers take up to two minutes.`;
  }, [session.loading, elapsed]);

  // Open the briefing once, on an empty thread.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || session.hydrating || !canWrite) return;
    if (session.messages.length > 0) {
      startedRef.current = true;
      return;
    }
    startedRef.current = true;
    session.startSession(INTAKE_START);
  }, [session, canWrite]);

  // A revision requested on the review page arrives here as the next turn.
  const pendingSentRef = useRef(false);
  useEffect(() => {
    if (pendingSentRef.current || session.hydrating || session.loading || !canWrite) return;
    if (session.messages.length === 0) return;
    let prompt: string | null = null;
    try {
      prompt = sessionStorage.getItem(pendingTurnKey(projectId));
      if (prompt) sessionStorage.removeItem(pendingTurnKey(projectId));
    } catch {
      prompt = null;
    }
    pendingSentRef.current = true;
    if (prompt) session.sendText(prompt);
  }, [session, canWrite, projectId]);

  const deliverable = findDeliverable(session.messages);
  const { covered, partial, total } = coverageSummary(session.coverage);
  const answered = covered + partial * 0.5;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const ready = pct >= GENERATE_THRESHOLD;
  const R = 52;
  const C = 2 * Math.PI * R;

  const documents = useMemo(
    () =>
      session.messages
        .filter((m) => m.role === "user")
        .map((m) => /^\[Uploaded document: ([^\]]+)\]/.exec(m.content)?.[1])
        .filter((n): n is string => Boolean(n)),
    [session.messages]
  );

  async function saveDraft() {
    if (!deliverable) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/agents/${stage.slug}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: deliverable.content,
          label: stage.name,
          conversationId: session.conversationId,
          projectId,
        }),
      });
      const saved = await parseJson<{ id: string }>(res);
      onChanged();
      router.push(`/projects/${projectId}/review?artifact=${saved.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <>
      <AppHeader
        breadcrumb={
          <span className="truncate text-sm text-muted">
            <Link href="/projects" className="hover:text-ink">
              Executive roles
            </Link>{" "}
            /{" "}
            <Link href={`/projects/${projectId}`} className="hover:text-ink">
              {data.project.title}
            </Link>
          </span>
        }
      />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_360px]">
        {/* Chat */}
        <section className="card-surface flex h-[calc(100vh-7rem)] min-h-[520px] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
            <div className="min-w-0">
              <p className="label-mono">Brief interview</p>
              <h1 className="truncate font-display text-2xl font-normal text-ink">{data.project.title}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden items-center gap-2 text-xs text-success sm:flex">
                <span className="size-2 rounded-full bg-success" /> Agent online
              </span>
              {canWrite &&
                (session.voiceLive ? (
                  <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs text-danger" onClick={session.endVoice} disabled={session.voiceStarting}>
                    <PhoneOff className="size-3.5" /> End call
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={session.startVoice} disabled={session.loading || session.voiceStarting}>
                    <Phone className="size-3.5" /> {session.voiceStarting ? "Connecting…" : "Talk live"}
                  </button>
                ))}
            </div>
          </div>

          {session.hydrating ? (
            <p className="label-mono flex-1 px-6 py-6">Loading this session…</p>
          ) : (
            <ChatThread
              messages={session.messages}
              loading={session.loading}
              elapsedLabel={elapsedLabel}
              hideFirstUserTurn
            />
          )}

          {session.voiceLive && (
            <div className="mx-4 mb-2 rounded-xl border border-accent/50 bg-accent-wash px-4 py-2.5 text-xs font-medium text-accent">
              {session.voiceStatusLabel}
            </div>
          )}
          {session.voiceDropped && (
            <Alert tone="warn" className="mx-4 mb-2">
              <RotateCw className="mt-0.5 size-4 shrink-0" />
              <span>The voice call ended unexpectedly. Everything you said is saved — press “Talk live” to continue.</span>
            </Alert>
          )}
          {(session.error || saveError) && (
            <Alert tone="danger" className="mx-4 mb-2">
              {session.error ?? saveError}
            </Alert>
          )}

          {canWrite ? (
            <Composer
              input={session.input}
              setInput={session.setInput}
              onSend={session.send}
              disabled={session.loading || session.hydrating}
              dictating={session.dictating}
              onToggleDictation={session.toggleDictation}
              uploading={session.uploading}
              onFile={session.handleFile}
              voiceEnabled={false}
              voiceLive={session.voiceLive}
            />
          ) : (
            <Alert tone="info" className="m-4">
              You have view-only access to this role.
            </Alert>
          )}
        </section>

        {/* Progress */}
        <aside className="space-y-4 lg:h-[calc(100vh-7rem)] lg:overflow-y-auto">
          <div className="card-surface flex flex-col items-center p-6">
            <div className="relative size-36">
              <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
                <circle cx="60" cy="60" r={R} fill="none" stroke="var(--elevated)" strokeWidth="6" />
                <circle
                  cx="60"
                  cy="60"
                  r={R}
                  fill="none"
                  stroke={ready ? "var(--success)" : "var(--accent)"}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - pct / 100)}
                  style={{ transition: "stroke-dashoffset .6s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-4xl text-ink">{pct}%</span>
                <span className="label-mono">complete</span>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-muted">
              {ready ? "Ready to draft." : `Reach ${GENERATE_THRESHOLD}% to generate the job description.`}
            </p>
            {canWrite &&
              (deliverable ? (
                <button className="btn btn-gold gold-glow mt-4 w-full" onClick={saveDraft} disabled={saving || session.loading}>
                  <Save className="size-4" /> {saving ? "Saving…" : stage.latest ? `Save as v${stage.latest.version + 1} & review` : "Save draft & review"}
                </button>
              ) : (
                <button
                  className={cn("btn btn-gold mt-4 w-full", ready && "gold-glow")}
                  disabled={!ready || session.loading}
                  onClick={() => session.sendText(generateDraftPrompt(stage.slug, stage.name))}
                >
                  {ready ? <Sparkles className="size-4" /> : <Lock className="size-4" />} Generate job description
                </button>
              ))}
            {stage.latest && (
              <Link
                href={`/projects/${projectId}/review?artifact=${stage.latest.id}`}
                className="mt-3 text-xs text-muted hover:text-ink"
              >
                Review saved draft v{stage.latest.version} →
              </Link>
            )}
          </div>

          <div className="card-surface p-5">
            <p className="label-mono mb-4">
              Questionnaire · {covered}/{total || "—"}
            </p>
            {session.coverage === null ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-3 w-3/4" />
                ))}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {session.coverage.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      "flex gap-2 text-xs",
                      s.status === "covered" ? "text-muted" : s.status === "partial" ? "text-ink" : "text-faint"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                        s.status === "covered" && "border-success bg-success text-card",
                        s.status === "partial" && "border-accent bg-accent-wash",
                        s.status === "missing" && "border-line"
                      )}
                    >
                      {s.status === "covered" && <Check className="size-2.5" />}
                    </span>
                    {s.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card-surface p-5">
            <p className="label-mono mb-3">Documents</p>
            {documents.map((d, i) => (
              <p key={`${d}-${i}`} className="flex items-center gap-2 py-1 text-sm text-muted">
                <FileText className="size-4 text-accent" />
                {d}
              </p>
            ))}
            {canWrite && (
              <>
                <input
                  ref={uploadRef}
                  type="file"
                  accept=".pdf,.docx,.md,.markdown,.txt"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) session.handleFile(f);
                    e.target.value = "";
                  }}
                />
                <button
                  className="text-sm text-muted hover:text-ink disabled:opacity-40"
                  onClick={() => uploadRef.current?.click()}
                  disabled={session.loading || session.uploading || session.voiceLive}
                >
                  {session.uploading ? "Parsing document…" : "+ Upload a document"}
                </button>
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
