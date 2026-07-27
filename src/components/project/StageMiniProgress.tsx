"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageStatus } from "@/components/board/stage-types";

export type MiniStage = {
  slug: string;
  name: string;
  status: StageStatus;
  version: number | null;
};

/**
 * The 4-node pipeline indicator on a position card (#4b): circular step nodes
 * joined by connectors. Connector solid only between two completed stages —
 * so a glance tells you how far the artifact chain has actually flowed, not
 * just how many stages exist.
 */
export function StageMiniProgress({ stages }: { stages: MiniStage[] }) {
  return (
    <div className="flex items-center" role="list" aria-label="Stage progress">
      {stages.map((stage, i) => {
        const prev = stages[i - 1];
        return (
          <div key={stage.slug} className="flex items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "h-px w-4",
                  prev.status === "done" && stage.status === "done"
                    ? "bg-accent"
                    : "border-t border-dashed border-line-strong"
                )}
              />
            )}
            <span
              role="listitem"
              title={`${stage.name} — ${stage.status}`}
              className={cn(
                "flex size-[18px] shrink-0 items-center justify-center rounded-full border text-[9px] font-bold",
                stage.status === "done" && "border-accent bg-accent text-white",
                stage.status === "active" && "border-accent bg-accent-wash text-accent-ink",
                stage.status === "warning" && "border-warn bg-warn-wash text-warn",
                stage.status === "not-started" && "border-line-strong bg-card text-muted"
              )}
            >
              {stage.status === "done" ? <Check className="size-2.5" /> : i + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}
