"use client";

import { useRef } from "react";
import { Mic, MicOff, Paperclip, Send, Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  function autosize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }

  return (
    <div className="border-t border-line bg-card px-3 py-2.5">
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
              <Phone /> {voiceStarting ? "Connecting…" : "Start live voice conversation"}
            </Button>
          )}
        </div>
      )}

      <div className="flex items-end gap-1.5">
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
          variant="ghost"
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
              ? "Voice conversation is live — just talk"
              : dictating
                ? "Listening… speak, then edit before sending"
                : "Type your answer, or use the mic"
          }
          disabled={disabled || voiceLive}
          className="max-h-[140px] min-h-9 flex-1 resize-none rounded-lg border border-line-strong bg-card px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ink disabled:opacity-60"
        />

        <Button
          variant="ghost"
          size="icon"
          aria-label={dictating ? "Stop dictation" : "Dictate your answer"}
          title="Dictate — the transcript lands here for you to review before sending"
          onClick={onToggleDictation}
          disabled={disabled || voiceLive}
          className={cn(dictating && "bg-warn-wash text-warn")}
        >
          {dictating ? <MicOff /> : <Mic />}
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

      {uploading && (
        <p className="mt-1.5 text-[11.5px] text-muted">Parsing document…</p>
      )}
    </div>
  );
}
