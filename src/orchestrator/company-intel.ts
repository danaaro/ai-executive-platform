import fs from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { db, tables } from "@/db";
import { getAnthropicClient, DEFAULT_MODEL } from "@/shared/anthropic-client";
import { findPersonaPhotos, photoUsage } from "@/orchestrator/persona-photos";
import { findCompanyLogo, guessWebsite } from "@/orchestrator/company-logo";
import { readCompanySite } from "@/orchestrator/company-site";
import { like } from "drizzle-orm";
import {
  REPORT_JSON_SCHEMA,
  isReportShape,
  normalizeReport,
  reportToMarkdown,
  type ReportData,
} from "@/shared/company-report";

/**
 * Company Intelligence runtime (ADR-009) — INTERNAL, admin-only.
 *
 * Port of the company-intel build package from local Claude Code to the
 * server: the package's slash command becomes the browser page (it fans out
 * one request per module so each gets its own function budget), its
 * `company-researcher` subagent becomes runResearchModule(), and its
 * `company-synthesizer` becomes runSynthesis(). Prompts, briefs and templates
 * stay declarative in products/interview-intelligence/ and load unchanged —
 * only a runtime note is appended to map the package's file/tool world onto
 * this one.
 *
 * Feeds no other agent. Deliberately absent from AGENT_REGISTRY.
 */

const ROOT = path.join(process.cwd(), "products/interview-intelligence");
export const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf-8");
export const stripFrontmatter = (md: string) => md.replace(/^---\n[\s\S]*?\n---\n/, "");

/** Inputs whose filename starts with this are the platform's read of the official website. */
const SITE_INPUT_PREFIX = "company-website-";

const RESEARCH_MODEL = DEFAULT_MODEL; // claude-sonnet-5 — high-volume research
export const SYNTHESIS_MODEL = "claude-opus-5-5"; // judgment lives here (package ADR #10)

/* -------------------------------------------------------------------------
 * Modules and the cache rule
 * ---------------------------------------------------------------------- */

export const MODULES = [
  { id: "01-identity-ownership", title: "Identity & ownership" },
  { id: "02-financial-health", title: "Financial health" },
  { id: "03-recent-activity", title: "Recent activity" },
  { id: "04-people-structure", title: "People & structure" },
  { id: "05-culture-voice", title: "Culture & employee voice" },
  { id: "06-group-structure", title: "Group & portfolio" },
  // Company Context framework v2 (2026-10-01, ADR-009 §17)
  { id: "07-business-strategy", title: "Business model & strategy" },
  { id: "08-performance-talent-ecosystem", title: "Performance, talent & ecosystem" },
] as const;

export type ModuleId = (typeof MODULES)[number]["id"];
export const CULTURE_MODULE: ModuleId = "05-culture-voice";

export function isModuleId(s: string): s is ModuleId {
  return MODULES.some((m) => m.id === s);
}

/** "**Version:** N" in the brief; briefs without one are version 1. */
export function briefVersion(module: ModuleId): number {
  const m = read(`prompts/company-intel/briefs/${module}.md`).match(/\*\*Version:\*\*\s*(\d+)/);
  return m ? Number(m[1]) : 1;
}

/** The brief is the source of truth for shelf life ("**Shelf life:** 90 days"). */
export function shelfLifeDays(module: ModuleId): number {
  const m = read(`prompts/company-intel/briefs/${module}.md`).match(/Shelf life:\*\*\s*(\d+)/);
  if (!m) throw new Error(`Brief ${module} declares no shelf life`);
  return Number(m[1]);
}

export const today = () => new Date().toISOString().slice(0, 10);

