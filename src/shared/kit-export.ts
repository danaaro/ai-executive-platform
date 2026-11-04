import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
} from "docx";
import { fit, footerText, HTML_STYLE, htmlDocument, kicker, logo, LOGO_RATIO, type ExportMeta } from "@/shared/jd-export";
import type { InterviewGuide, Question, RecruiterScreen, RoleLevel, RubricLevel } from "@/shared/interview-kit-types";

/**
 * Word + PDF of an interview kit version (PRD §4, K5: same look as the job
 * description export). Layout follows Susan's scripts/render_pack.py: Part 1
 * How we assess, Part 2 Recruiter Screen with the running order and a rubric
 * table per area, Part 3 Interviews with the at-a-glance table, then each
 * attribute's areas. Word gets real tables; the PDF is drawn by the JD's PDF
 * renderer from the Markdown below, rubric levels as labelled lines.
 */

export type KitDoc = {
  company: string;
  howWeAssess: string;
  screen: RecruiterScreen | null;
  interviews: InterviewGuide | null;
  roleLevel: RoleLevel;
};

const INTERVIEWS_INTRO =
  "Each interviewer takes two attributes, so every attribute gets two views. For each area, choose the questions you like before the first candidate and ask the same ones to everyone. Rate each area against its rubric, then give one rating per attribute. Strong evidence is specific, personal, measured, recent, repeated and confirmable by a named person.";
const lfNote = (level: RoleLevel) =>
  `Competencies and rubrics from the SP&P Executive Leadership & Future Readiness framework, calibrated to ${level}. If the evidence is not enough to rate, record N/A and name what is missing.`;

const areaTags = (x: { must_have: boolean; selection?: string }) =>
  [x.must_have ? "Must-have" : "", x.selection ? x.selection[0].toUpperCase() + x.selection.slice(1) : ""].filter(Boolean).join(" · ");

/* ---------------- Markdown (PDF + plain text) ------------------------------ */

function howMarkdown(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n").map((l) => l.trim())) {
    if (!line || line === "HOW WE ASSESS") continue;
    const attr = /^(\d)\.\s+([^·]+?)\s+·\s+(.*)$/.exec(line);
    if (attr) out.push("", `**${attr[1]}. ${attr[2].trim()}** · ${attr[3]}`);
    else if (line === line.toUpperCase() && /[A-Z]/.test(line) && line.length < 60) out.push("", `### ${line[0]}${line.slice(1).toLowerCase()}`, "");
    else if (line.startsWith("• ")) out.push(`- ${line.slice(2)}`);
    else out.push(line);
  }
  return out;
}

const mdQuestions = (qs: Question[]) => qs.flatMap((q, i) => [`${i + 1}. ${q.q}`, ...q.probes.map((p) => `- ${p}`), ""]);
const mdRubric = (r: RubricLevel[]) => r.map((x) => `- **${x.level}:** ${x.text}`);

export function kitMarkdown(k: KitDoc): string {
  const o: string[] = [`**Company:** ${k.company}`, "", "## How we assess", ...howMarkdown(k.howWeAssess), ""];
  if (k.screen) {
    const s = k.screen;
    o.push("## Recruiter screen", "", s.intro, "", "### Running order · 60 minutes", "");
    for (const r of s.running_order) o.push(`- **${r.minutes} min:** ${r.what}`);
    for (const a of s.areas) {
      o.push("", `### ${a.name}`, "", `*${a.checks}*`, "", "**Questions · choose 1 or 2**", "", ...mdQuestions(a.questions), "**Rubric**", "", ...mdRubric(a.rubric));
    }
    o.push("", `**Do not ask.** ${s.do_not_ask}`, "");
  }
  if (k.interviews) {
    o.push("## Interviews", "", INTERVIEWS_INTRO, "", "### At a glance", "");
    for (const at of k.interviews.attributes) {
      o.push(`- **${at.name}:** ${at.areas.map((x) => `${x.id} ${x.name}${x.must_have ? " (must-have)" : ""}`).join("; ")}`);
    }
    for (const at of k.interviews.attributes) {
      o.push("", `## ${at.name}`, "", `*${at.question}*`, "");
      if (at.key === "LF") o.push(lfNote(k.roleLevel), "");
      for (const x of at.areas) {
        const tags = areaTags(x);
        o.push(`### ${x.id} · ${x.name}${tags ? ` · ${tags}` : ""}`, "", x.what, "");
        if (x.why) o.push(`**Why for this role:** ${x.why}`, "");
        if (x.evidence) o.push(`**Evidence to look for:** ${x.evidence}`, "");
        o.push("**Questions and probes**", "", ...mdQuestions(x.questions), "**Rubric**", "", ...mdRubric(x.rubric), "");
      }
    }
  }
  return o.join("\n");
}

