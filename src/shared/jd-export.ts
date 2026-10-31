import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  Tab,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
} from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

/**
 * Branded Word + PDF export of a job description (PRD v4 §13, customer
 * journey "Outputs"): locked role title and company on the document, Role ID
 * in the footer of every page, for every version from the first draft.
 *
 * The look follows Susan's reference briefing (products/interview-intelligence/
 * examples/COREX_Head_of_Georgia_Briefing.docx, 2026-10-31): Susan Pike &
 * Partners logo top left and the client's name top right over a grey rule,
 * Georgia navy headings with a gold underline, Calibri body, gold dash
 * bullets, a "role at a glance" table for the header fields, and quiet
 * company · role · page footer.
 *
 * Both libraries are pure JavaScript on purpose. pdf-parse's native canvas
 * dependency is what broke PDF upload on Vercel ("DOMMatrix is not defined");
 * nothing here may need a native module. The logo PNG is the one file read
 * from disk, and it is in outputFileTracingIncludes (next.config.mjs).
 *
 * Input is the same Markdown subset MarkdownLite renders: #/##/### headings,
 * bullets, numbered lists, **bold**, *italic*, > quotes, horizontal rules,
 * paragraphs.
 */

export type ExportMeta = {
  title: string; // locked role title
  company: string;
  roleId: string;
  version: number;
  status: "draft" | "approved";
  /** Only ever a logo supplied for THIS client; none is looked up. Absent → the client's name. */
  clientLogo?: ClientLogo | null;
};

export type ClientLogo = { data: Buffer; type: "png" | "jpg"; width: number; height: number };

/** Scales a logo into a box, keeping its proportions. */
function fit(l: { width: number; height: number }, maxW: number, maxH: number) {
  const k = Math.min(maxW / l.width, maxH / l.height);
  return { width: Math.round(l.width * k), height: Math.round(l.height * k) };
}

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
  return `${meta.company}  ·  ${meta.title}  ·  Confidential  ·  Role ID ${meta.roleId}  ·  v${meta.version} ${state}`;
}

function kicker(meta: ExportMeta): string {
  return meta.status === "approved" ? "JOB DESCRIPTION · CONFIDENTIAL" : "JOB DESCRIPTION · DRAFT";
}

const LOGO_PATH = path.join(process.cwd(), "src/shared/assets/spp-logo.png");
let logoCache: Buffer | null | undefined;
/** Susan Pike & Partners logo (600×303). Missing file → text fallback, never a failed download. */
function logo(): Buffer | null {
  if (logoCache === undefined) {
    try {
      logoCache = fs.readFileSync(LOGO_PATH);
    } catch {
      logoCache = null;
    }
  }
  return logoCache;
}
const LOGO_RATIO = 303 / 600;

/* ---------------- Markdown → blocks ---------------------------------------- */

