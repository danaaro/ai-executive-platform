import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-2.5 rounded-lg border p-3 text-[13px] leading-relaxed", {
  variants: {
    tone: {
      warn: "border-warn/40 bg-warn-wash text-warn",
      info: "border-line bg-canvas-subtle text-muted",
      accent: "border-accent/40 bg-accent-wash text-accent-ink",
      danger: "border-danger/40 bg-danger-wash text-danger",
    },
  },
  defaultVariants: { tone: "info" },
});

export function Alert({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div role="status" className={cn(alertVariants({ tone }), className)} {...props} />;
}
