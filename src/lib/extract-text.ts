"use client";

/**
 * Browser-side text extraction (2026-09-26).
 *
 * Why: Vercel rejects any request body over ~4.5 MB with
 * `413 FUNCTION_PAYLOAD_TOO_LARGE` before our code runs, so /api/upload-parse
 * could never accept a typical company deck or handbook in production (works
 * locally, where no such limit exists — which is how it shipped). Extracting
 * here means only the text crosses the network, capped at MAX_CHARS, so file
 * size stops mattering. Same output contract as /api/upload-parse.
 */

const MAX_CHARS = 60_000; // matches /api/upload-parse
const MAX_BYTES = 50 * 1024 * 1024; // sanity cap — the browser does the work now

export type Extracted = { name: string; text: string; truncated: boolean };

export async function extractText(file: File): Promise<Extracted> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.size > MAX_BYTES) throw new Error("File too large (max 50 MB)");

  let text: string;
  if (ext === "txt" || ext === "md" || ext === "markdown") {
    text = await file.text();
  } else if (ext === "pdf") {
    text = await pdfText(file);
  } else if (ext === "docx") {
    text = await docxText(file);
  } else if (ext === "doc") {
    throw new Error("Legacy .doc isn't supported. Open it in Word and save it as .docx.");
  } else {
    throw new Error(`Unsupported file type ".${ext}". Use PDF, DOCX, MD or TXT.`);
  }

  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    throw new Error(
      ext === "pdf"
        ? "No readable text in this PDF. If it's a scan, it has no text layer, so paste the text instead."
        : "No readable text found in the file"
    );
  }
  const truncated = text.length > MAX_CHARS;
  return { name: file.name, text: truncated ? text.slice(0, MAX_CHARS) : text, truncated };
}

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    throw new Error(
      /password/i.test(msg)
        ? "That PDF is password-protected. Remove the protection and upload it again."
        : "That PDF couldn't be read."
    );
  }

  const pages: string[] = [];
  let chars = 0;
  // Stop once past the cap — no point parsing page 300 of a handbook we'll truncate.
  for (let i = 1; i <= doc.numPages && chars <= MAX_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : ""))
      .join("");
    pages.push(line);
    chars += line.length;
  }
  await doc.destroy();
  return pages.join("\n\n");
}

async function docxText(file: File): Promise<string> {
  // @ts-expect-error — mammoth's browser bundle ships without type declarations
  const mammoth = (await import("mammoth/mammoth.browser.min.js")).default;
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value as string;
  } catch {
    throw new Error("That Word file couldn't be read. If it's an older .doc, re-save it as .docx.");
  }
}
