import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * Status vocabulary shared by stage cards, project chips and artifact rows.
 * `done` is the only brass-filled state — that exclusivity is what makes
 * "approved" readable at a glance across a whole board.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-4 whitespace-nowrap",
  {
    variants: {
      tone: {
        done: "bg-accent text-white",
        active: "border border-accent bg-accent-wash text-accent-ink",
        draft: "border border-line-strong bg-draft-wash text-draft",
        warn: "border border-warn bg-warn-wash text-warn",
        neutral: "border border-line bg-canvas-subtle text-muted",
        danger: "border border-danger bg-danger-wash text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