/** "Acme Corp Ltd." → "acme". Lowercase, hyphenated, legal suffixes removed. */
export function slugify(name: string): string {
  const suffixes =
    /\b(ltd|limited|inc|incorporated|corp|corporation|co|company|gmbh|llc|llp|plc|sa|ag|bv|nv|oy|as|ab|srl|spa|pty|oü|ou)\b\.?/gi;
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(suffixes, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ModuleState = {
  module: ModuleId;
  title: string;
  status: "fresh" | "stale" | "missing";
  /** Researched with an earlier version of its brief: reused, but new questions show as Unknown. */
  briefOutdated: boolean;
  researchedOn: string | null;
  coverage: string | null;
  sourcesCount: number | null;
};

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Latest research row per module, classified fresh / stale / missing. */
export async function moduleStates(companyId: string): Promise<ModuleState[]> {
  const rows = await db()
    .select()
    .from(tables.companyResearch)
    .where(eq(tables.companyResearch.companyId, companyId))
    .orderBy(desc(tables.companyResearch.createdAt));

  const now = today();
  return MODULES.map(({ id, title }) => {
    const latest = rows.find((r) => r.module === id);
    if (!latest) {
      return { module: id, title, status: "missing", briefOutdated: false, researchedOn: null, coverage: null, sourcesCount: null };
    }
    const expires = addDays(latest.researchedOn, latest.shelfLifeDays);
    return {
      module: id,
      title,
      status: expires > now ? "fresh" : "stale",
      briefOutdated: (latest.briefVersion ?? 1) < briefVersion(id),
      researchedOn: latest.researchedOn,
      coverage: latest.coverage,
      sourcesCount: latest.sourcesCount,
    };
  });
}

export async function latestResearch(companyId: string) {
  const rows = await db()
    .select()
    .from(tables.companyResearch)
    .where(eq(tables.companyResearch.companyId, companyId))
    .orderBy(desc(tables.companyResearch.createdAt));
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.module) ? false : (seen.add(r.module), true)))
    .sort((a, b) => a.module.localeCompare(b.module));
}

export async function latestOutputs(companyId: string) {
  const rows = await db()
    .select()
    .from(tables.companyOutputs)
    .where(eq(tables.companyOutputs.companyId, companyId))
    .orderBy(desc(tables.companyOutputs.version));
  // brief/culture are the pre-report format (kept as history, no longer produced);
  // "section" rows are intermediate v2 writer outputs, never shown on their own.
  return { report: rows.find((r) => r.kind === "report") ?? null };
}

export async function loadInputs(companyId: string) {
  return db()
    .select({ filename: tables.companyInputs.filename, content: tables.companyInputs.content })
    .from(tables.companyInputs)
    .where(eq(tables.companyInputs.companyId, companyId))
    .orderBy(asc(tables.companyInputs.createdAt));
}

/* -------------------------------------------------------------------------
 * Model plumbing
 * ---------------------------------------------------------------------- */

type Usage = {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  webFetches: number;
  model: string;
  ms: number;
};

type Progress = (line: string) => void;

/**
 * Runs one model request to completion, following `pause_turn` (the API
 * pauses long server-tool loops and expects the assistant turn sent back to
 * continue). Streams so a long run never looks idle, and reports each web
 * search / fetch as a progress line.
 */
export async function runToCompletion(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  tools?: Anthropic.Messages.ToolUnion[];
  onProgress?: Progress;
  onText?: (text: string) => void;
}): Promise<{ content: Anthropic.Messages.ContentBlock[]; usage: Usage; stopReason: string | null }> {
  const started = Date.now();
  const usage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    webSearches: 0,
    webFetches: 0,
    model: opts.model,
    ms: 0,
  };
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: opts.user }];
  const content: Anthropic.Messages.ContentBlock[] = [];
  let stopReason: string | null = null;

  for (let round = 0; round < 6; round++) {
    const stream = getAnthropicClient().messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages,
      ...(opts.tools ? { tools: opts.tools } : {}),
    });

    stream.on("contentBlock", (block) => {
      if (block.type === "server_tool_use" && opts.onProgress) {
        const input = block.input as { query?: string; url?: string };
        if (block.name === "web_search" && input.query) opts.onProgress(`search: ${input.query}`);
        else if (block.name === "web_fetch" && input.url) opts.onProgress(`read: ${input.url}`);
      }
    });
    if (opts.onText) {
      stream.on("text", opts.onText);
      // Tool-call arguments stream as JSON deltas — same liveness signal.
      stream.on("inputJson", (delta) => opts.onText!(delta));
    }

    const msg = await stream.finalMessage();
    content.push(...msg.content);
    usage.inputTokens += msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0);
    usage.outputTokens += msg.usage.output_tokens;
    usage.webSearches += msg.usage.server_tool_use?.web_search_requests ?? 0;
    usage.webFetches += msg.usage.server_tool_use?.web_fetch_requests ?? 0;
    stopReason = msg.stop_reason;

    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }

  usage.ms = Date.now() - started;
  return { content, usage, stopReason };
}

