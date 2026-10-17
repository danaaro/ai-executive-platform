import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * Status vocabulary shared by stage cards, project chips and artifact rows,
 * set in the mockup's mono-caps style. `done` is green (approved) as in the
 * mockup; gold stays the "in progress" colour.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.12em] whitespace-nowrap",
  {
    variants: {
      tone: {
        done: "border border-success/40 bg-success/10 text-success",
        active: "border border-accent/50 bg-accent-wash text-accent",
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
