import { NextRequest, NextResponse } from "next/server";

/**
 * Parses an uploaded document (txt / md / docx / pdf) into plain text so it
 * can enter the conversation as a user message ("upload materials" input
 * mode). Clerk-gated by middleware like every API route. The file itself is
 * NOT stored — only the extracted text goes into the chat.
 */

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CHARS = 60_000; // keep prompts sane; long docs get truncated with a note

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large (max 10 MB)" },
        { status: 413 }
      );
    }

    const name = file.name;
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const buffer = Buffer.from(await file.arrayBuffer());

    let text = "";
    if (ext === "txt" || ext === "md" || ext === "markdown") {
      text = buffer.toString("utf-8");
    } else if (ext === "docx") {
      try {
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } catch (err) {
        console.error("[upload-parse] docx extraction failed:", err);
        return NextResponse.json(
          { error: "That Word file couldn't be read. If it's an older .doc, re-save it as .docx." },
          { status: 422 }
        );
      }
    } else if (ext === "pdf") {
      // Loaded unbundled via next.config.mjs `serverExternalPackages` — see the
      // note there. Bundled, this import itself threw and every PDF failed.
      try {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        try {
          const result = await parser.getText();
          text = result.text;
        } finally {
          await parser.destroy();
        }
      } catch (err) {
        console.error("[upload-parse] pdf extraction failed:", err);
        const message = err instanceof Error ? err.message : "";
        return NextResponse.json(
          {
            error: /password|encrypt/i.test(message)
              ? "That PDF is password-protected. Remove the protection and upload it again."
              : "That PDF couldn't be read. If it was exported from a scanner it may hold no text layer — paste the text instead.",
          },
          { status: 422 }
        );
      }
    } else if (ext === "doc") {
      // mammoth handles only the OOXML format; legacy binary .doc is a
      // different beast and silently produced the generic 500 before.
      return NextResponse.json(
        { error: "Legacy .doc isn't supported — open it in Word and save as .docx." },
        { status: 415 }
      );
    } else {
      return NextResponse.json(
        { error: `Unsupported file type ".${ext}" — use PDF, DOCX, MD or TXT` },
        { status: 415 }
      );
    }

    text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    let truncated = false;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      truncated = true;
    }
    if (!text) {
      return NextResponse.json(
        { error: "No readable text found in the file" },
        { status: 422 }
      );
    }

    return NextResponse.json({ name, text, truncated });
  } catch (err) {
    console.error("[upload-parse]", err);
    return NextResponse.json({ error: "Could not parse the file" }, { status: 500 });
  }
}
