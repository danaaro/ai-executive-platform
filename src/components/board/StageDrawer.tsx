"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  TriangleAlert,
  ArrowDownToLine,
  FileCheck2,
  RotateCw,
  Save,
  FileText,
} from "lucide-react";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useIntakeSession } from "@/components/intake/use-intake-session";
import { IntakeProgressPanel } from "@/components/intake/IntakeProgressPanel";
import { ChatThread } from "@/components/intake/ChatThread";
import { Composer } from "@/components/intake/Composer";
import { DraftReview } from "@/components/review/DraftReview";
import { findDeliverable, generateDraftPrompt } from "@/components/review/deliverable";
import type { Stage } from "./stage-types";

const INTAKE_START = "Start the NEW JOB intake session.";

/**
 * The stage work drawer (#1b) — one stage's whole loop in a single surface:
 * intake conversation → save draft → review → approve.
 *
 * It switches between two widths: ~360px for the conversation, 640px for
 * review (see SheetContent's `size`). That is the one place this build
 * knowingly departs from the wireframe's 300px spec.
 */
export function StageDrawer({
  stage,
  projectId,
  canWrite,
  onClose,
  onChanged,
}: {
  stage: Stage | null;
  projectId: string;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"chat" | "review">("chat");
  const [reviewArtifactId, setReviewArtifactId] = useState<string | null>(null);

  // Remount the session when the stage changes so no state leaks between
  // stages (each has its own thread, coverage and inheritance).
  const key = stage ? `${stage.slug}:${stage.threadId ?? "new"}` : "none";

  useEffect(() => {
    if (!stage) return;
    // Opening a stage that already has a draft goes straight to review —
    // that is the natural next action, not more conversation.
    if (stage.latest) {
      setReviewArtifactId(stage.latest.id);
      setMode("review");
    } else {
      setReviewArtifactId(null);
      setMode("chat");
    }
  }, [stage]);

  return (
    <Dialog open={Boolean(stage)} onOpenChange={(o) => !o && onClose()}>
      {stage && (
        <SheetContent
          size={mode === "review" ? "review" : "chat"}
          aria-describedby={undefined}
        >
          <StageDrawerBody
            key={key}
            stage={stage}
            projectId={projectId}
            canWrite={canWrite}
            mode={mode}
            setMode={setMode}
            reviewArtifactId={reviewArtifactId}
            setReviewArtifactId={setReviewArtifactId}
            onClose={onClose}
            onChanged={onChanged}
          />
        </SheetContent>
      )}
    </Dialog>
  );
}

function StageDrawerBody({
  stage,
  projectId,
  canWrite,
  mode,
  setMode,
  reviewArtifactId,
  setReviewArtifactId,
  onClose,
  onChanged,
}: {
  stage: Stage;
  projectId: string;
  canWrite: boolean;
  mode: "chat" | "review";
  setMode: (m: "chat" | "review") => void;
  reviewArtifactId: string | null;
  setReviewArtifactId: (id: string | null) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const isJD = stage.slug === "job-description";
  const [warningAcked, setWarningAcked] = useState(stage.blockedBy.length === 0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const session = useIntakeSession({
    agentSlug: stage.slug,
    projectId,
    initialConversationId: stage.threadId,
    inherit: stage.inheritedFrom.length > 0,
    voiceEnabled: isJD,
    coverageEnabled: isJD,
    onTurnComplete: onChanged,
  });

  // Non-streaming generations run 60–100s. An elapsed counter plus honest
  // copy is what makes that wait legible instead of feeling like a hang.
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
    if (elapsed < 8) return "Thinking…";
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const stamp = mins ? `${mins}m ${secs}s` : `${secs}s`;
    return `Working — ${stamp}. Long answers take up to two minutes; it's safe to leave this open.`;
  }, [session.loading, elapsed]);

  // The DELIVERABLE — the long-form document the agent produced — not merely
  // the last thing it said. Mid-interview the last assistant turn is a
  // follow-up question, and saving that stored a question as v1 of the job
  // description.
  const deliverable = findDeliverable(session.messages);

  const startedRef = useRef(false);
  useEffect(() => {
    // Auto-open the JD intake with its documented trigger phrase. Other
    // stages open with an inheritance-aware opener.
    if (startedRef.current) return;
    if (session.hydrating || session.messages.length > 0 || !canWrite) return;
    if (!warningAcked) return;
    startedRef.current = true;
    session.startSession(
      isJD
        ? INTAKE_START
        : stage.inheritedFrom.length > 0
          ? "Here are the approved upstream artifacts for this role. Please begin."
          : "Please begin. Ask me for whatever input you need."
    );
  }, [session, isJD, canWrite, warningAcked, stage.inheritedFrom.length]);

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onChanged();
      setReviewArtifactId(data.id);
      setMode("review");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-display text-[14px] font-semibold text-ink">
              {stage.name}
            </h2>
            {stage.approved && <Badge tone="done">v{stage.approved.version}</Badge>}
          </div>
          {mode === "review" && (
            <button
              onClick={() => setMode("chat")}
              className="mt-0.5 text-[11.5px] font-medium text-accent-ink hover:underline"
            >
              ← Back to conversation
            </button>
          )}
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </header>

      {mode === "review" && reviewArtifactId ? (
        <DraftReview
          artifactId={reviewArtifactId}
          stageName={stage.name}
          canWrite={canWrite}
          onApproved={() => {
            onChanged();
            onClose();
          }}
          onRequestChanges={(prompt) => {
            setMode("chat");
            session.sendText(prompt);
          }}
        />
      ) : (
        <>
          {/* Soft gating warning (#3b): caution, never a lock. */}
          {stage.blockedBy.length > 0 && (
            <Alert tone="warn" className="m-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1">
                <p>
                  {stage.blockedBy.map((b) => b.name).join(" and ")}{" "}
                  {stage.blockedBy.length > 1 ? "aren't" : "isn't"} approved yet — you can draft{" "}
                  {stage.name.toLowerCase()} now, but it may need revision once{" "}
                  {stage.blockedBy.length > 1 ? "they change" : "it changes"}.
                </p>
                {!warningAcked && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    onClick={() => setWarningAcked(true)}
                  >
                    Draft anyway
                  </Button>
                )}
              </div>
            </Alert>
          )}

          {/* Inheritance note (#3d step 3). */}
          {stage.inheritedFrom.length > 0 && (
            <div className="flex items-center gap-1.5 border-b border-line bg-accent-wash px-4 py-2 text-[11.5px] text-accent-ink">
              <ArrowDownToLine className="size-3.5 shrink-0" />
              Inherited from{" "}
              {stage.inheritedFrom.map((i) => `${i.name} v${i.version}`).join(", ")} ✓
            </div>
          )}

          {isJD && <IntakeProgressPanel coverage={session.coverage} loading={session.loading} />}

          {session.hydrating ? (
            <p className="flex-1 px-4 py-3 text-[13px] text-muted">Loading this session…</p>
          ) : (
            <ChatThread
              messages={session.messages}
              loading={session.loading}
              elapsedLabel={elapsedLabel}
              hideFirstUserTurn
            />
          )}

          {session.voiceDropped && (
            <Alert tone="warn" className="mx-3 mb-2">
              <RotateCw className="mt-0.5 size-4 shrink-0" />
              <span>
                The voice call ended unexpectedly. Everything you said is saved — press “Start
                live voice conversation” to pick up where you left off.
              </span>
            </Alert>
          )}

          {session.voiceLive && (
            <div className="mx-3 mb-2 rounded-lg border border-accent bg-accent-wash px-3 py-2 text-[12px] font-medium text-accent-ink">
              {session.voiceStatusLabel}
            </div>
          )}

          {(session.error || saveError) && (
            <Alert tone="danger" className="mx-3 mb-2">
              {session.error ?? saveError}
            </Alert>
          )}

          {/* Saving a draft is what opens the approve loop. */}
          {canWrite && !session.loading && session.messages.length > 1 && (
            <div className="flex flex-col gap-1.5 border-t border-line px-3 py-2">
              {deliverable ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={saveDraft}
                    disabled={saving}
                  >
                    {stage.latest ? <FileCheck2 /> : <Save />}
                    {saving
                      ? "Saving…"
                      : stage.latest
                        ? `Save as v${stage.latest.version + 1} & review`
                        : "Save draft & review"}
                  </Button>
                  {!deliverable.isLatest && (
                    <p className="text-center text-[11px] text-muted">
                      Saves the {stage.name.toLowerCase()} the agent produced — not the latest chat
                      message.
                    </p>
                  )}
                </>
              ) : (
                <>
                  {/*
                    No document in the thread yet. Offering "Save draft" here is
                    what caused a follow-up question to be stored as v1 — so ask
                    the agent to produce the draft instead.
                  */}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      session.sendText(generateDraftPrompt(stage.slug, stage.name))
                    }
                    disabled={saving}
                  >
                    <FileText /> Generate {stage.name.toLowerCase()} draft
                  </Button>
                  <p className="text-center text-[11px] text-muted">
                    Builds a draft from everything answered so far and flags what&apos;s still
                    missing.
                  </p>
                </>
              )}
            </div>
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
              voiceEnabled={isJD}
              voiceLive={session.voiceLive}
              voiceStarting={session.voiceStarting}
              onStartVoice={session.startVoice}
              onEndVoice={session.endVoice}
            />
          ) : (
            <Alert tone="info" className="m-3">
              You have view-only access to this position.
            </Alert>
          )}
        </>
      )}
    </>
  );
}
