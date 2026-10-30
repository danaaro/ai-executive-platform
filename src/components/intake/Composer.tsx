"use client";

import { useEffect, useRef } from "react";
import { Mic, Paperclip, Send, Phone, PhoneOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The composer, consistent across every stage drawer: text input + dictation
 * mic + attach + send, plus the live-voice control where the stage supports it.
 * All four intake methods of #3a are reachable from this one bar.
 */
export function Composer({
  input,
  setInput,
  onSend,
  disabled,
  dictating,
  onToggleDictation,
  uploading,
  onFile,
  voiceEnabled,
  voiceLive,
  voiceStarting,
  onStartVoice,
  onEndVoice,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  dictating: boolean;
  onToggleDictation: () => void;
  uploading: boolean;
  onFile: (f: File) => void;
  voiceEnabled?: boolean;
  voiceLive?: boolean;
  voiceStarting?: boolean;
  onStartVoice?: () => void;
  onEndVoice?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Keep the cursor in the box: on mount, and every time it re-enables after a
  // reply, an upload or dictation (a disabled textarea drops focus).
  const typeable = !disabled && !voiceLive && !dictating;
  useEffect(() => {
    if (typeable) taRef.current?.focus();
  }, [typeable]);

  function autosize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }

  return (
    <div className="border-t border-line bg-card px-4 py-3">
      {voiceEnabled && (
        <div className="mb-2">
          {voiceLive ? (
            <Button
              variant="danger"
              size="sm"
              className="w-full"
              onClick={onEndVoice}
              disabled={voiceStarting}
            >
              <PhoneOff /> End voice conversation
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onStartVoice}
              disabled={disabled || voiceStarting}
            >
              <Phone /> {voiceStarting ? "Connecting…" : "Start voice conversation"}
            </Button>
          )}
        </div>
      )}

      {dictating ? (
        // Listening bar (Exec10X mockup): unmistakably "on", with one clear way
        // to finish. The transcript lands in the text box to review before
        // sending.
        <div className="flex items-center gap-4 rounded-xl bg-elevated px-4 py-3" role="status" aria-live="polite">
          <div className="flex h-8 flex-1 items-center gap-1" aria-hidden>
            {Array.from({ length: 32 }).map((_, i) => (
              <span
                key={i}
                className="animate-wave h-full w-1 rounded-full bg-accent"
                style={{ animationDelay: `${(i % 8) * 0.1}s` }}
              />
            ))}
          </div>
          <span className="label-mono text-accent">Listening… speak, then press Done</span>
          <button type="button" className="btn btn-gold px-4 py-2" onClick={onToggleDictation}>
            <Square className="size-3.5" /> Done
          </button>
        </div>
      ) : (
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.md,.markdown,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <Button
          variant="secondary"
          size="icon"
          aria-label="Attach a document"
          title="Upload a job description, brief or notes (PDF, DOCX, MD, TXT)"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading || voiceLive}
        >
          <Paperclip />
        </Button>

        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            autosize();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder={
            voiceLive
              ? "Voice conversation on — just talk"
              : dictating
                ? "Listening… speak, then edit before sending"
                : "Type your answer…"
          }
          disabled={disabled || voiceLive}
          className="max-h-[140px] min-h-10 flex-1 resize-none rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm leading-relaxed text-ink placeholder:text-faint focus-visible:border-accent focus-visible:outline-none disabled:opacity-60"
        />

        <Button
          variant="secondary"
          size="icon"
          aria-label="Dictate your answer"
          title="Dictate — speak, and your words appear here to review before sending"
          onClick={onToggleDictation}
          disabled={disabled || voiceLive}
        >
          <Mic />
        </Button>

        <Button
          variant="primary"
          size="icon"
          aria-label="Send"
          onClick={onSend}
          disabled={disabled || voiceLive || !input.trim()}
        >
          <Send />
        </Button>
      </div>
      )}

      {uploading && (
        <p className="label-mono mt-2">Parsing document…</p>
      )}
    </div>
  );
}
