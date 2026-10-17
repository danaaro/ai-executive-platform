"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, FileUp, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/field";
import { relativeTime } from "@/lib/utils";

/**
 * Company documents (D9) — the customer's reusable hiring material: values,
 * culture, leadership behaviours, existing job descriptions, hiring
 * guidelines. Uploaded once; the agent reads them on every role and skips the
 * questions they already answer.
 */
type Doc = { id: string; filename: string; words: number; createdAt: string };

export default function CompanyDocumentsPage() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/company/documents");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not load the documents");
      setDocs(d.documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the documents");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const parsed = await fetch("/api/upload-parse", { method: "POST", body: form });
        const p = await parsed.json();
        if (!parsed.ok) throw new Error(`${file.name}: ${p.error ?? "could not read the file"}`);
        const saved = await fetch("/api/company/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: p.name ?? file.name, content: p.text }),
        });
        const s = await saved.json();
        if (!saved.ok) throw new Error(`${file.name}: ${s.error ?? "could not save"}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    const r = await fetch(`/api/company/documents?id=${id}`, { method: "DELETE" });
    if (!r.ok) setError("Could not remove the document");
    await load();
  }

  return (
    <>
      <AppHeader
        breadcrumb={
          <Link href="/projects" className="label-mono truncate hover:text-ink">
            Executive roles
          </Link>
        }
      />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <p className="label-mono mb-3">Company</p>
        <h1 className="font-display text-4xl font-normal text-ink">Company documents</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Share your values, culture, leadership behaviours, existing job descriptions or hiring
          guidelines once. The agent reads them for every role and skips the questions they already
          answer.
        </p>

        {error && (
          <Alert tone="danger" className="mt-6">
            {error}
          </Alert>
        )}

        <div className="card-surface mt-8 p-6">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.md,.markdown,.txt"
            hidden
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
          <button className="btn btn-gold" onClick={() => fileRef.current?.click()} disabled={busy}>
            <FileUp className="size-4" /> {busy ? "Reading and saving…" : "Upload documents"}
          </button>
          <p className="mt-2 text-xs text-faint">PDF, Word, Markdown or text. You can select several files at once.</p>

          <div className="mt-6">
            {docs === null ? (
              <Skeleton className="h-4 w-1/2" />
            ) : docs.length === 0 ? (
              <p className="text-sm text-muted">No documents yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-3">
                    <FileText className="size-4 shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{d.filename}</p>
                      <p className="text-xs text-faint">
                        ~{d.words.toLocaleString()} words · {relativeTime(d.createdAt)}
                      </p>
                    </div>
                    <button
                      className="btn btn-ghost px-3 py-1.5 text-xs"
                      onClick={() => void remove(d.id)}
                      aria-label={`Remove ${d.filename}`}
                    >
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
