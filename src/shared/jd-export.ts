import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Branded Word + PDF export of a job description (PRD v4 §13, customer
 * journey "Outputs"): locked role title and company on the document, Role ID
 * in the footer of every page, for every version from the first draft.
 *
 * Both libraries are pure JavaScript on purpose. pdf-parse's native canvas
 * dependency is what broke PDF upload on Vercel ("DOMMatrix is not defined");
 * nothing here may need a native module or a font file on disk.
 *
 * Input is the same Markdown subset MarkdownLite renders: #/##/### headings,
 * bullets, numbered lists, **bold**, *italic*, horizontal rules, paragraphs.
 */

export type ExportMeta = {
  title: string; // locked role title
  company: string;
  roleId: string;
  version: number;
  status: "draft" | "approved";
};

/** Short, human-readable Role ID derived from the role's uuid. */
export function roleId(projectId: string): string {
  return `R-${projectId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function exportFilename(meta: ExportMeta, ext: "docx" | "pdf"): string {
  const slug = meta.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "role";
  return `${slug}-job-description-v${meta.version}.${ext}`;
}

function footerText(meta: ExportMeta): string {
  const state = meta.status === "approved" ? "Approved" : "Draft";
  return `Exec10X · ${meta.company} · ${meta.title} · Role ID ${meta.roleId} · v${meta.version} ${state}`;
}

/* ---------------- Markdown → blocks ---------------------------------------- */

type Run = { text: string; bold?: boolean; italic?: boolean };
type Block =
  | { kind: "heading"; level: 1 | 2 | 3; runs: Run[] }
  | { kind: "para"; runs: Run[] }
  | { kind: "item"; ordered: boolean; n: number; list: number; runs: Run[] }
  | { kind: "rule" };

function inlineRuns(s: string): Run[] {
  const out: Run[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    const tok = m[0];
    out.push(tok.startsWith("**") ? { text: tok.slice(2, -2), bold: true } : { text: tok.slice(1, -1), italic: true });
    last = m.index + tok.length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let n = 0;
  let list = 0;
  let listOrdered: boolean | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: "para", runs: inlineRuns(para.join(" ")) });
    para = [];
  };
  const endList = () => {
    n = 0;
    listOrdered = null;
  };
  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flush();
      endList();
    } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      endList();
      blocks.push({ kind: "rule" });
    } else if (h) {
      flush();
      endList();
      // "# **Title**" — headings are styled anyway, the bold markers are noise.
      blocks.push({ kind: "heading", level: h[1].length as 1 | 2 | 3, runs: [{ text: h[2].replace(/\*\*/g, "") }] });
    } else if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      if (listOrdered !== ordered) {
        n = 0;
        list++;
        listOrdered = ordered;
      }
      blocks.push({ kind: "item", ordered, n: ++n, list, runs: inlineRuns((bullet ?? numbered)![1]) });
    } else {
      endList();
      // The template's header is stacked "**Company:** …" lines with no blank
      // line between them; each is its own line, not one run-on paragraph.
      if (/^\*\*[^*]+:\*\*/.test(line.trim())) flush();
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** The writer often repeats the title as the first H1; the export prints it already. */
function dropLeadingTitle(blocks: Block[], title: string): Block[] {
  const first = blocks[0];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Also "Head of Marketing — SusanDana": the title plus the company, which the cover prints too.
  if (first?.kind === "heading" && first.level === 1 && norm(first.runs[0].text).startsWith(norm(title))) {
    return blocks.slice(1);
  }
  return blocks;
}

/* ---------------- Word ----------------------------------------------------- */

const INK = "14201C";
const MUTED = "47554F";
const ACCENT = "8A5D19";
const LINE = "CDD5D0";

export async function renderDocx(markdown: string, meta: ExportMeta): Promise<Buffer> {
  const runs = (rs: Run[], color = MUTED) =>
    rs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, color: r.bold ? INK : color }));

  const body: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: "JOB DESCRIPTION", color: ACCENT, size: 18, bold: true, characterSpacing: 40 })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: meta.title, font: "Georgia", size: 48, color: INK })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: meta.company, color: MUTED, size: 22 })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 8 } },
      spacing: { after: 320 },
    }),
  ];

  for (const b of dropLeadingTitle(parseBlocks(markdown), meta.title)) {
    if (b.kind === "rule") {
      body.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 4 } } }));
    } else if (b.kind === "heading") {
      const size = b.level === 1 ? 36 : b.level === 2 ? 28 : 23;
      body.push(
        new Paragraph({
          children: [new TextRun({ text: b.runs[0].text, font: "Georgia", size, color: INK })],
          spacing: { before: b.level === 3 ? 200 : 360, after: 120 },
          keepNext: true,
        })
      );
    } else if (b.kind === "item") {
      body.push(
        new Paragraph({
          children: runs(b.runs),
          // A fresh instance per list, so each numbered list restarts at 1.
          numbering: { reference: b.ordered ? "jd-numbers" : "jd-bullets", level: 0, instance: b.list },
          spacing: { after: 80 },
        })
      );
    } else {
      body.push(new Paragraph({ children: runs(b.runs), spacing: { after: 160 } }));
    }
  }

  const doc = new Document({
    creator: "Exec10X",
    title: `${meta.title} — Job description`,
    styles: { default: { document: { run: { font: "Calibri", size: 21, color: MUTED } } } },
    numbering: {
      config: [
        {
          reference: "jd-bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
        },
        {
          reference: "jd-numbers",
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 300 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "EXEC10X", bold: true, color: ACCENT, size: 16, characterSpacing: 60 })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 6 } },
                children: [
                  new TextRun({ text: `${footerText(meta)} · Page `, color: MUTED, size: 15 }),
                  new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 15 }),
                  new TextRun({ text: " of ", color: MUTED, size: 15 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], color: MUTED, size: 15 }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/* ---------------- PDF ------------------------------------------------------ */

const hex = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);

export async function renderPdf(markdown: string, meta: ExportMeta): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${meta.title} — Job description`);
  pdf.setAuthor("Exec10X");
  pdf.setCreator("Exec10X");

  const fonts = {
    body: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    display: await pdf.embedFont(StandardFonts.TimesRoman),
  };
  // Standard fonts carry WinAnsi only. Anything outside it (Hebrew, ₪, emoji)
  // would throw mid-render — fold accents, replace the rest.
  const charset = new Set(fonts.body.getCharacterSet());
  const safe = (s: string) =>
    Array.from(s.normalize("NFC"))
      .map((c) => {
        if (charset.has(c.codePointAt(0)!)) return c;
        const folded = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (folded && Array.from(folded).every((f) => charset.has(f.codePointAt(0)!))) return folded;
        return c === "₪" ? "ILS" : "?";
      })
      .join("");

  const W = 595.28;
  const H = 841.89;
  const M = 64;
  const maxW = W - 2 * M;
  const bottom = M + 28; // room for the footer
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };
  const ensure = (h: number) => {
    if (y - h < bottom) newPage();
  };

  type Word = { text: string; font: PDFFont; color: ReturnType<typeof rgb> };
  const fontFor = (r: Run) => (r.bold ? fonts.bold : r.italic ? fonts.italic : fonts.body);
  // Width as drawText actually draws it. widthOfTextAtSize applies kerning
  // pairs, drawText does not, so "You"/"Take" measured narrower than drawn and
  // the next word landed on the space ("Youwill", "Takeownership").
  const drawnWidth = (font: PDFFont, s: string, size: number) =>
    Array.from(s).reduce((n, c) => n + font.widthOfTextAtSize(c, size), 0);

  /** Wraps styled runs into lines and draws them; returns nothing, moves y. */
  function drawRuns(rs: Run[], size: number, indent = 0, lead = 1.45, color = hex(MUTED)) {
    const words: Word[] = [];
    for (const r of rs) {
      for (const part of safe(r.text).split(/(\s+)/)) {
        if (part) words.push({ text: part, font: fontFor(r), color: r.bold ? hex(INK) : color });
      }
    }
    const lineH = size * lead;
    const width = maxW - indent;
    let line: Word[] = [];
    let lineW = 0;
    const emit = () => {
      while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop();
      if (!line.length) return;
      ensure(lineH);
      let x = M + indent;
      for (const w of line) {
        page.drawText(w.text, { x, y: y - size, size, font: w.font, color: w.color });
        x += drawnWidth(w.font, w.text, size);
      }
      y -= lineH;
      line = [];
      lineW = 0;
    };
    for (const w of words) {
      const ww = drawnWidth(w.font, w.text, size);
      if (/^\s+$/.test(w.text)) {
        if (line.length) {
          line.push({ ...w, text: " " });
          lineW += w.font.widthOfTextAtSize(" ", size);
        }
        continue;
      }
      if (lineW + ww > width && line.length) emit();
      line.push(w);
      lineW += ww;
    }
    emit();
  }

  /** Display font, wrapped by hand (headings are short). */
  function drawHeading(raw: string, size: number) {
    let line = "";
    const put = (t: string) => {
      ensure(size * 1.3);
      page.drawText(t, { x: M, y: y - size, size, font: fonts.display, color: hex(INK) });
      y -= size * 1.3;
    };
    for (const w of safe(raw).split(" ")) {
      const next = line ? `${line} ${w}` : w;
      if (fonts.display.widthOfTextAtSize(next, size) > maxW && line) {
        put(line);
        line = w;
      } else line = next;
    }
    if (line) put(line);
    y -= 4;
  }

  // Title block
  page.drawText("JOB DESCRIPTION", { x: M, y: y - 9, size: 9, font: fonts.bold, color: hex(ACCENT) });
  y -= 24;
  drawHeading(meta.title, 26);
  drawRuns([{ text: meta.company }], 11, 0, 1.4);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: M + 60, y }, thickness: 1.5, color: hex(ACCENT) });
  y -= 22;

  for (const b of dropLeadingTitle(parseBlocks(markdown), meta.title)) {
    if (b.kind === "rule") {
      ensure(14);
      page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 0.5, color: hex(LINE) });
      y -= 14;
    } else if (b.kind === "heading") {
      const size = b.level === 1 ? 20 : b.level === 2 ? 15 : 12;
      y -= b.level === 3 ? 6 : 12;
      ensure(size * 1.3 + 30); // keep a heading with its first lines
      drawHeading(b.runs[0].text, size);
    } else if (b.kind === "item") {
      ensure(10.5 * 1.45);
      if (b.ordered) {
        page.drawText(`${b.n}.`, { x: M + 2, y: y - 10.5, size: 10.5, font: fonts.body, color: hex(ACCENT) });
      } else {
        page.drawLine({ start: { x: M + 2, y: y - 7 }, end: { x: M + 9, y: y - 7 }, thickness: 1, color: hex(ACCENT) });
      }
      drawRuns(b.runs, 10.5, 18);
      y -= 3;
    } else {
      drawRuns(b.runs, 10.5);
      y -= 7;
    }
  }

  // Header mark + footer on every page, now that the page count is known.
  const pages = pdf.getPages();
  const foot = safe(footerText(meta));
  pages.forEach((p, i) => {
    p.drawText("EXEC10X", { x: W - M - fonts.bold.widthOfTextAtSize("EXEC10X", 8), y: H - 36, size: 8, font: fonts.bold, color: hex(ACCENT) });
    p.drawLine({ start: { x: M, y: M }, end: { x: W - M, y: M }, thickness: 0.5, color: hex(LINE) });
    const label = `${foot} · Page ${i + 1} of ${pages.length}`;
    let size = 7.5;
    while (fonts.body.widthOfTextAtSize(label, size) > maxW && size > 5) size -= 0.25;
    p.drawText(label, { x: M, y: M - 14, size, font: fonts.body, color: hex(MUTED) });
  });

  return Buffer.from(await pdf.save());
}