/* ---------------- Word ------------------------------------------------------ */

const NAVY = "0D1B3B";
const BODY = "3D3D3D";
const GREY = "6B6B6B";
const GOLD = "BA9A5A";
const GOLD_SOFT = "F3EBDA";
const RULE = "D4D4D4";
const CONTENT_W = 9638;
const LINE = { style: BorderStyle.SINGLE, size: 4, color: RULE };

const p = (text: string, o: { bold?: boolean; italic?: boolean; color?: string; size?: number; font?: string; before?: number; after?: number; indent?: number; keepNext?: boolean } = {}) =>
  new Paragraph({
    children: [new TextRun({ text, font: o.font ?? "Calibri", bold: o.bold, italics: o.italic, color: o.color ?? BODY, size: o.size ?? 21 })],
    spacing: { lineRule: LineRuleType.AUTO, before: o.before ?? 0, after: o.after ?? 100, line: 290 },
    indent: o.indent ? { left: o.indent } : undefined,
    keepNext: o.keepNext,
  });

const partHeading = (text: string) =>
  new Paragraph({
    children: [new TextRun({ text, font: "Georgia", size: 34, color: NAVY })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 8 } },
    spacing: { lineRule: LineRuleType.AUTO, before: 420, after: 160 },
    keepNext: true,
    pageBreakBefore: true,
  });
const h2 = (text: string, sub?: string) => [
  new Paragraph({
    children: [new TextRun({ text, font: "Georgia", size: 28, color: NAVY })],
    spacing: { lineRule: LineRuleType.AUTO, before: 360, after: sub ? 40 : 120 },
    keepNext: true,
  }),
  ...(sub ? [p(sub, { italic: true, color: GREY, keepNext: true, after: 120 })] : []),
];
const h3 = (text: string) => p(text, { font: "Georgia", size: 24, color: NAVY, before: 260, after: 80, keepNext: true });
const label = (text: string) => p(text.toUpperCase(), { bold: true, size: 16, color: GOLD, before: 100, after: 60, keepNext: true });

function table(header: string[], rows: string[][], widths?: number[]): Table {
  const cols = header.length;
  const w = widths ?? Array.from({ length: cols }, () => Math.floor(CONTENT_W / cols));
  const cell = (text: string, i: number, head: boolean) =>
    new TableCell({
      width: { size: w[i], type: WidthType.DXA },
      shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: GOLD_SOFT } : undefined,
      borders: { top: LINE, bottom: LINE, left: LINE, right: LINE },
      margins: { top: 80, bottom: 80, left: 110, right: 110 },
      children: text.split("\n").map((t) => p(t, { bold: head, size: head ? 17 : 18, color: head ? NAVY : BODY, after: 40 })),
    });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: w,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, i, false)) })),
    ],
  });
}
const rubricTable = (r: RubricLevel[]) => table(r.map((x) => x.level), [r.map((x) => x.text)]);
const questionParas = (qs: Question[]) =>
  qs.flatMap((q, i) => [
    p(`${i + 1}. ${q.q}`, { indent: 220, after: 40, color: NAVY }),
    ...q.probes.map((pr) => p(`– ${pr}`, { indent: 640, after: 40, color: GREY, size: 20 })),
  ]);
const spacer = () => new Paragraph({ spacing: { lineRule: LineRuleType.AUTO, after: 120 } });

