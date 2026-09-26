/**
 * The Company Intelligence Report as STRUCTURED DATA (2026-09-26).
 *
 * The synthesizer delivers this shape as the arguments of a `save_report`
 * tool call (the schema is too large for enforced structured outputs), and
 * isReportShape() checks it before anything is saved. One object feeds both
 * the visual report page (charts need numbers, not prose) and the Markdown
 * download (`reportToMarkdown`) — they cannot disagree.
 *
 * Human-readable description of every section:
 * products/interview-intelligence/schemas/company-intel/company-report.md
 */

export const DIMENSIONS = [
  { id: "decision", label: "Decision-making", left: "Consensus", right: "Decisive / top-down" },
  { id: "pace", label: "Pace & ambiguity", left: "Structured", right: "Fast / ambiguous" },
  { id: "autonomy", label: "Autonomy", left: "Clear hierarchy", right: "Flat / self-directed" },
  { id: "communication", label: "Communication", left: "Diplomatic", right: "Direct / candid" },
  { id: "risk", label: "Risk appetite", left: "Risk-averse", right: "Experiment / fail fast" },
  { id: "collaboration", label: "Collaboration", left: "Individual ownership", right: "Cross-functional" },
] as const;

export type Confidence = "high" | "medium" | "low";
export type Coverage = "full" | "partial" | "thin" | "not researched";

export type ReportData = {
  headline: string;
  trajectory: {
    direction: "growing" | "stable" | "transforming" | "under pressure" | "unclear";
    explanation: string;
  };
  overallConfidence: Confidence;
  bottomLine: string[];
  keyFigures: { label: string; value: string; context: string; asOf: string | null }[];
  atAGlance: {
    whatTheyDo: string;
    ownership: string;
    sizeAndFootprint: string;
    financialDirection: string;
    leadership: string;
    currentMoment: string;
  };
  currentSituation: string | null;
  timeline: {
    date: string;
    title: string;
    category:
      | "leadership"
      | "M&A"
      | "restructuring"
      | "product"
      | "financial"
      | "legal"
      | "people"
      | "strategy"
      | "other";
    whyItMatters: string;
  }[];
  keyPersonas: {
    name: string;
    role: string;
    inRoleSince: string | null;
    background: string;
    focusAreas: string[];
    publicStance: string | null;
    whyTheyMatter: string;
    approach: string;
  }[];
  culture: {
    thrives: { behavior: string; evidence: string }[];
    struggles: string[];
    cultureAdd: string[];
    dimensions: {
      id: (typeof DIMENSIONS)[number]["id"];
      position: number;
      meaning: string;
      confidence: Confidence;
    }[];
    whatGetsRewarded: string;
  };
  employeeSentiment: {
    available: boolean;
    source: string | null;
    period: string | null;
    overallRating: number | null;
    categoryRatings: { label: string; score: number }[];
    ceoApprovalPct: number | null;
    recommendPct: number | null;
    trend: string | null;
    positiveThemes: string[];
    negativeThemes: string[];
  };
  sayVsDo: { says: string; does: string; implication: string }[];
  risks: { risk: string; detail: string; severity: "high" | "medium" | "low" }[];
  opportunities: { area: string; angle: string; detail: string }[];
  questions: string[];
  coverage: { area: string; level: Coverage }[];
  sourcesCount: number | null;
  confidenceNote: string;
};

/* -------------------------------------------------------------------------
 * JSON schema for the save_report tool. Every property is required (nullable
 * where absent is meaningful) and additionalProperties is false. Numeric ranges are stated in descriptions and
 * clamped on read (`normalizeReport`), not in the schema.
 * ---------------------------------------------------------------------- */

const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const nstr = (description?: string) => ({ type: ["string", "null"], ...(description ? { description } : {}) });
const nnum = (description: string) => ({ type: ["number", "null"], description });
const arr = (items: object, description?: string) => ({
  type: "array",
  items,
  ...(description ? { description } : {}),
});
const obj = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const conf = { type: "string", enum: ["high", "medium", "low"] };

