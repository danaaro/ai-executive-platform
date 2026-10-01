import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, max } from "drizzle-orm";
import { db, tables } from "@/db";
import {
  SYNTHESIS_MODEL,
  latestResearch,
  loadInputs,
  moduleStates,
  read,
  runToCompletion,
  stripFrontmatter,
  today,
} from "@/orchestrator/company-intel";
import {
  CATEGORIES,
  WRITERS,
  categoryById,
  contextToMarkdown,
  untracedNumbers,
  validateSection,
  writerSchema,
  type CategoryId,
  type CategoryResult,
  type ContextReportData,
  type Implication,
  type Validation,
  type WriterId,
} from "@/shared/company-context";
import { REPORT_JSON_SCHEMA, type ReportData } from "@/shared/company-report";

/**
 * Company Context report, v2 (ADR-009 §17, 2026-10-01).
 *
 * Four category writers run as separate requests (each fits the 300s budget
 * and a manageable output), each fed only the research modules it needs.
 * Their output is validated (company-context.ts → validateSection) before it
 * is saved as a `section` row. The overview then reads the VALIDATED sections
 * — not the raw research — and assembles the final `report` row.
 */

const RULES = `

---

# Runtime note (SusieBrain server) — COMPANY CONTEXT FRAMEWORK (v2)

You are answering Dana's **Company Context framework** (described below) for this company, as structured data
through the \`save_section\` tool. The interpretation and fairness rules above still apply in full.

## Never made up — the non-negotiable rule
Every answer has a status:
- **found**: directly stated by a research file. Put at least one \`evidence\` entry, copying the source's
  **name exactly as written in the research file's Sources table** and its URL. The platform checks every
  citation against the research files; a citation it can't find there is discarded and the answer
  becomes unknown.
- **inferred**: a labelled conclusion that follows from found facts (e.g. "PE-owned since 2025 → the owner
  likely prioritises EBITDA and an exit within 3–5 years"). Requires \`basedOn\` (the facts) AND \`evidence\`
  for those facts. State the inference plainly; never present it as fact.
- **unknown**: the research does not establish it. \`answer\` = null, \`position\` = null. This is the
  correct, valuable answer when the information isn't there — it becomes an interview question.

Never fill a gap with general industry knowledge, typical patterns, or a plausible guess. Never give a
scale a midpoint because you don't know — unknown is null. Never invent people, numbers, dates or sources.

## Every answer carries an interview question
Fill \`interviewQuestion\` for EVERY item, phrased for Dana and Susan to ask the client (CEO, CHRO, hiring
manager) in a discovery interview — specific to this company, open, non-leading. It is shown only if
the answer is unknown.

## Scope and style
- Each of your categories is a TOP-LEVEL field of the tool input, given as a JSON **object** — never a
  JSON-encoded string. Arrays are arrays, not strings.
- Answer EVERY question id and EVERY scale listed for your categories, exactly once each.
- Concise, concrete, executive-readable. Lead with what it means, then the fact.
- Current roles only from the official website or dated press ≤12 months; public professional
  information only; no demographic data; culture traits are observable behaviours.
- Implications: only from found/inferred answers — "what this means for any senior hire".
- Source precedence: official website > uploaded documents > web research.

---

# The framework (reference)

`;

/** Research text a writer receives = the validation corpus for its citations. */
async function writerCorpus(companyId: string, w: WriterId) {
  const research = (await latestResearch(companyId)).filter((r) => WRITERS[w].modules.includes(r.module));
  const files = research.map((r) => `<research_file name="${r.module}.md">\n${r.content}\n</research_file>`);
  return { research, text: files.join("\n\n") };
}