export async function renderKitDocx(k: KitDoc, meta: ExportMeta): Promise<Buffer> {
  const body: (Paragraph | Table)[] = [
    p(kicker(meta), { bold: true, size: 18, color: GREY, after: 80 }),
    new Paragraph({ children: [new TextRun({ text: meta.title, font: "Georgia", size: 60, color: NAVY })], spacing: { lineRule: LineRuleType.AUTO, after: 60 } }),
    p(`Interview kit · ${k.company}`, { font: "Georgia", size: 26, color: GOLD, after: 280 }),
  ];

  // Part 1
  body.push(new Paragraph({ children: [new TextRun({ text: "How we assess", font: "Georgia", size: 34, color: NAVY })], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 8 } }, spacing: { lineRule: LineRuleType.AUTO, before: 200, after: 160 }, keepNext: true }));
  for (const line of k.howWeAssess.split("\n").map((l) => l.trim())) {
    if (!line || line === "HOW WE ASSESS") continue;
    const head = line === line.toUpperCase() && /[A-Z]/.test(line) && line.length < 60;
    const attr = /^\d\.\s+[A-Z]{4,}/.test(line);
    if (head) body.push(h3(line[0] + line.slice(1).toLowerCase()));
    else body.push(p(line, { bold: attr, color: attr ? NAVY : BODY, before: attr ? 140 : 0, keepNext: attr }));
  }

  // Part 2
  if (k.screen) {
    const s = k.screen;
    body.push(partHeading("Recruiter screen"), p(s.intro), ...h2("Running order · 60 minutes"));
    body.push(table(["Minutes", "What happens"], s.running_order.map((r) => [r.minutes, r.what]), [1500, CONTENT_W - 1500]), spacer());
    for (const a of s.areas) {
      body.push(...h2(a.name, a.checks), label("Questions · choose 1 or 2"), ...questionParas(a.questions), label("Rubric"), rubricTable(a.rubric), spacer());
    }
    body.push(p(`Do not ask. ${s.do_not_ask}`, { bold: false, color: NAVY, before: 200 }));
  }

  // Part 3
  if (k.interviews) {
    const atts = k.interviews.attributes;
    body.push(partHeading("Interviews"), p(INTERVIEWS_INTRO), ...h2("At a glance"));
    body.push(
      table(
        ["Attribute", "Areas"],
        atts.map((at) => [`${at.name}\n${at.question}`, at.areas.map((x) => `${x.id} ${x.name}${x.must_have ? " (must-have)" : ""}`).join("\n")]),
        [3200, CONTENT_W - 3200]
      ),
      spacer()
    );
    for (const at of atts) {
      body.push(
        new Paragraph({ children: [new TextRun({ text: at.name, font: "Georgia", size: 32, color: NAVY })], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 8 } }, spacing: { lineRule: LineRuleType.AUTO, before: 420, after: 60 }, keepNext: true }),
        p(at.question, { italic: true, color: GREY, keepNext: true })
      );
      if (at.key === "LF") body.push(p(lfNote(k.roleLevel), { color: GREY, size: 19 }));
      for (const x of at.areas) {
        const tags = areaTags(x);
        body.push(...h2(`${x.id} · ${x.name}`, tags || undefined), p(x.what));
        if (x.why) body.push(p(`Why for this role: ${x.why}`, { color: GREY }));
        if (x.evidence) body.push(p(`Evidence to look for: ${x.evidence}`, { color: GREY }));
        body.push(label("Questions and probes"), ...questionParas(x.questions), label("Rubric"), rubricTable(x.rubric), spacer());
      }
    }
  }

  const png = logo();
  const headerLeft = png
    ? new ImageRun({ type: "png", data: png, transformation: { width: 104, height: Math.round(104 * LOGO_RATIO) }, altText: { name: "Susan Pike & Partners", description: "Susan Pike & Partners logo", title: "Susan Pike & Partners" } })
    : new TextRun({ font: "Calibri", text: "SUSAN PIKE & PARTNERS", bold: true, color: NAVY, size: 18 });
  const cl = meta.clientLogo;
  const headerRight = cl
    ? new ImageRun({ type: cl.type, data: cl.data, transformation: fit(cl, 147, 40), altText: { name: meta.company, description: `${meta.company} logo`, title: meta.company } })
    : new TextRun({ text: meta.company, font: "Georgia", size: 24, color: NAVY });

  const doc = new Document({
    creator: "Susan Pike & Partners",
    title: `${meta.title} — Interview kit`,
    styles: { default: { document: { run: { font: "Calibri", size: 21, color: BODY } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1700, bottom: 1200, left: 1134, right: 1134, header: 560, footer: 560 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 8 } },
                spacing: { lineRule: LineRuleType.AUTO, after: 160 },
                children: [headerLeft, new TextRun({ children: [new Tab()] }), headerRight],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
                children: [
                  new TextRun({ font: "Calibri", text: footerText(meta), color: GREY, size: 16 }),
                  new TextRun({ children: [new Tab()] }),
                  new TextRun({ font: "Calibri", children: [PageNumber.CURRENT], color: GREY, size: 16 }),
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

/* ---------------- HTML (download, Google Docs) and plain text -------------- */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const S = HTML_STYLE;
const hLabel = (t: string) => `<p style="font-size:8pt;font-weight:bold;color:#BA9A5A;letter-spacing:.08em;margin:12px 0 4px;">${esc(t.toUpperCase())}</p>`;
const hQuestions = (qs: Question[]) =>
  `<ol>${qs.map((q) => `<li style="margin-bottom:6px;color:#0D1B3B;">${esc(q.q)}<ul style="color:#6B6B6B;">${q.probes.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></li>`).join("")}</ol>`;
const hRubric = (r: RubricLevel[]) =>
  `<table style="${S.table}table-layout:fixed;"><tr>${r.map((x) => `<th style="${S.th}">${esc(x.level)}</th>`).join("")}</tr><tr>${r.map((x) => `<td style="${S.td}">${esc(x.text)}</td>`).join("")}</tr></table>`;

/** The whole kit as one HTML document with real tables (pastes cleanly into Google Docs). */
export function renderKitHtml(k: KitDoc, meta: ExportMeta): string {
  const o: string[] = [`<p style="font-family:Georgia,serif;font-size:13pt;color:#BA9A5A;margin:0 0 16px;">Interview kit · ${esc(k.company)}</p>`, `<h2 style="${S.h2}">How we assess</h2>`];
  for (const line of k.howWeAssess.split("\n").map((l) => l.trim())) {
    if (!line || line === "HOW WE ASSESS") continue;
    if (line === line.toUpperCase() && /[A-Z]/.test(line) && line.length < 60) o.push(`<h3 style="${S.h3}">${esc(line[0] + line.slice(1).toLowerCase())}</h3>`);
    else if (/^\d\.\s+[A-Z]{4,}/.test(line)) o.push(`<p style="margin:10px 0 2px;color:#0D1B3B;"><b>${esc(line)}</b></p>`);
    else o.push(`<p style="margin:2px 0;">${esc(line)}</p>`);
  }
  if (k.screen) {
    const s = k.screen;
    o.push(`<h2 style="${S.h2}">Recruiter screen</h2>`, `<p>${esc(s.intro)}</p>`, `<h3 style="${S.h3}">Running order · 60 minutes</h3>`);
    o.push(`<table style="${S.table}"><tr><th style="${S.th}width:90px;">Minutes</th><th style="${S.th}">What happens</th></tr>${s.running_order.map((r) => `<tr><td style="${S.td}">${esc(r.minutes)}</td><td style="${S.td}">${esc(r.what)}</td></tr>`).join("")}</table>`);
    for (const a of s.areas) o.push(`<h3 style="${S.h3}">${esc(a.name)}</h3>`, `<p style="color:#6B6B6B;"><i>${esc(a.checks)}</i></p>`, hLabel("Questions · choose 1 or 2"), hQuestions(a.questions), hLabel("Rubric"), hRubric(a.rubric));
    o.push(`<p><b>Do not ask.</b> ${esc(s.do_not_ask)}</p>`);
  }
  if (k.interviews) {
    const atts = k.interviews.attributes;
    o.push(`<h2 style="${S.h2}">Interviews</h2>`, `<p>${esc(INTERVIEWS_INTRO)}</p>`, `<h3 style="${S.h3}">At a glance</h3>`);
    o.push(`<table style="${S.table}"><tr><th style="${S.th}width:35%;">Attribute</th><th style="${S.th}">Areas</th></tr>${atts.map((at) => `<tr><td style="${S.td}"><b>${esc(at.name)}</b><br><i>${esc(at.question)}</i></td><td style="${S.td}">${at.areas.map((x) => `${esc(x.id)} ${esc(x.name)}${x.must_have ? " (must-have)" : ""}`).join("<br>")}</td></tr>`).join("")}</table>`);
    for (const at of atts) {
      o.push(`<h2 style="${S.h2}">${esc(at.name)}</h2>`, `<p style="color:#6B6B6B;"><i>${esc(at.question)}</i></p>`);
      if (at.key === "LF") o.push(`<p style="color:#6B6B6B;">${esc(lfNote(k.roleLevel))}</p>`);
      for (const x of at.areas) {
        const tags = areaTags(x);
        o.push(`<h3 style="${S.h3}">${esc(x.id)} · ${esc(x.name)}${tags ? ` <span style="font-size:9pt;color:#BA9A5A;">${esc(tags)}</span>` : ""}</h3>`, `<p>${esc(x.what)}</p>`);
        if (x.why) o.push(`<p style="color:#6B6B6B;"><b>Why for this role:</b> ${esc(x.why)}</p>`);
        if (x.evidence) o.push(`<p style="color:#6B6B6B;"><b>Evidence to look for:</b> ${esc(x.evidence)}</p>`);
        o.push(hLabel("Questions and probes"), hQuestions(x.questions), hLabel("Rubric"), hRubric(x.rubric));
      }
    }
  }
  return htmlDocument(meta, o.join("\n"));
}

/** Plain text in Susan's paste-anywhere format: UPPERCASE headings, "• " bullets, "– " sub-bullets. */
export function renderKitText(k: KitDoc, meta: ExportMeta): string {
  const o: string[] = [`${meta.title.toUpperCase()} · INTERVIEW KIT`, k.company, "", k.howWeAssess, ""];
  const qs = (list: Question[]) => list.flatMap((q, i) => [`${i + 1}. ${q.q}`, ...q.probes.map((p) => `   – ${p}`)]);
  const rub = (r: RubricLevel[]) => r.map((x) => `• ${x.level}: ${x.text}`);
  if (k.screen) {
    const s = k.screen;
    o.push("RECRUITER SCREEN", s.intro, "", "RUNNING ORDER · 60 MINUTES", ...s.running_order.map((r) => `• ${r.minutes} min: ${r.what}`), "");
    for (const a of s.areas) o.push(a.name.toUpperCase(), a.checks, "Questions · choose 1 or 2", ...qs(a.questions), "Rubric", ...rub(a.rubric), "");
    o.push(`Do not ask. ${s.do_not_ask}`, "");
  }
  if (k.interviews) {
    o.push("INTERVIEWS", INTERVIEWS_INTRO, "");
    for (const at of k.interviews.attributes) {
      o.push(`${at.name.toUpperCase()} · ${at.question}`, ...(at.key === "LF" ? [lfNote(k.roleLevel)] : []), "");
      for (const x of at.areas) {
        const tags = areaTags(x);
        o.push(`${x.id} · ${x.name}${tags ? ` (${tags})` : ""}`, x.what);
        if (x.why) o.push(`Why for this role: ${x.why}`);
        if (x.evidence) o.push(`Evidence to look for: ${x.evidence}`);
        o.push("Questions and probes", ...qs(x.questions), "Rubric", ...rub(x.rubric), "");
      }
    }
  }
  o.push(footerText(meta));
  return o.join("\n");
}