export const REPORT_JSON_SCHEMA = obj({
  headline: str("One sentence capturing the company's current moment. The line an executive remembers."),
  trajectory: obj({
    direction: { type: "string", enum: ["growing", "stable", "transforming", "under pressure", "unclear"] },
    explanation: str("One sentence: why this direction."),
  }),
  overallConfidence: conf,
  bottomLine: arr(str(), "4–6 analyzed conclusions, one sentence each, most important first."),
  keyFigures: arr(
    obj({
      label: str("e.g. Employees, Revenue, Ownership, Glassdoor rating"),
      value: str("Short and compact: '~2,000', '>€500M', '90% PE', '2.8 / 5'"),
      context: str("A few words of context, e.g. 'before Yad2 sale'"),
      asOf: nstr("Date of the figure, e.g. 'Feb 2025'"),
    }),
    "3–5 headline numbers that matter most. Only published or sourced figures."
  ),
  atAGlance: obj({
    whatTheyDo: str(),
    ownership: str(),
    sizeAndFootprint: str(),
    financialDirection: str(),
    leadership: str(),
    currentMoment: str(),
  }),
  currentSituation: nstr(
    "4–6 sentence analytical paragraph on where the company stands and what drives it. Null in culture-only mode."
  ),
  timeline: arr(
    obj({
      date: str("YYYY-MM or YYYY-MM-DD"),
      title: str("Short event name"),
      category: {
        type: "string",
        enum: ["leadership", "M&A", "restructuring", "product", "financial", "legal", "people", "strategy", "other"],
      },
      whyItMatters: str("One sentence"),
    }),
    "3–6 events from the last 12 months that matter, newest first. Empty in culture-only mode."
  ),
  keyPersonas: arr(
    obj({
      name: str(),
      role: str(),
      inRoleSince: nstr("e.g. 'Mar 2025'"),
      background: str("1–2 sentences of career background from official bios or reputable press."),
      focusAreas: arr(str(), "2–4 short themes they publicly emphasize"),
      publicStance: nstr("A short public statement or position, paraphrased or briefly quoted, with where/when."),
      whyTheyMatter: str("Why this person matters for our work with the company."),
      approach: str(
        "How to open a professional conversation with them, grounded ONLY in their public priorities and role."
      ),
    }),
    "4–6 key decision-makers (CEO, relevant C-suite, business-unit or people leaders). PUBLIC PROFESSIONAL INFORMATION ONLY. Empty if module 04 was not researched."
  ),
  culture: obj({
    thrives: arr(obj({ behavior: str(), evidence: str("One short clause") }), "3–5 observable behaviors"),
    struggles: arr(str(), "2–3 behaviors"),
    cultureAdd: arr(str(), "1–3 gaps a different profile would fill"),
    dimensions: arr(
      obj({
        id: { type: "string", enum: DIMENSIONS.map((d) => d.id) },
        position: {
          type: "number",
          description:
            "1–5; halves allowed. 1 = LEFT pole, 5 = RIGHT pole: " +
            DIMENSIONS.map((d) => `${d.id}: 1 = ${d.left}, 5 = ${d.right}`).join("; ") +
            ". The number must agree with `meaning` (e.g. top-down decisions = 4–5 on decision).",
        },
        meaning: str("What this position means in practice, one sentence"),
        confidence: conf,
      }),
      "Exactly the 6 dimensions, in order: decision, pace, autonomy, communication, risk, collaboration"
    ),
    whatGetsRewarded: str("1–2 sentences"),
  }),
  employeeSentiment: obj({
    available: { type: "boolean", description: "False if no employee-review data was found" },
    source: nstr("e.g. 'Glassdoor (~80 reviews)'"),
    period: nstr("Date range of the reviews"),
    overallRating: nnum("0–5"),
    categoryRatings: arr(
      obj({ label: str("e.g. Work/life balance"), score: { type: "number", description: "0–5" } }),
      "Published category ratings only"
    ),
    ceoApprovalPct: nnum("0–100"),
    recommendPct: nnum("0–100, recommend-to-a-friend"),
    trend: nstr("One short phrase on the 12-month trend, if shown"),
    positiveThemes: arr(str(), "2–4 recurring positive themes"),
    negativeThemes: arr(str(), "2–4 recurring negative themes"),
  }),
  sayVsDo: arr(
    obj({ says: str("What the company says"), does: str("What behavior/evidence shows"), implication: str() }),
    "2–4 gaps"
  ),
  risks: arr(
    obj({ risk: str("Short title"), detail: str("One sentence"), severity: { type: "string", enum: ["high", "medium", "low"] } }),
    "2–5 risks and watch-outs"
  ),
  opportunities: arr(
    obj({
      area: str("e.g. Leadership hiring, Talent strategy, AI adoption"),
      angle: str("The opening line or angle, one sentence"),
      detail: str("Why now, one sentence"),
    }),
    "2–4 opportunities and conversation angles for SusanDana"
  ),
  questions: arr(str(), "4–7 questions to raise with the client, most important first"),
  coverage: arr(
    obj({
      area: str("Research area name, e.g. 'Identity & ownership'"),
      level: { type: "string", enum: ["full", "partial", "thin", "not researched"] },
    }),
    "One entry per research area (5), from each research file's coverage"
  ),
  sourcesCount: { type: ["integer", "null"], description: "Total sources across research files" },
  confidenceNote: str("2–3 sentences: why this confidence, what was thin, whether employee voice / client docs were available"),
});

