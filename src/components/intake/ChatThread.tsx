"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Message } from "./use-intake-session";

/**
 * The stage drawer's message thread. Renders the agent's Markdown as
 * pre-wrapped text rather than parsing it — the artifact review panel is
 * where a formatted job description belongs, and a Markdown renderer here
 * would fight the narrow column.
 */
export function ChatThread({
  messages,
  loading,
  elapsedLabel,
  hideFirstUserTurn,
}: {
  messages: Message[];
  loading?: boolean;
  elapsedLabel?: string | null;
  hideFirstUserTurn?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // The synthetic opener ("Start the NEW JOB intake session.") and any
  // server-injected inherited context are machinery, not conversation.
  const visible = hideFirstUserTurn ? messages.slice(1) : messages;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="flex flex-col gap-3">
        {visible.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[13px] leading-relaxed",
              m.role === "user"
                ? "self-end bg-ink-soft text-canvas"
                : "self-start border border-line bg-canvas-subtle text-ink"
            )}
          >
            {truncateForThread(m.content)}
          </div>
        ))}

        {loading && (
          <div className="self-start rounded-xl border border-line bg-canvas-subtle px-3 py-2">
            <div className="flex items-center gap-2">
              <Dots />
              <span className="text-[12px] text-muted">
                {elapsedLabel ?? "Thinking…"}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/**
 * An uploaded document arrives as one enormous user turn (up to 60K chars).
 * Showing it in full buries the conversation, so the thread shows the header
 * plus a size note; the full text is what the agent received and is preserved
 * verbatim in the DB.
 */
function truncateForThread(content: string): string {
  const uploadMatch = content.match(/^\[Uploaded document: ([^\]]+)\]/);
  if (uploadMatch && content.length > 600) {
    const words = content.split(/\s+/).length;
    return `📄 ${uploadMatch[1]}\n\nParsed and sent to the agent (~${words.toLocaleString()} words).`;
  }
  if (content.startsWith("The following approved artifacts")) {
    return "↳ Inherited context from the approved upstream artifact was sent with this turn.";
  }
  return content;
}

function Dots() {
  return (
    <span className="flex gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-pulse rounded-full bg-accent"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}