type Run = { text: string; bold?: boolean; italic?: boolean };
type Block =
  | { kind: "heading"; level: 1 | 2 | 3; runs: Run[] }
  | { kind: "para"; runs: Run[] }
  // "> **Title**" on its own first line → a panel with that title. Before the
  // first section it is the opening hook. Otherwise a gold-bar callout.
  | { kind: "quote"; title: string | null; hero: boolean; runs: Run[] }
  | { kind: "fields"; rows: { label: string; value: string }[] }
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
  let quote: string[] = [];
  let n = 0;
  let list = 0;
  let listOrdered: boolean | null = null;
  // "**Company:** …" lines before the first section are the role's header
  // fields; they become the at-a-glance table, as in the reference briefing.
  let inHeader = true;
  let inBody = false; // after the first section heading
  const flush = () => {
    if (para.length) blocks.push({ kind: "para", runs: inlineRuns(para.join(" ")) });
    if (quote.length) {
      const t = /^\*\*([^*]+)\*\*$/.exec(quote[0]);
      blocks.push({
        kind: "quote",
        title: t && quote.length > 1 ? t[1].trim() : null,
        hero: !inBody,
        runs: inlineRuns((t && quote.length > 1 ? quote.slice(1) : quote).join(" ")),
      });
    }
    para = [];
    quote = [];
  };
  const endList = () => {
    n = 0;
    listOrdered = null;
  };
  const field = (label: string, value: string) => {
    const last = blocks[blocks.length - 1];
    if (last?.kind === "fields") last.rows.push({ label, value });
    else blocks.push({ kind: "fields", rows: [{ label, value }] });
  };
  for (const raw of markdown.replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "").split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const q = /^\s*>\s?(.*)$/.exec(line);
    const f = inHeader ? /^\*\*([^*]+?):\*\*\s*(.*)$/.exec(line.trim()) : null;
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
      if (h[1].length > 1) {
        inHeader = false;
        inBody = true;
      }
      // "# **Title**" — headings are styled anyway, the bold markers are noise.
      blocks.push({ kind: "heading", level: h[1].length as 1 | 2 | 3, runs: [{ text: h[2].replace(/\*\*/g, "") }] });
    } else if (f) {
      flush();
      endList();
      field(f[1].trim(), f[2].replace(/\*\*/g, "").trim());
    } else if (q) {
      if (para.length) flush();
      endList();
      if (q[1].trim()) quote.push(q[1].trim());
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
      if (quote.length) flush();
      endList();
      inHeader = false;
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

/**
 * The client the document is for: its own "**Company:** …" field, else the
 * account's name. A search firm's account (SusanDana) writes JDs for its
 * clients (COREX), so the account name alone can be the wrong company.
 */
export function clientName(markdown: string, fallback: string): string {
  for (const b of parseBlocks(markdown)) {
    if (b.kind !== "fields") continue;
    const row = b.rows.find((r) => /^company( name)?$/i.test(r.label));
    const name = row?.value.replace(/\[[^\]]*\]/g, "").trim();
    if (name) return name.slice(0, 120);
  }
  return fallback;
}

/** "## 1. The Opportunity" → "The Opportunity": the briefing look has no section numbers. */
const headingText = (b: { runs: Run[] }) => b.runs[0].text.replace(/^\d+[.)]\s+/, "");

/* ---------------- Word ----------------------------------------------------- */

// Reference briefing palette.
const NAVY = "0D1B3B";
const BODY = "3D3D3D";
const GREY = "6B6B6B";
const GOLD = "BA9A5A";
const RULE = "D4D4D4";
const CONTENT_W = 9638; // A4 less 1134 twip margins

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