/**
 * The deliverable is the text written AFTER the last tool result — earlier
 * text blocks are the model narrating its searches. Citations split one
 * logical answer into several consecutive text blocks, so they're joined.
 */
function finalText(content: Anthropic.Messages.ContentBlock[]): string {
  let lastTool = -1;
  content.forEach((b, i) => {
    if (b.type !== "text" && b.type !== "thinking" && b.type !== "redacted_thinking") lastTool = i;
  });
  const tail = content
    .slice(lastTool + 1)
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return tail.trim()
    ? tail
    : content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
}

/** Drops any preamble before the file's opening frontmatter fence. */
function fromFrontmatter(text: string): string {
  const i = text.search(/^---\s*$/m);
  return (i >= 0 ? text.slice(i) : text).trim() + "\n";
}

function frontmatterField(md: string, key: string): string | null {
  // Tolerant: models sometimes add a blank line after the opening fence or
  // drop the closing one, so look at the header lines before the first heading.
  const head = md.split(/\n#\s/)[0].slice(0, 2000);
  const line = head.match(new RegExp(`^${key}:\\s*(.+?)\\s*(#.*)?$`, "m"));
  return line ? line[1].replace(/^["']|["']$/g, "") : null;
}

/* -------------------------------------------------------------------------
 * Researcher
 * ---------------------------------------------------------------------- */

const RESEARCHER_RUNTIME_NOTE = `

---

# Runtime note (SusieBrain server)

You are running as a server-side API call, not inside Claude Code. Map the instructions above as follows:
- **Tools:** WebSearch = \`web_search\`, WebFetch = \`web_fetch\`. You have no Read, Write or Glob.
- **Your brief** and **the output template** are included below in full.
- **The inputs folder** is included in the user message: every uploaded document, in full. If the message says there are none, there are none.
- **Writing the output file:** you cannot write files. Your FINAL reply must be ONLY the completed research file in Markdown, starting with its \`---\` frontmatter line. Put no text before or after it. The platform saves it.
- Work efficiently. Prefer a few well-chosen searches and fetches of primary sources over many shallow ones.`;

export async function runResearchModule(opts: {
  companyId: string;
  module: ModuleId;
  userId: string;
  onProgress?: Progress;
}) {
  const d = db();
  const [company] = await d
    .select()
    .from(tables.companies)
    .where(eq(tables.companies.id, opts.companyId))
    .limit(1);
  if (!company) throw new Error("Company not found");

  const date = today();
  const shelf = shelfLifeDays(opts.module);
  const inputs = await loadInputs(company.id);

  const system =
    stripFrontmatter(read("prompts/company-intel/company-researcher.md")) +
    RESEARCHER_RUNTIME_NOTE +
    `\n\n---\n\n# Your brief: company-intel/briefs/${opts.module}.md\n\n` +
    read(`prompts/company-intel/briefs/${opts.module}.md`) +
    `\n\n---\n\n# Output template: company-intel/templates/research-module.md\n\n` +
    read("schemas/company-intel/research-module.md");

  // The package orchestrator's exact hand-off block (research-company.md §4),
  // followed by the inputs, laid out in Dana's source order (2026-09-26):
  // 1 official website → 2 our uploaded documents → 3 web search.
  const doc = (f: { filename: string; content: string }) =>
    `<document filename="${f.filename}">\n${f.content}\n</document>`;
  const site = inputs.filter((f) => f.filename.startsWith(SITE_INPUT_PREFIX));
  const uploads = inputs.filter((f) => !f.filename.startsWith(SITE_INPUT_PREFIX));
  const inputsBlock =
    `### SOURCE 1: Official company website (source of truth about the company)\n\n` +
    (site.length
      ? site.map(doc).join("\n\n")
      : `(The platform could not read the website${company.website ? ` ${company.website}` : ""}. ` +
        `Open the official site yourself with web_fetch before any other source.)`) +
    `\n\n### SOURCE 2: Documents we uploaded (second in trust)\n\n` +
    (uploads.length ? uploads.map(doc).join("\n\n") : "(None uploaded.)") +
    `\n\n### SOURCE 3: Web search (last; never overrides sources 1 and 2)\n\n` +
    `Now research the web following your brief.`;

  const user =
    `Company: ${company.name}\n` +
    `Slug: ${company.slug}\n` +
    (company.website ? `Website: ${company.website}\n` : "") +
    `Today's date: ${date}\n` +
    `Your brief: company-intel/briefs/${opts.module}.md\n` +
    `Inputs folder: companies/${company.slug}/inputs/\n` +
    `Write your output to: companies/${company.slug}/research/${opts.module}.md\n` +
    `Use the template: company-intel/templates/research-module.md\n\n` +
    `## Your sources, in order of authority\n\n` +
    inputsBlock;

  const { content, usage, stopReason } = await runToCompletion({
    model: RESEARCH_MODEL,
    system,
    user,
    maxTokens: 16000,
    tools: [
      {
        type: "web_search_20260318",
        name: "web_search",
        max_uses: 15,
        allowed_callers: ["direct"],
      },
      {
        type: "web_fetch_20260318",
        name: "web_fetch",
        max_uses: 10,
        max_content_tokens: 12000,
        allowed_callers: ["direct"],
      },
    ],
    onProgress: opts.onProgress,
  });

  const text = finalText(content);
  if (!text.trim()) {
    throw new Error(`Module ${opts.module} returned no content (stop: ${stopReason ?? "unknown"})`);
  }
  const md = fromFrontmatter(text);
  const sources = Number(frontmatterField(md, "sources_count"));

  const [row] = await d
    .insert(tables.companyResearch)
    .values({
      companyId: company.id,
      module: opts.module,
      content: md,
      researchedOn: date,
      shelfLifeDays: shelf,
      coverage: frontmatterField(md, "coverage"),
      sourcesCount: Number.isFinite(sources) ? sources : null,
      usage,
      briefVersion: briefVersion(opts.module),
      createdBy: opts.userId,
    })
    .returning();
  await d
    .update(tables.companies)
    .set({ updatedAt: new Date() })
    .where(eq(tables.companies.id, company.id));
  await ensureCompanyLogo(company.id).catch((err) => console.warn("[company-intel] logo lookup failed:", err));
  return row;
}

/* -------------------------------------------------------------------------
 * Synthesizer → ONE final report (2026-09-26)
 *
 * The package's synthesizer wrote two long documents (company-brief +
 * culture-profile, 7–15k chars each, evidence arrows on every line) and the
 * page also exposed the five raw research files. Dana's call: the deliverable
 * is ONLY the finished, analyzed summary. So the synthesizer's interpretation
 * and fairness rules are loaded unchanged, but its output is redirected into a
 * single report (schemas/company-intel/company-report.md). The research files
 * stay in the DB as the evidence record (sources + dates live there) and for
 * the cache — they're just no longer the product.
 * ---------------------------------------------------------------------- */

export type SynthesisMode = "full" | "culture-only";

const REPORT_OVERRIDE = (mode: SynthesisMode) => `

---

# Runtime note (SusieBrain server) — OUTPUT OVERRIDE

You are running as a server-side API call and cannot read or write files. The research files and
input filenames are in the user message. The platform renders and saves what you return.

**Output override (decided by Dana, 2026-09-26):** do NOT write company-brief.md or
culture-profile.md. Produce ONE Company Intelligence Report as structured JSON matching the
enforced schema. The platform renders it as a visual executive page (charts, timeline, persona
cards) and as a Markdown download. The report description below explains each section.
Everything in the instructions above still applies: interpretation rules, stated vs lived,
trade-offs not virtues, honest confidence, the specificity test, and all fairness rules. Only the
output shape changes.

How to write it:
- **It is the final product, not a digest of the research.** Analyze, connect and conclude. Lead
  with what it means, then the fact that shows it. Every field is read by an executive in
  seconds: short, concrete, no filler, no repetition across sections.
- **Numbers are for charts.** Put only published or sourced figures in keyFigures and
  employeeSentiment. Never estimate a rating or percentage. Use null when not found.
- **Traceability, lightly:** no "(→ 03)" arrows. The research files remain the evidence record.
  Name the key fact behind a conclusion in plain words where it matters. Keep dates on any
  figure that can go stale.
- **Source precedence:** official company website (\`company-website-*.md\`) > documents we
  uploaded > web research. When they disagree on a fact about the company, the higher one wins.
  Exception: employee voice is its own evidence for lived culture; the website never overrules it.
- **Current roles only.** A persona or group-company leader counts as current only when the
  company's own website (the \`company-website-*.md\` input, read today) or dated press from the
  last 12 months confirms it. Org-chart / data aggregators and old register entries are never
  enough. When the official team page and another source disagree, the official page wins.
- **Group structure** comes from module 06 (and the company website's companies/brands pages):
  parent one level up, major companies one level down, each with its leader and latest change.
- **Key personas: public professional information ONLY** (role, tenure, official bio, public
  statements, talks, interviews). Nothing about private life, family, health, personal social
  media, or personality speculation. "approach" must rest on their public priorities and role,
  never on psychological profiling or pressure tactics.
- **Audience:** Dana and Susan, preparing client conversations (executive search, talent
  advisory, AI consulting). Not a hiring manager, not a candidate.
${mode === "culture-only"
  ? `- **Scope is culture-only:** only module 05 was researched. Set currentSituation to null, and leave
  timeline, keyPersonas and groupStructure.entities empty (groupStructure.summary: "Not researched in this run."). In atAGlance write "not researched" where the research is
  silent. Mark areas 01–04 and 06 as "not researched" in coverage, and say in confidenceNote that a full
  run adds ownership, financials, recent activity and leadership.`
  : "- **Scope is full:** every section applies."}

---

# Report description: company-intel/templates/company-report.md

`;

export async function runSynthesis(opts: {
  companyId: string;
  mode: SynthesisMode;
  userId: string;
  onText?: (text: string) => void;
}) {
  const d = db();
  const [company] = await d
    .select()
    .from(tables.companies)
    .where(eq(tables.companies.id, opts.companyId))
    .limit(1);
  if (!company) throw new Error("Company not found");

  const research = await latestResearch(company.id);
  if (!research.some((r) => r.module === CULTURE_MODULE)) {
    throw new Error("Module 05 (culture & employee voice) hasn't been researched yet");
  }
  const inputs = await loadInputs(company.id);

  const system =
    stripFrontmatter(read("prompts/company-intel/company-synthesizer.md")) +
    REPORT_OVERRIDE(opts.mode) +
    `Deliver the report by calling the \`save_report\` tool exactly once with the complete report. ` +
    `Do not write the report as text.\n\n` +
    read("schemas/company-intel/company-report.md");

  const user =
    `Company: ${company.name}\nSlug: ${company.slug}\nToday's date: ${today()}\nMode: ${opts.mode}\n\n` +
    `## Input filenames (context only; do not re-research)\n` +
    (inputs.length ? inputs.map((f) => `- ${f.filename}`).join("\n") : "- (none)") +
    `\n\n## Research files (companies/${company.slug}/research/)\n\n` +
    research
      .map((r) => `<research_file name="${r.module}.md">\n${r.content}\n</research_file>`)
      .join("\n\n");

  const { content, usage, stopReason } = await runToCompletion({
    model: SYNTHESIS_MODEL,
    system,
    user,
    maxTokens: 20000,
    // Delivered as a tool call rather than enforced structured output: the
    // schema is too large for the structured-outputs grammar compiler
    // ("compiled grammar is too large", 2026-09-26). Tool arguments arrive as
    // parsed JSON; isReportShape() guards the rest.
    tools: [
      {
        name: "save_report",
        description:
          "Save the finished Company Intelligence Report. Call exactly once, with the complete report.",
        input_schema: REPORT_JSON_SCHEMA as Anthropic.Messages.Tool.InputSchema,
      },
    ],
    onText: opts.onText,
  });
  if (stopReason === "max_tokens") throw new Error("The report was cut off at the length limit. Please re-run");
  if (stopReason === "refusal") throw new Error("The model declined to write this report");

  const call = content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === "save_report"
  );
  if (!call || !isReportShape(call.input)) {
    throw new Error("The report came back incomplete. Please re-run");
  }
  const data: ReportData = normalizeReport(call.input);
  const markdown = reportToMarkdown(data, {
    company: company.name,
    slug: company.slug,
    builtOn: today(),
    mode: opts.mode,
    modules: research.map((r) => r.module),
  });

  const [agg] = await d
    .select({ v: max(tables.companyOutputs.version) })
    .from(tables.companyOutputs)
    .where(
      and(eq(tables.companyOutputs.companyId, company.id), eq(tables.companyOutputs.kind, "report"))
    );
  const [row] = await d
    .insert(tables.companyOutputs)
    .values({
      companyId: company.id,
      kind: "report",
      version: (agg.v ?? 0) + 1,
      mode: opts.mode,
      content: markdown,
      data,
      usage,
      createdBy: opts.userId,
    })
    .returning();
  await d
    .update(tables.companies)
    .set({ updatedAt: new Date() })
    .where(eq(tables.companies.id, company.id));
  return row;
}

/**
 * Adds persona photos to the latest report, in place (same version: it is an
 * enrichment of that report, not a new analysis). Its own request, so the
 * page search never eats into the synthesis time budget.
 */
export async function addPersonaPhotos(companyId: string, userId?: string) {
  const d = db();
  const [company] = await d.select().from(tables.companies).where(eq(tables.companies.id, companyId)).limit(1);
  const { report } = await latestOutputs(companyId);
  if (!company || !report?.data) throw new Error("No visual report to add photos to");
  const data = report.data as ReportData;

  await ensureCompanyLogo(companyId).catch(() => null);
  const usage = photoUsage();
  // Photos ALWAYS start from the official website (Dana, 2026-09-26). Use
  // today's read from step 1; if there isn't one (e.g. a photos-only run that
  // reused saved research), read the site now rather than skip to web search.
  let siteInput = (await loadInputs(companyId)).find((f) => f.filename.startsWith(SITE_INPUT_PREFIX));
  if (!siteInput || !siteInput.filename.includes(today())) {
    await refreshCompanySite(companyId, userId ?? company.createdBy).catch((err) =>
      console.warn("[company-intel] website read before photos failed:", err)
    );
    siteInput = (await loadInputs(companyId)).find((f) => f.filename.startsWith(SITE_INPUT_PREFIX));
  }
  const [fresh] = await d.select().from(tables.companies).where(eq(tables.companies.id, companyId)).limit(1);
  const officialPages = [...(siteInput?.content.matchAll(/^## Page: (\S+)/gm) ?? [])].map((m) => m[1]);
  // Plus the usual team-page addresses, in case the website read capped them out.
  if (fresh?.website) {
    const origin = new URL(fresh.website).origin;
    for (const p of ["/team", "/leadership", "/management", "/about/leadership", "/about-us/leadership", "/our-team", "/about/team"]) {
      officialPages.push(origin + p);
    }
  }
  const photos = await findPersonaPhotos({
    usage,
    officialPages,
    company: company.name,
    website: company.website,
    personas: data.keyPersonas.map((p) => ({ name: p.name, role: p.role })),
  });
  const next: ReportData = {
    ...data,
    keyPersonas: data.keyPersonas.map((p) => ({ ...p, photo: photos[p.name] ?? null })),
    photosCheckedAt: new Date().toISOString(),
    photosUsage: usage,
  };
  await d.update(tables.companyOutputs).set({ data: next }).where(eq(tables.companyOutputs.id, report.id));
  return next.keyPersonas.filter((p) => p.photo).length;
}

/**
 * Finds and stores the company logo once (companies.logo_url). Fills in
 * `website` from the research when it was never entered, since the logo and
 * the future CRM record both want it. Never throws into a run's critical path
 * — callers catch.
 */
export async function ensureCompanyLogo(companyId: string, force = false) {
  const d = db();
  const [company] = await d.select().from(tables.companies).where(eq(tables.companies.id, companyId)).limit(1);
  if (!company || (company.logoUrl && !force)) return company?.logoUrl ?? null;

  const website =
    company.website ?? guessWebsite(company.slug, (await latestResearch(companyId)).map((r) => r.content));
  if (!website) return null;
  const logoUrl = await findCompanyLogo(website, company.name);
  await d
    .update(tables.companies)
    .set({ logoUrl, website: company.website ?? website })
    .where(eq(tables.companies.id, companyId));
  return logoUrl;
}

/* -------------------------------------------------------------------------
 * Step 0 of every run: the company's own website as a primary input
 * ---------------------------------------------------------------------- */


/**
 * Reads the company's own site server-side (orchestrator/company-site.ts) and
 * stores it as an input dated today, replacing the previous copy, so every
 * research module reads the official team / companies / about pages at the
 * highest trust level — even when Anthropic's web_fetch can't open the site.
 */
export async function refreshCompanySite(companyId: string, userId: string) {
  const d = db();
  const [company] = await d.select().from(tables.companies).where(eq(tables.companies.id, companyId)).limit(1);
  if (!company) throw new Error("Company not found");

  const website = company.website ?? (await findOfficialWebsite(company.name));
  if (!website) return { website: null, pages: 0 };
  if (!company.website) {
    await d.update(tables.companies).set({ website }).where(eq(tables.companies.id, companyId));
  }

  const date = today();
  const pack = await readCompanySite(website, date);
  if (!pack) return { website, pages: 0 };

  await d
    .delete(tables.companyInputs)
    .where(and(eq(tables.companyInputs.companyId, companyId), like(tables.companyInputs.filename, `${SITE_INPUT_PREFIX}%`)));
  await d.insert(tables.companyInputs).values({
    companyId,
    filename: `${SITE_INPUT_PREFIX}${date}.md`,
    content: pack.markdown,
    createdBy: userId,
  });
  return { website: pack.website, pages: pack.pages.length };
}

/** When no website was entered: one small search for the official domain. */
async function findOfficialWebsite(name: string): Promise<string | null> {
  const tool: Anthropic.Messages.Tool = {
    name: "save_website",
    description: "Save the company's official website URL, or an empty string if not found.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  };
  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: `What is the official website of the company "${name}"? Search, then call save_website with its homepage URL (not a social profile, directory or news page).`,
    },
  ];
  try {
    for (let round = 0; round < 3; round++) {
      const msg = await getAnthropicClient().messages.create({
        model: RESEARCH_MODEL,
        max_tokens: 1500,
        messages,
        tools: [{ type: "web_search_20260318", name: "web_search", max_uses: 2, allowed_callers: ["direct"] }, tool],
      });
      const call = msg.content.find(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === "save_website"
      );
      if (call) {
        const url = String((call.input as { url?: string }).url ?? "").trim();
        return /^https?:\/\//i.test(url) ? url : null;
      }
      if (msg.stop_reason !== "pause_turn") return null;
      messages.push({ role: "assistant", content: msg.content });
    }
  } catch (err) {
    console.warn("[company-intel] website lookup failed:", err);
  }
  return null;
}