function questionList(w: WriterId) {
  return WRITERS[w].categories
    .map((id) => {
      const c = categoryById(id);
      const lines = [
        `### ${c.n}. ${c.title} (\`${c.id}\`)`,
        ...c.questions.map((q) => `- \`${q.id}\`: ${q.q}`),
        ...(c.scales ?? []).map((s) => `- scale \`${s.id}\`: ${s.label} — 1 = ${s.left}, 5 = ${s.right}`),
        ...(c.rapid ? ["- RAPID table: one row per decision (country strategy, annual budget, pricing, senior hire, product launch, major client terms, headcount, investment)"] : []),
        ...(c.people ? ["- power map: people with influence types (only confirmed-current roles)"] : []),
        ...(c.stakeholders ? ["- stakeholder grid: importance per relevant group"] : []),
        ...(c.stage ? ["- stage: current chapter and next chapter (2–3 years) from the 11-stage path"] : []),
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

export async function runSectionWriter(opts: {
  companyId: string;
  writer: WriterId;
  runId: string;
  mode: "full" | "culture-only";
  userId: string;
  onText?: (t: string) => void;
  /** Test hook: receives the writer's raw tool input before validation. */
  onRaw?: (raw: unknown) => void;
}) {
  const d = db();
  const [company] = await d.select().from(tables.companies).where(eq(tables.companies.id, opts.companyId)).limit(1);
  if (!company) throw new Error("Company not found");
  const { research, text } = await writerCorpus(company.id, opts.writer);
  if (!research.length) throw new Error(`No research yet for ${WRITERS[opts.writer].label}`);
  const inputs = await loadInputs(company.id);

  const system =
    stripFrontmatter(read("prompts/company-intel/company-synthesizer.md")) +
    RULES +
    read("docs/company-context-framework.md") +
    `\n\n---\n\nDeliver your answers by calling the \`save_section\` tool exactly once. Do not write them as text.`;

  const user =
    `Company: ${company.name}\nToday's date: ${today()}\n\n` +
    `## Your categories and their exact question ids\n\n${questionList(opts.writer)}\n\n` +
    `## Input filenames (context only)\n` +
    (inputs.length ? inputs.map((f) => `- ${f.filename}`).join("\n") : "- (none)") +
    `\n\n## Research files (your ONLY evidence)\n\n${text}`;

  const attempt = async () => {
    const res = await runToCompletion({
      model: SYNTHESIS_MODEL,
      system,
      user,
      maxTokens: 32000,
      tools: [
        {
          name: "save_section",
          description: `Save the Company Context answers for: ${WRITERS[opts.writer].label}. Call exactly once.`,
          input_schema: writerSchema(opts.writer) as Anthropic.Messages.Tool.InputSchema,
        },
      ],
      onText: opts.onText,
    });
    if (res.stopReason === "max_tokens") throw new Error("This section was cut off at the length limit. Please re-run");
    if (res.stopReason === "refusal") throw new Error("The model declined to write this section");
    const call = res.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === "save_section"
    );
    if (!call) throw new Error("The section came back empty. Please re-run");
    opts.onRaw?.(call.input);
    return { usage: res.usage, validated: validateSection(call.input, opts.writer, text) };
  };

  // A category that comes back completely empty (no summary, nothing found or
  // inferred) is a writer lapse, not a finding — seen on "External ecosystem"
  // while the same research filled it on the next run. Retry once.
  let { usage, validated } = await attempt();
  const blank = (v: typeof validated) =>
    WRITERS[opts.writer].categories.some((id) => {
      const c = v.categories[id];
      return !c || (!c.summary.trim() && ![...c.answers, ...c.ratings].some((x) => x.status !== "unknown"));
    });
  if (blank(validated)) {
    const second = await attempt();
    usage = {
      ...second.usage,
      inputTokens: usage.inputTokens + second.usage.inputTokens,
      outputTokens: usage.outputTokens + second.usage.outputTokens,
      ms: usage.ms + second.usage.ms,
    };
    if (!blank(second.validated) || second.validated.stats.found + second.validated.stats.inferred > validated.stats.found + validated.stats.inferred) {
      validated = second.validated;
    }
  }
  const [row] = await d
    .insert(tables.companyOutputs)
    .values({
      companyId: company.id,
      kind: "section",
      version: 0,
      mode: opts.mode,
      runId: opts.runId,
      content: `section ${opts.writer}`,
      data: { writer: opts.writer, ...validated },
      usage,
      createdBy: opts.userId,
    })
    .returning();
  return { row, stats: validated.stats };
}

/* -------------------------------------------------------------------------
 * Overview → the final report row
 * ---------------------------------------------------------------------- */

type SectionData = {
  writer: WriterId;
  categories: Partial<Record<CategoryId, CategoryResult>>;
  extras: Partial<ContextReportData>;
  stats: Validation;
};

const R = (REPORT_JSON_SCHEMA as { properties: Record<string, object> }).properties;
const OVERVIEW_SCHEMA = {
  type: "object",
  properties: {
    headline: R.headline,
    trajectory: R.trajectory,
    overallConfidence: R.overallConfidence,
    bottomLine: R.bottomLine,
    risks: R.risks,
    opportunities: R.opportunities,
    hireImplications: {
      type: "array",
      description: "4–8 'what this means for any senior hire' lines, each from found/inferred findings in the sections",
      items: {
        type: "object",
        properties: {
          finding: { type: "string" },
          implication: { type: "string" },
          categories: { type: "array", items: { type: "string" }, description: "Category ids it rests on" },
        },
        required: ["finding", "implication", "categories"],
      },
    },
    extraQuestions: {
      type: "array",
      items: { type: "string" },
      description: "0–5 cross-cutting interview questions not already covered by the categories",
    },
  },
  required: ["headline", "trajectory", "overallConfidence", "bottomLine", "risks", "opportunities", "hireImplications", "extraQuestions"],
};

/** What the overview sees: validated answers only, no unknowns, no evidence lists. */
function digest(categories: Partial<Record<CategoryId, CategoryResult>>) {
  const out: Record<string, unknown> = {};
  for (const def of CATEGORIES) {
    const c = categories[def.id];
    if (!c) continue;
    out[def.title] = {
      summary: c.summary,
      answers: c.answers.filter((a) => a.status !== "unknown").map((a) => ({ q: a.question, a: a.answer, status: a.status })),
      scales: c.ratings.filter((r) => r.position !== null).map((r) => ({ scale: `${r.label} (1 ${r.left} – 5 ${r.right})`, position: r.position, status: r.status })),
      ...(c.stage && c.stage.status !== "unknown" ? { stage: { current: c.stage.current, next: c.stage.next } } : {}),
      ...(c.rapid ? { decisions: c.rapid.filter((r) => r.status !== "unknown").map((r) => ({ decision: r.decision, decide: r.decide })) } : {}),
      unknownCount: c.answers.filter((a) => a.status === "unknown").length,
    };
  }
  return out;
}

export async function runOverview(opts: {
  companyId: string;
  runId: string;
  mode: "full" | "culture-only";
  userId: string;
  onText?: (t: string) => void;
}) {
  const d = db();
  const [company] = await d.select().from(tables.companies).where(eq(tables.companies.id, opts.companyId)).limit(1);
  if (!company) throw new Error("Company not found");

  const sectionRows = await d
    .select()
    .from(tables.companyOutputs)
    .where(and(eq(tables.companyOutputs.companyId, company.id), eq(tables.companyOutputs.runId, opts.runId), eq(tables.companyOutputs.kind, "section")))
    .orderBy(desc(tables.companyOutputs.createdAt));
  const sections = sectionRows.map((r) => r.data as SectionData);
  if (!sections.length) throw new Error("No category sections were written in this run");

  const categories: Partial<Record<CategoryId, CategoryResult>> = {};
  const extras: Partial<ContextReportData> = {};
  const validation: Validation = { found: 0, inferred: 0, unknown: 0, downgraded: 0, untraced: [] };
  for (const s of sections) {
    Object.assign(categories, s.categories);
    for (const [k, v] of Object.entries(s.extras ?? {})) if (v !== undefined) (extras as Record<string, unknown>)[k] = v;
    validation.found += s.stats.found;
    validation.inferred += s.stats.inferred;
    validation.unknown += s.stats.unknown;
    validation.downgraded += s.stats.downgraded;
    validation.untraced.push(...s.stats.untraced);
  }

  // Carry over what an earlier report already established and this run didn't
  // re-write (e.g. personas + verified photos), so saved work is reused.
  const [prev] = await d
    .select({ data: tables.companyOutputs.data })
    .from(tables.companyOutputs)
    .where(and(eq(tables.companyOutputs.companyId, company.id), eq(tables.companyOutputs.kind, "report")))
    .orderBy(desc(tables.companyOutputs.version))
    .limit(1);
  const prevData = (prev?.data ?? null) as Partial<ReportData & ContextReportData> | null;
  if (prevData) {
    for (const k of ["keyPersonas", "groupStructure", "timeline", "employeeSentiment", "sayVsDo"] as const) {
      if (extras[k] === undefined && prevData[k] !== undefined) (extras as Record<string, unknown>)[k] = prevData[k];
    }
    // Same person, same verified photo — the photo step then only fills gaps.
    const prevPhotos = new Map((prevData.keyPersonas ?? []).filter((p) => p.photo).map((p) => [p.name, p.photo]));
    if (extras.keyPersonas) extras.keyPersonas = extras.keyPersonas.map((p) => ({ ...p, photo: p.photo ?? prevPhotos.get(p.name) ?? null }));
  }

  const basis = JSON.stringify(digest(categories));
  const system =
    stripFrontmatter(read("prompts/company-intel/company-synthesizer.md")) +
    `\n\n---\n\n# Runtime note — OVERVIEW of a Company Context report\n\n` +
    `You receive the VALIDATED category findings (found / inferred only). Write the executive overview from them.\n` +
    `- Use ONLY facts present in the findings. Do not add numbers, names or dates that aren't there.\n` +
    `- Inferences must read as inferences ("likely", "suggests").\n` +
    `- No "(→ 01)"-style references to categories or modules in the text; the page links categories itself.\n` +
    `- Audience: Dana and Susan preparing client conversations (executive search, talent advisory, AI consulting).\n` +
    `- Call the \`save_overview\` tool exactly once.`;
  const user =
    `Company: ${company.name}\nToday's date: ${today()}\n\n## Validated findings by category\n\n` +
    "```json\n" + JSON.stringify(digest(categories), null, 1) + "\n```";

  const { content, usage, stopReason } = await runToCompletion({
    model: SYNTHESIS_MODEL,
    system,
    user,
    maxTokens: 12000,
    tools: [{ name: "save_overview", description: "Save the overview. Call exactly once.", input_schema: OVERVIEW_SCHEMA as Anthropic.Messages.Tool.InputSchema }],
    onText: opts.onText,
  });
  if (stopReason === "max_tokens") throw new Error("The overview was cut off. Please re-run");
  const call = content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === "save_overview");
  if (!call) throw new Error("The overview came back empty. Please re-run");
  const ov = call.input as {
    headline: string;
    trajectory: ReportData["trajectory"];
    overallConfidence: ReportData["overallConfidence"];
    bottomLine: string[];
    risks: ReportData["risks"];
    opportunities: ReportData["opportunities"];
    hireImplications: { finding: string; implication: string; categories: string[] }[];
    extraQuestions: string[];
  };

  // Numbers in the overview prose must exist in the validated findings.
  validation.untraced.push(
    ...untracedNumbers(
      [ov.headline, ...ov.bottomLine, ...ov.risks.map((r) => `${r.risk} ${r.detail}`), ...ov.opportunities.map((o) => `${o.angle} ${o.detail}`)],
      basis + JSON.stringify(extras.keyFigures ?? [])
    ).map((n) => `overview: ${n}`)
  );

  const research = await latestResearch(company.id);
  const states = await moduleStates(company.id);
  const data: ContextReportData = {
    version: 2,
    headline: ov.headline,
    trajectory: ov.trajectory,
    overallConfidence: ov.overallConfidence,
    bottomLine: ov.bottomLine ?? [],
    keyFigures: extras.keyFigures ?? [],
    keyPersonas: extras.keyPersonas ?? [],
    timeline: extras.timeline ?? [],
    groupStructure: extras.groupStructure,
    employeeSentiment: extras.employeeSentiment ?? null,
    sayVsDo: extras.sayVsDo ?? [],
    risks: ov.risks ?? [],
    opportunities: ov.opportunities ?? [],
    hireImplications: (ov.hireImplications ?? []).map(
      (h): Implication => ({ finding: h.finding, implication: h.implication, status: "inferred", evidence: [], basedOn: h.categories ?? [] })
    ),
    extraQuestions: ov.extraQuestions ?? [],
    categories,
    validation,
    sources: research.map((r) => ({
      module: r.module,
      researchedOn: r.researchedOn,
      briefOutdated: states.find((s) => s.module === r.module)?.briefOutdated ?? false,
    })),
    sourcesCount: research.reduce((t, r) => t + (r.sourcesCount ?? 0), 0) || null,
  };

  const [agg] = await d
    .select({ v: max(tables.companyOutputs.version) })
    .from(tables.companyOutputs)
    .where(and(eq(tables.companyOutputs.companyId, company.id), eq(tables.companyOutputs.kind, "report")));
  const [row] = await d
    .insert(tables.companyOutputs)
    .values({
      companyId: company.id,
      kind: "report",
      version: (agg.v ?? 0) + 1,
      mode: opts.mode,
      runId: opts.runId,
      content: contextToMarkdown(data, { company: company.name, builtOn: today() }),
      data,
      usage,
      createdBy: opts.userId,
    })
    .returning();
  await d.update(tables.companies).set({ updatedAt: new Date() }).where(eq(tables.companies.id, company.id));
  return row;
}