/** Structural check before saving — the fields the page cannot render without. */
export function isReportShape(x: unknown): x is ReportData {
  const r = x as ReportData;
  return Boolean(
    r &&
      typeof r.headline === "string" &&
      Array.isArray(r.bottomLine) &&
      r.atAGlance &&
      r.culture &&
      Array.isArray(r.culture.dimensions) &&
      Array.isArray(r.culture.thrives) &&
      r.employeeSentiment &&
      Array.isArray(r.employeeSentiment.categoryRatings) &&
      Array.isArray(r.keyFigures) &&
      Array.isArray(r.timeline) &&
      Array.isArray(r.keyPersonas) &&
      Array.isArray(r.risks) &&
      Array.isArray(r.opportunities) &&
      Array.isArray(r.questions) &&
      Array.isArray(r.coverage) &&
      Array.isArray(r.sayVsDo)
  );
}

/* -------------------------------------------------------------------------
 * Read-side hygiene: clamp numbers, drop unknown dimensions, order them.
 * ---------------------------------------------------------------------- */

const clamp = (n: number | null, lo: number, hi: number) =>
  n === null || !Number.isFinite(n) ? null : Math.min(hi, Math.max(lo, n));

export function normalizeReport(raw: ReportData): ReportData {
  const dims = DIMENSIONS.map((d) => raw.culture.dimensions.find((x) => x.id === d.id)).filter(
    (x): x is ReportData["culture"]["dimensions"][number] => Boolean(x)
  );
  const s = raw.employeeSentiment;
  return {
    ...raw,
    culture: {
      ...raw.culture,
      dimensions: dims.map((d) => ({ ...d, position: clamp(d.position, 1, 5) ?? 3 })),
    },
    employeeSentiment: {
      ...s,
      overallRating: clamp(s.overallRating, 0, 5),
      ceoApprovalPct: clamp(s.ceoApprovalPct, 0, 100),
      recommendPct: clamp(s.recommendPct, 0, 100),
      categoryRatings: s.categoryRatings.map((c) => ({ ...c, score: clamp(c.score, 0, 5) ?? 0 })),
    },
  };
}

/* -------------------------------------------------------------------------
 * Markdown serialization — the download, and the `content` column.
 * ---------------------------------------------------------------------- */

