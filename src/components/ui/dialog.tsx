"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * One Radix Dialog powers two surfaces:
 *  - <Dialog>  — centered modal (#4c New position, request-changes)
 *  - <Sheet>   — right-side drawer (#1b stage work drawer)
 * Radix is here for the accessibility that is genuinely hard to hand-roll:
 * focus trapping, scroll locking, Esc, and aria wiring.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="overlay"
      className={cn("fixed inset-0 z-50 bg-ink/40 backdrop-blur-[1px]", className)}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        data-slot="modal"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-card p-5 shadow-xl focus:outline-none",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-4 top-4 rounded text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent-ink"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/**
 * Right-side drawer. `size` is the deliberate deviation from wireframe #1b:
 * "chat" keeps the specified ~320px for intake, "review" widens to 640px
 * because a 700-word job description is unreadable in a 300px column.
 */
export function SheetContent({
  className,
  children,
  size = "chat",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { size?: "chat" | "review" }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        data-slot="sheet"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col border-l border-line bg-card shadow-2xl transition-[width] duration-200 focus:outline-none",
          size === "review" ? "w-[min(640px,100vw)]" : "w-[min(360px,100vw)]",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("font-display text-base font-semibold text-ink", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn("text-[13px] text-muted", className)} {...props} />
  );
}