export async function renderDocx(markdown: string, meta: ExportMeta): Promise<Buffer> {
  meta = { ...meta, company: clientName(markdown, meta.company) };
  const runs = (rs: Run[], color = BODY, size = 22, boldColor = color) =>
    rs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, color: r.bold ? boldColor : color, size }));

  const body: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: kicker(meta), color: GREY, size: 18, bold: true })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: meta.title, font: "Georgia", size: 60, color: NAVY })],
      spacing: { after: 60 },
    }),
    new Paragraph({ spacing: { after: 280 } }),
  ];

  const glance = (rows: { label: string; value: string }[]) =>
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [2600, CONTENT_W - 2600],
      borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
      rows: rows.map(
        (r) =>
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                width: { size: 2600, type: WidthType.DXA },
                borders: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE }, left: NONE, right: NONE },
                margins: { top: 120, bottom: 120, left: 0, right: 160 },
                children: [new Paragraph({ children: [new TextRun({ text: r.label.toUpperCase(), bold: true, color: GREY, size: 18 })] })],
              }),
              new TableCell({
                width: { size: CONTENT_W - 2600, type: WidthType.DXA },
                borders: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE }, left: NONE, right: NONE },
                margins: { top: 110, bottom: 110, left: 200, right: 160 },
                children: [new Paragraph({ children: runs(inlineRuns(r.value), NAVY, 21) })],
              }),
            ],
          })
      ),
    });

  const ruled = { style: BorderStyle.SINGLE, size: 4, color: RULE };
  const panel = (children: Paragraph[], topRule = true) =>
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: CONTENT_W, type: WidthType.DXA },
              borders: { top: topRule ? ruled : NONE, bottom: ruled, left: NONE, right: NONE },
              margins: { top: 240, bottom: 240, left: 0, right: 0 },
              children,
            }),
          ],
        }),
      ],
    });

  let prev: Block["kind"] | null = null;
  for (const b of dropLeadingTitle(parseBlocks(markdown), meta.title)) {
    const last: Block["kind"] | null = prev;
    prev = b.kind;
    if (b.kind === "rule") {
      // Sections already carry the gold rule; a second line adds nothing.
      prev = last;
      continue;
    } else if (b.kind === "fields") {
      body.push(glance(b.rows), new Paragraph({ spacing: { after: 80 } }));
    } else if (b.kind === "heading") {
      if (b.level === 3) {
        body.push(
          new Paragraph({
            children: [new TextRun({ text: headingText(b), font: "Georgia", size: 24, color: NAVY })],
            spacing: { before: 280, after: 100 },
            keepNext: true,
          })
        );
      } else {
        body.push(
          new Paragraph({
            children: [new TextRun({ text: headingText(b), font: "Georgia", size: 32, color: NAVY })],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 8 } },
            spacing: { before: 360, after: 140 },
            keepNext: true,
          })
        );
      }
    } else if (b.kind === "item") {
      body.push(
        new Paragraph({
          children: runs(b.runs),
          // A fresh instance per list, so each numbered list restarts at 1.
          numbering: { reference: b.ordered ? "jd-numbers" : "jd-bullets", level: 0, instance: b.list },
          spacing: { after: 80, line: 300 },
        })
      );
    } else if (b.kind === "quote" && (b.hero || b.title)) {
      // Ruled panel, as the briefing's opening hook and "How you lead" box.
      const inner: Paragraph[] = [];
      if (b.title) {
        inner.push(
          new Paragraph({
            children: b.hero
              ? [new TextRun({ text: b.title, font: "Georgia", size: 56, color: GOLD })]
              : [new TextRun({ text: b.title, font: "Georgia", size: 26, color: NAVY })],
            spacing: { after: b.hero ? 60 : 80 },
          })
        );
      }
      inner.push(
        new Paragraph({
          children: b.hero
            ? b.runs.map((r) => new TextRun({ text: r.text, font: "Georgia", italics: true, bold: r.bold, color: BODY, size: 26 }))
            : runs(b.runs, BODY, 22, NAVY),
          spacing: { line: b.hero ? 320 : 300 },
        })
      );
      // Straight after the glance table, the table's last rule closes the panel's top.
      if (last === "fields") body.pop();
      body.push(panel(inner, last !== "fields"), new Paragraph({ spacing: { after: 80 } }));
    } else if (b.kind === "quote") {
      body.push(
        new Paragraph({
          children: runs(b.runs, BODY, 22, NAVY),
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 10 } },
          indent: { left: 200 },
          spacing: { before: 120, after: 160, line: 300 },
        })
      );
    } else {
      body.push(new Paragraph({ children: runs(b.runs, BODY, 22, NAVY), spacing: { after: 140, line: 300 } }));
    }
  }

  const png = logo();
  const headerLeft = png
    ? new ImageRun({ type: "png", data: png, transformation: { width: 104, height: Math.round(104 * LOGO_RATIO) }, altText: { name: "Susan Pike & Partners", description: "Susan Pike & Partners logo", title: "Susan Pike & Partners" } })
    : new TextRun({ text: "SUSAN PIKE & PARTNERS", bold: true, color: NAVY, size: 18 });

  // Client logo fits a 147×40 px box (COREX in the briefing is 110×31).
  const cl = meta.clientLogo;
  const headerRight = cl
    ? new ImageRun({ type: cl.type, data: cl.data, transformation: fit(cl, 147, 40), altText: { name: meta.company, description: `${meta.company} logo`, title: meta.company } })
    : new TextRun({ text: meta.company, font: "Georgia", size: 24, color: NAVY });

  const doc = new Document({
    creator: "Susan Pike & Partners",
    title: `${meta.title} — Job description`,
    styles: { default: { document: { run: { font: "Calibri", size: 22, color: BODY } } } },
    numbering: {
      config: [
        {
          reference: "jd-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "–",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 440, hanging: 300 } }, run: { bold: true, color: GOLD } },
            },
          ],
        },
        {
          reference: "jd-numbers",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 440, hanging: 360 } }, run: { font: "Georgia", bold: true, color: GOLD } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1700, bottom: 1200, left: 1134, right: 1134, header: 560, footer: 560 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 8 } },
                spacing: { after: 160 },
                children: [headerLeft, new TextRun({ children: [new Tab()] }), headerRight],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
                children: [
                  new TextRun({ text: footerText(meta), color: GREY, size: 16 }),
                  new TextRun({ children: [new Tab()] }),
                  new TextRun({ children: [PageNumber.CURRENT], color: GREY, size: 16 }),
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
  meta = { ...meta, company: clientName(markdown, meta.company) };
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${meta.title} — Job description`);
  pdf.setAuthor("Susan Pike & Partners");
  pdf.setCreator("Exec10X");

  // Helvetica stands in for Calibri, Times for Georgia (standard fonts only).
  const fonts = {
    body: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    display: await pdf.embedFont(StandardFonts.TimesRoman),
    displayItalic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
  };
  const png = logo();
  const logoImg: PDFImage | null = png ? await pdf.embedPng(png) : null;
  const cl = meta.clientLogo;
  let clientImg: PDFImage | null = null;
  try {
    if (cl) clientImg = cl.type === "png" ? await pdf.embedPng(cl.data) : await pdf.embedJpg(cl.data);
  } catch {
    clientImg = null; // an unusual PNG/JPEG variant → the company name instead
  }

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

  // A4 with the reference briefing's margins (1134 / 1700 / 1200 twips).
  const W = 595.28;
  const H = 841.89;
  const M = 56.7;
  const TOP = 85;
  const BOTTOM = 60;
  const maxW = W - 2 * M;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - TOP;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - TOP;
  };
  const ensure = (h: number) => {
    if (y - h < BOTTOM) newPage();
  };

  type Word = { text: string; font: PDFFont; color: ReturnType<typeof rgb> };
  const fontFor = (r: Run) => (r.bold ? fonts.bold : r.italic ? fonts.italic : fonts.body);
  // Width as drawText actually draws it. widthOfTextAtSize applies kerning
  // pairs, drawText does not, so "You"/"Take" measured narrower than drawn and
  // the next word landed on the space ("Youwill", "Takeownership").
  const drawnWidth = (font: PDFFont, s: string, size: number) =>
    Array.from(s).reduce((n, c) => n + font.widthOfTextAtSize(c, size), 0);

  /** Wraps styled runs into lines and draws them; moves y. Returns the lines drawn. */
  function drawRuns(rs: Run[], size: number, opts: { indent?: number; width?: number; lead?: number; color?: string; bold?: string; font?: PDFFont } = {}) {
    const { indent = 0, lead = 1.45, color = BODY } = opts;
    const words: Word[] = [];
    for (const r of rs) {
      for (const part of safe(r.text).split(/(\s+)/)) {
        if (part) words.push({ text: part, font: opts.font ?? fontFor(r), color: hex(r.bold ? opts.bold ?? color : color) });
      }
    }
    const lineH = size * lead;
    const width = opts.width ?? maxW - indent;
    let line: Word[] = [];
    let lineW = 0;
    let count = 0;
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
      count++;
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
    return count;
  }

  /** Display font, wrapped by hand (headings are short). */
  function drawHeading(raw: string, size: number) {
    let line = "";
    const put = (t: string) => {
      ensure(size * 1.3);
      page.drawText(t, { x: M, y: y - size, size, font: fonts.display, color: hex(NAVY) });
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
  }

  function drawGlance(rows: { label: string; value: string }[]) {
    const labelW = 130;
    for (const r of rows) {
      ensure(30);
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: hex(RULE) });
      const top = y;
      y -= 6;
      page.drawText(safe(r.label.toUpperCase()), { x: M, y: y - 10.5 + 1, size: 8.5, font: fonts.bold, color: hex(GREY) });
      drawRuns(inlineRuns(r.value), 10.5, { indent: labelW + 10, lead: 1.35, color: NAVY });
      y -= 5;
      if (top - y < 22) y = top - 22;
    }
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: hex(RULE) });
    y -= 14;
  }

  // Title block
  page.drawText(kicker(meta), { x: M, y: y - 9, size: 9, font: fonts.bold, color: hex(GREY) });
  y -= 20;
  drawHeading(meta.title, 30);
  y -= 16;

  let prev: Block["kind"] | null = null;
  for (const b of dropLeadingTitle(parseBlocks(markdown), meta.title)) {
    if (b.kind === "rule") continue;
    const last: Block["kind"] | null = prev;
    prev = b.kind;
    if (b.kind === "fields") {
      drawGlance(b.rows);
    } else if (b.kind === "heading") {
      if (b.level === 3) {
        y -= 12;
        ensure(12 * 1.3 + 30);
        drawHeading(headingText(b), 12);
        y -= 2;
      } else {
        y -= 16;
        ensure(16 * 1.3 + 40); // keep a heading with its first lines
        drawHeading(headingText(b), 16);
        page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.75, color: hex(GOLD) });
        y -= 9;
      }
    } else if (b.kind === "item") {
      ensure(11 * 1.45);
      if (b.ordered) {
        page.drawText(`${b.n}.`, { x: M + 4, y: y - 11, size: 11, font: fonts.display, color: hex(GOLD) });
      } else {
        page.drawText("–", { x: M + 7, y: y - 11, size: 11, font: fonts.bold, color: hex(GOLD) });
      }
      drawRuns(b.runs, 11, { indent: 22 });
      y -= 3;
    } else if (b.kind === "quote" && (b.hero || b.title)) {
      // Ruled panel: opening hook (gold display line + italic standfirst) or a titled box.
      if (last === "fields") {
        y += 14; // share the table's closing rule
      } else {
        y -= 6;
        ensure(80);
        page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: hex(RULE) });
      }
      y -= 14;
      if (b.title) {
        if (b.hero) {
          const t = safe(b.title);
          page.drawText(t, { x: M, y: y - 26, size: 28, font: fonts.display, color: hex(GOLD) });
          y -= 26 * 1.35;
        } else {
          drawHeading(b.title, 13);
          y -= 2;
        }
      }
      if (b.hero) {
        drawRuns(b.runs.map((r) => ({ ...r, italic: true })), 13, { lead: 1.4, font: fonts.displayItalic });
      } else {
        drawRuns(b.runs, 11, { bold: NAVY });
      }
      y -= 10;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: hex(RULE) });
      y -= 16;
    } else if (b.kind === "quote") {
      y -= 6;
      ensure(11 * 1.45);
      const top = y;
      const startPage = page;
      drawRuns(b.runs, 11, { indent: 14, bold: NAVY });
      // The gold bar spans the quote on the page it starts on.
      startPage.drawLine({ start: { x: M + 2, y: top }, end: { x: M + 2, y: startPage === page ? y + 3 : BOTTOM }, thickness: 1.5, color: hex(GOLD) });
      y -= 8;
    } else {
      drawRuns(b.runs, 11, { bold: NAVY });
      y -= 7;
    }
  }

  // Header + footer on every page.
  const pages = pdf.getPages();
  const foot = safe(footerText(meta));
  const company = safe(meta.company);
  const logoW = 78;
  const logoH = logoW * LOGO_RATIO;
  pages.forEach((p, i) => {
    const top = H - 28;
    if (logoImg) p.drawImage(logoImg, { x: M, y: top - logoH, width: logoW, height: logoH });
    else p.drawText("SUSAN PIKE & PARTNERS", { x: M, y: top - 12, size: 9, font: fonts.bold, color: hex(NAVY) });
    if (clientImg && cl) {
      const sz = fit(cl, 110, 30);
      p.drawImage(clientImg, { x: W - M - sz.width, y: top - logoH, width: sz.width, height: sz.height });
    } else {
      const cSize = 12;
      p.drawText(company, { x: W - M - fonts.display.widthOfTextAtSize(company, cSize), y: top - logoH + 2, size: cSize, font: fonts.display, color: hex(NAVY) });
    }
    p.drawLine({ start: { x: M, y: top - logoH - 8 }, end: { x: W - M, y: top - logoH - 8 }, thickness: 0.5, color: hex(RULE) });

    const num = String(i + 1);
    let size = 8;
    while (fonts.body.widthOfTextAtSize(foot, size) > maxW - 30 && size > 5) size -= 0.25;
    p.drawText(foot, { x: M, y: 28, size, font: fonts.body, color: hex(GREY) });
    p.drawText(num, { x: W - M - fonts.body.widthOfTextAtSize(num, 8), y: 28, size: 8, font: fonts.body, color: hex(GREY) });
  });

  return Buffer.from(await pdf.save());
}