export function reportToMarkdown(
  r: ReportData,
  meta: { company: string; slug: string; builtOn: string; mode: "full" | "culture-only"; modules: string[] }
): string {
  const out: string[] = [];
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  out.push(
    "---",
    `company: ${meta.company}`,
    `slug: ${meta.slug}`,
    `built_on: ${meta.builtOn}`,
    `scope: ${meta.mode}`,
    `research_modules: [${meta.modules.map((m) => m.slice(0, 2)).join(", ")}]`,
    `overall_confidence: ${r.overallConfidence}`,
    "status: draft",
    "---",
    "",
    `# ${meta.company} — Company Intelligence Report`,
    "",
    `> ${r.headline}`,
    "",
    `**Trajectory:** ${r.trajectory.direction}. ${r.trajectory.explanation}`,
    "",
    "## Bottom line",
    list(r.bottomLine),
    ""
  );
  if (r.keyFigures.length) {
    out.push(
      "## Key figures",
      "| Figure | Value | Context |",
      "|---|---|---|",
      ...r.keyFigures.map((k) => `| ${k.label} | ${k.value} | ${k.context}${k.asOf ? ` (${k.asOf})` : ""} |`),
      ""
    );
  }
  const g = r.atAGlance;
  out.push(
    "## At a glance",
    "| | |",
    "|---|---|",
    `| What they do | ${g.whatTheyDo} |`,
    `| Ownership | ${g.ownership} |`,
    `| Size & footprint | ${g.sizeAndFootprint} |`,
    `| Financial direction | ${g.financialDirection} |`,
    `| Leadership | ${g.leadership} |`,
    `| Current moment | ${g.currentMoment} |`,
    ""
  );
  if (r.currentSituation) out.push("## Where the company is right now", r.currentSituation, "");
  if (r.timeline.length) {
    out.push(
      "## Last 12 months: what matters",
      ...r.timeline.map((t) => `- **${t.date} · ${t.title}** (${t.category}). ${t.whyItMatters}`),
      ""
    );
  }
  if (r.keyPersonas.length) {
    out.push("## Key personas");
    for (const p of r.keyPersonas) {
      out.push(
        `### ${p.name} — ${p.role}${p.inRoleSince ? ` (since ${p.inRoleSince})` : ""}`,
        `- **Background:** ${p.background}`,
        `- **Focus areas:** ${p.focusAreas.join(", ")}`,
        ...(p.publicStance ? [`- **Public stance:** ${p.publicStance}`] : []),
        `- **Why they matter:** ${p.whyTheyMatter}`,
        `- **Approach:** ${p.approach}`,
        ""
      );
    }
  }
  const c = r.culture;
  out.push(
    `## Culture: who thrives here`,
    ...c.thrives.map((t) => `- **${t.behavior}** ${t.evidence}`),
    "",
    `**Who tends to struggle:**`,
    list(c.struggles),
    "",
    `**Where a new hire could add to the culture:**`,
    list(c.cultureAdd),
    "",
    "## Culture at a glance",
    "| Dimension | Position (1–5) | What it means | Confidence |",
    "|---|---|---|---|",
    ...c.dimensions.map((d) => {
      const def = DIMENSIONS.find((x) => x.id === d.id)!;
      return `| ${def.label}: ${def.left} (1) ↔ ${def.right} (5) | ${d.position} | ${d.meaning} | ${d.confidence} |`;
    }),
    "",
    `**What actually gets rewarded:** ${c.whatGetsRewarded}`,
    ""
  );
  const s = r.employeeSentiment;
  out.push("## Employee sentiment");
  if (!s.available) {
    out.push("No employee-review data was found.", "");
  } else {
    out.push(
      `Source: ${s.source ?? "n/a"}${s.period ? ` · ${s.period}` : ""}`,
      "",
      ...(s.overallRating !== null ? [`- Overall rating: **${s.overallRating} / 5**`] : []),
      ...s.categoryRatings.map((x) => `- ${x.label}: ${x.score} / 5`),
      ...(s.ceoApprovalPct !== null ? [`- CEO approval: ${s.ceoApprovalPct}%`] : []),
      ...(s.recommendPct !== null ? [`- Recommend to a friend: ${s.recommendPct}%`] : []),
      ...(s.trend ? [`- Trend: ${s.trend}`] : []),
      "",
      `**Positive themes:** ${s.positiveThemes.join("; ")}`,
      "",
      `**Negative themes:** ${s.negativeThemes.join("; ")}`,
      ""
    );
  }
  if (r.sayVsDo.length) {
    out.push(
      "## Say vs. do",
      ...r.sayVsDo.map((x) => `- **Says:** ${x.says} **Does:** ${x.does} *${x.implication}*`),
      ""
    );
  }
  out.push(
    "## Risks and watch-outs",
    ...r.risks.map((x) => `- **[${x.severity}] ${x.risk}.** ${x.detail}`),
    "",
    "## Opportunities and conversation angles",
    ...r.opportunities.map((x) => `- **${x.area}:** ${x.angle} ${x.detail}`),
    "",
    "## Questions to raise with the client",
    ...r.questions.map((q, i) => `${i + 1}. ${q}`),
    "",
    "## Confidence and sources",
    `Overall confidence: **${r.overallConfidence}**${r.sourcesCount !== null ? ` · ${r.sourcesCount} sources` : ""}.`,
    "",
    ...r.coverage.map((x) => `- ${x.area}: ${x.level}`),
    "",
    r.confidenceNote,
    ""
  );
  return out.join("\n");
}
