"use client";

import { useState } from "react";
import { ClipboardCopy, FileCode, FileDown, FileText, FileType } from "lucide-react";

/**
 * Download panel shared by the job description review and the interview kit
 * (Dana, 2026-11-01: more formats than Word and PDF). Every format is built on
 * the server from the same version, with the Role ID in the footer.
 *
 * Google Docs has no "open this file" link without a Google sign-in on our
 * side, so it works the way people already do it by hand: the formatted
 * document is copied, a new Google Doc opens, and the user pastes (⌘V / Ctrl+V)
 * — headings, lists, tables and logos come across.
 */
export function DownloadMenu({ artifactId, note }: { artifactId: string; note: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [gdoc, setGdoc] = useState(false);
  const pasteKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘V" : "Ctrl+V";
  const url = (format: string, inline = false) => `/api/artifacts/${artifactId}/download?format=${format}${inline ? "&inline=1" : ""}`;

  const htmlBlob = () =>
    fetch(url("html", true)).then(async (r) => {
      if (!r.ok) throw new Error("Could not build the document");
      return new Blob([await r.text()], { type: "text/html" });
    });
  const textBlob = () =>
    fetch(url("txt", true)).then(async (r) => {
      if (!r.ok) throw new Error("Could not build the document");
      return new Blob([await r.text()], { type: "text/plain" });
    });

  // The clipboard write must start inside the click, so the blobs are passed as promises.
  async function copyFormatted(): Promise<boolean> {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": htmlBlob(), "text/plain": textBlob() })]);
      return true;
    } catch {
      try {
        await navigator.clipboard.writeText(await (await textBlob()).text());
        return true;
      } catch {
        return false;
      }
    }
  }

  // Copy first, then open the doc from a second click: a tab opened in the same
  // click takes focus, and browsers refuse clipboard writes from an unfocused page.
  async function googleDocs() {
    setMsg("Copying…");
    const ok = await copyFormatted();
    setGdoc(ok);
    setMsg(ok ? null : "Your browser blocked copying. Download Word instead and open it in Google Drive.");
  }

  async function copy() {
    setMsg((await copyFormatted()) ? "Copied with formatting: paste into email, Notion, Ashby or any document." : "Your browser blocked copying.");
  }

  return (
    <div className="card-surface p-6">
      <p className="label-mono mb-3">Download</p>
      <a className="btn btn-ghost w-full" href={url("docx")} download>
        <FileDown className="size-4" /> Word (.docx)
      </a>
      <a className="btn btn-ghost mt-2 w-full" href={url("pdf")} download>
        <FileDown className="size-4" /> PDF
      </a>
      {gdoc ? (
        <div className="mt-2 rounded-lg border border-accent/40 bg-accent-wash p-3 text-xs text-ink">
          Copied with formatting. Now open a new Google Doc and paste with {pasteKey}.
          <a className="btn btn-gold mt-2 w-full" href="https://docs.new" target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => setGdoc(false), 500)}>
            <FileType className="size-4" /> Open a new Google Doc
          </a>
        </div>
      ) : (
        <button className="btn btn-ghost mt-2 w-full" onClick={googleDocs}>
          <FileType className="size-4" /> Google Docs
        </button>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-center text-sm text-muted hover:text-ink">More formats</summary>
        <a className="btn btn-ghost mt-2 w-full" href={url("html")} download>
          <FileCode className="size-4" /> Web page (.html)
        </a>
        <a className="btn btn-ghost mt-2 w-full" href={url("md")} download>
          <FileText className="size-4" /> Markdown (.md) · Notion
        </a>
        <a className="btn btn-ghost mt-2 w-full" href={url("txt")} download>
          <FileText className="size-4" /> Plain text (.txt) · ATS
        </a>
        <button className="btn btn-ghost mt-2 w-full" onClick={copy}>
          <ClipboardCopy className="size-4" /> Copy with formatting
        </button>
      </details>
      {msg && <p className="mt-3 text-xs text-accent">{msg}</p>}
      <p className="mt-3 text-xs text-faint">{note}</p>
    </div>
  );
}
