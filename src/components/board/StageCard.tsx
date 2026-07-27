"use client";

import { Check, CircleDot, TriangleAlert, ArrowDownToLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/utils";
import { STAGE_LABEL, stageTone, type Stage } from "./stage-types";

/**
 * One stage on the pipeline board (#1b).
 *
 * Every card is clickable regardless of upstream state — flexible gating
 * (#3b, ADR-008 §8). A stage whose dependency isn't approved shows an
 * "⚠ open anyway" chip rather than a lock; the caution lives inside the
 * drawer, where there's room to explain it.
 */
export function StageCard({
  stage,
  onOpen,
  compact,
}: {
  stage: Stage;
  onOpen: (stage: Stage) => void;
  compact?: boolean;
}) {
  const tone = stageTone(stage.status);
  const isPhase2 = stage.phase === 2;

  return (
    <button
      type="button"
      onClick={() => onOpen(stage)}
      className={cn(
        "group flex flex-col gap-2 rounded-card border bg-card p-3 text-left transition-all",
        "hover:border-line-strong hover:shadow-[0_2px_10px_rgba(10,17,25,0.07)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink",
        stage.status === "active" && "border-accent",
        stage.status !== "active" && "border-line",
        compact ? "w-[168px]" : "w-[212px]",
        isPhase2 && "opacity-70"
      )}
      aria-label={`${stage.name} — ${STAGE_LABEL[stage.status]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge tone={tone} className="gap-1">
          <StatusIcon status={stage.status} />
          {stage.status === "done" && stage.approved
            ? `v${stage.approved.version}`
            : STAGE_LABEL[stage.status]}
        </Badge>
        <span className="text-[10px] font-semibold tabular-nums text-muted">
          {stage.order}
        </span>
      </div>

      <div className="font-display text-[13.5px] font-semibold leading-snug text-ink">
        {stage.name}
      </div>

      {isPhase2 ? (
        <p className="text-[11px] leading-snug text-muted">Phase 2 · per candidate</p>
      ) : (
        <StageSummary stage={stage} />
      )}
    </button>
  );
}

function StageSummary({ stage }: { stage: Stage }) {
  if (stage.status === "done" && stage.approved) {
    return (
      <p className="text-[11px] leading-snug text-muted">
        Approved {relativeTime(stage.approved.createdAt)}
        {stage.history.length > 1 && ` · ${stage.history.length} versions`}
      </p>
    );
  }
  if (stage.latest) {
    return (
      <p className="text-[11px] leading-snug text-muted">
        Draft v{stage.latest.version} · saved {relativeTime(stage.latest.createdAt)}
      </p>
    );
  }
  if (stage.threadId) {
    return <p className="text-[11px] leading-snug text-muted">In progress — no draft saved yet</p>;
  }
  if (stage.blockedBy.length > 0) {
    return (
      <p className="text-[11px] leading-snug text-warn">
        {stage.blockedBy.map((b) => b.name).join(" + ")} not approved yet
      </p>
    );
  }
  if (stage.inheritedFrom.length > 0) {
    return (
      <p className="flex items-center gap-1 text-[11px] leading-snug text-accent-ink">
        <ArrowDownToLine className="size-3" />
        Ready — inherits {stage.inheritedFrom.map((i) => `${i.name} v${i.version}`).join(", ")}
      </p>
    );
  }
  return <p className="text-[11px] leading-snug text-muted">Not started</p>;
}

function StatusIcon({ status }: { status: Stage["status"] }) {
  if (status === "done") return <Check className="size-3" />;
  if (status === "active") return <CircleDot className="size-3" />;
  if (status === "warning") return <TriangleAlert className="size-3" />;
  return null;
}

/**
 * Connector between two stages. Solid once the hand-off has actually
 * happened (upstream approved); dashed while pending — the visual difference
 * between "these are linked" and "this has flowed".
 */
export function Connector({ solid }: { solid: boolean }) {
  return (
    <div className="flex shrink-0 items-center px-1" aria-hidden>
      <svg width="34" height="12" viewBox="0 0 34 12" className="overflow-visible">
        <line
          x1="0"
          y1="6"
          x2="26"
          y2="6"
          stroke={solid ? "var(--accent)" : "var(--line-strong)"}
          strokeWidth="1.5"
          strokeDasharray={solid ? undefined : "4 3"}
        />
        <path
          d="M26 2 L32 6 L26 10"
          fill="none"
          stroke={solid ? "var(--accent)" : "var(--line-strong)"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
