/**
 * Company Intelligence v3 writers (ADR-009 §18).
 *
 * Susan's Exec10X Master Prompt, split across four writers so each request
 * stays well under Vercel's 300-second limit (one call took 453s):
 *   wave 1, parallel: company · market · culture
 *   wave 2:           skills (sees wave 1's merged findings register)
 * Each writer reads the SAVED research only (no web tools) and saves its part
 * as a `section` row. runCockpit() merges the parts in code (src/shared/exec10x.ts)
 * and saves the report only if Susan's validator passes.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gt, max, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import {
  EXEC10X_WAVE1,
  EXEC10X_WRITERS,
  EXEC10X_WRITER_IDS,
  cockpitToMarkdown,
  decodePart,
  exec10xWriterSchema,
  makeSourceCheck,
  mergeAll,
  registerFingerprint,
  validatePart,
  type Exec10xWriterId,
  type Part,
} from "@/shared/exec10x";
import { latestResearch, loadInputs, read, runToCompletion, today } from "./company-intel";

const PROMPT = "prompts/company-intel/exec10x-master-prompt.md";

/** The run's parts were rejected (missing, failed checks, research drift): write them again. */
export class CockpitRejected extends Error {}
const MAX_TOKENS = 32000;
/**
 * Sonnet 5.5 (Dana, 2026-10-10): Opus 5.5 wrote at ~43 tokens/s on the first live
 * run, so its writers took 400–840s — far past the 300s function limit.
 */
const COCKPIT_MODEL = "claude-sonnet-5-5";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Susan's "D Mon YYYY" (ICU's en-GB writes "Sept", so not toLocaleDateString). */
const asOf = (d = new Date()) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

function addendum(w: Exec10xWriterId) {
  const mine = EXEC10X_WRITERS[w].fields.join(", ");
  const others = EXEC10X_WRITER_IDS.filter((x) => x !== w)
    .map((x) => `${EXEC10X_WRITERS[x].label} (${EXEC10X_WRITERS[x].fields.join(", ")})`)
    .join("; ");
  return `

=====================================================================
PLATFORM RULES FOR THIS RUN (they override sections 2, 12 and 13.2 where they differ)
=====================================================================
- You are ONE of four writers producing one cockpit. You write ONLY these schema sections: ${mine}. The other writers cover: ${others}. Do not repeat their content.
- You have no web access and no file tools. The research files in the user message were collected from public sources, and every fact in them carries [source, date] with URLs. They are your ONLY evidence; do not research further. Where they are silent, say so, code it U or H, and give it an \`ask\`.
- Deliver by calling the \`save_part\` tool exactly once with your sections plus \`findings\` and \`sources\`. Do not write JSON as text and skip the section-12 summary. Ignore every instruction about exec10x-template.html, build.py, seloger.json or HTML.
- Findings and sources: list the findings your sections rest on (F1, F2, …) and their sources (S1, S2, …). Copy each source URL EXACTLY as it appears in a research file. A source whose URL isn't in the research is removed, and its findings become Unknown. For a fact from an uploaded document, give the document's filename as the source title and leave url empty.
- **No gap is ever dropped.** Every item you code U, H or P carries \`ask\`: the one client question that would settle it. Use null for \`ask\` on V, I and C items.
- Search-partner input: only an uploaded document clearly marked as partner notes counts as search-partner input (code P). There is none unless the input list says so.
- Keep within the length guide in section 9; the cockpit must stay scannable.`;
}

/**
 * One read of the saved research and inputs per request: the writer's evidence
 * (its modules) and the traceability corpus (all research + inputs).
 */
async function evidence(companyId: string, w?: Exec10xWriterId) {
  const [all, inputs] = await Promise.all([latestResearch(companyId), loadInputs(companyId)]);
  const mods = w ? EXEC10X_WRITERS[w].modules : "all";
  const research = mods === "all" ? all : all.filter((r) => mods.includes(r.module));
  const text = research.map((r) => `<research_file name="${r.module}.md">\n${r.content}\n</research_file>`).join("\n\n");
  const researchText = all.map((r) => r.content).join("\n\n");
  const corpus = [researchText, ...inputs.map((f) => f.content)].join("\n\n");
  // A document counts as a source only if the research actually cites it (the
  // writers never read uploads directly; research does).
  const cited = inputs.map((f) => f.filename).filter((name) => researchText.toLowerCase().includes(name.toLowerCase()));
  const check = makeSourceCheck(corpus, cited);
  return { research, text, inputs, check };
}

export async function loadRunParts(companyId: string, runId: string): Promise<Part[]> {
  return (await loadRun(companyId, runId)).parts;
}

async function loadRun(companyId: string, runId: string) {
  const rows = await db()
    .select()
    .from(tables.companyOutputs)
    .where(and(eq(tables.companyOutputs.companyId, companyId), eq(tables.companyOutputs.runId, runId), eq(tables.companyOutputs.kind, "section")))
    .orderBy(desc(tables.companyOutputs.createdAt));
  const parts: Part[] = [];
  let register: unknown = null;
  for (const r of rows) {
    const d = r.data as { generation?: number; writer?: Exec10xWriterId; part?: unknown; register?: unknown; failed?: boolean } | null;
    if (d?.generation !== 3 || d.failed || !d.writer || parts.some((p) => p.writer === d.writer)) continue; // newest per writer
    parts.push({ writer: d.writer, data: d.part });
    if (d.register) register = d.register;
  }
  return { parts, register };
}

export async function runExec10xWriter(opts: {
  companyId: string;
  writer: Exec10xWriterId;
  runId: string;
  userId: string;
  onText?: (t: string) => void;
}) {
  const d = db();
  const [company] = await d.select().from(tables.companies).where(eq(tables.companies.id, opts.companyId)).limit(1);
  if (!company) throw new Error("Company not found");
  const { research, text, inputs, check } = await evidence(company.id, opts.writer);
  if (!research.length) throw new Error("No saved research yet for this company");
  const def = EXEC10X_WRITERS[opts.writer];

  let wave1 = "";
  let register: ReturnType<typeof mergeAll>["register"] | null = null;
  if (def.wave === 2) {
    const parts = await loadRunParts(company.id, opts.runId);
    const missing = EXEC10X_WAVE1.filter((w) => !parts.some((p) => p.writer === w));
    if (missing.length) throw new Error(`Write ${missing.map((w) => EXEC10X_WRITERS[w].label).join(", ")} first`);
    // Show the sections AFTER merging, so card references already use the register's
    // F-numbers (the market writer numbered its own findings locally).
    const all = mergeAll(parts, check);
    const reg = (register = all.register);
    const merged = all.data as unknown as Record<string, unknown>;
    const sections: Record<string, unknown> = {};
    for (const w of EXEC10X_WAVE1) for (const f of EXEC10X_WRITERS[w].fields) sections[f] = merged[f];
    wave1 =
      `## The dashboard so far (written by the other writers — build on it, do not repeat it)\n\n` +
      "```json\n" + JSON.stringify(sections) + "\n```\n\n" +
      `## Findings register (final). Cite these IDs. In your \`findings\` list ONLY NEW findings, numbered from F${reg.findings.length + 1}; new sources from S${reg.sources.length + 1}. Never re-list or renumber these.\n\n` +
      "```json\n" + JSON.stringify(reg) + "\n```\n\n";
  }

  const system = read(PROMPT) + addendum(opts.writer);
  const user =
    `Company: ${company.name}\n${company.website ? `Website: ${company.website}\n` : ""}Today's date: ${today()} (asOf: "${asOf()}")\n` +
    `No role supplied. No search-partner input supplied unless a document below says so.\n\n` +
    `## Uploaded documents (only those the research cites are in your evidence)\n` +
    (inputs.length ? inputs.map((f) => `- ${f.filename}`).join("\n") : "- (none)") +
    `\n\n${wave1}## Research files (your ONLY evidence)\n\n${text}`;

  const res = await runToCompletion({
    model: COCKPIT_MODEL,
    system,
    user,
    maxTokens: MAX_TOKENS,
    effort: "medium",
    // No prompt cache: each writer has its own tool schema, which sits before the
    // system prompt in the cache prefix, so a cache write would never be read.
    cache: false,
    tools: [
      {
        name: "save_part",
        description: `Save your part of the Exec10X cockpit: ${def.fields.join(", ")}, plus findings and sources. Call exactly once.`,
        input_schema: exec10xWriterSchema(opts.writer) as Anthropic.Messages.Tool.InputSchema,
      },
    ],
    onText: opts.onText,
  });
  // A rejected attempt was still paid for: keep its usage (as a failed row the
  // merge ignores) so the cost lines stay true, then fail the writer.
  const reject = async (message: string): Promise<never> => {
    await d.insert(tables.companyOutputs).values({
      companyId: company.id,
      kind: "section",
      version: 0,
      mode: "full",
      runId: opts.runId,
      content: `section ${opts.writer} (failed)`,
      data: { generation: 3, writer: opts.writer, failed: true, error: message },
      usage: res.usage,
      createdBy: opts.userId,
    });
    throw new Error(message);
  };
  if (res.stopReason === "max_tokens") await reject(`${def.label} was cut off at the length limit. Please re-run`);
  if (res.stopReason === "refusal") await reject(`The model declined to write ${def.label}`);
  const call = res.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === "save_part");
  if (!call) return reject(`${def.label} came back empty. Please re-run`);
  const part = decodePart(call.input);
  // Missing or wrong-shape sections (e.g. an unparseable JSON string where an object
  // belongs) and the culture rules: rejected here, so only this writer re-runs.
  const broken = validatePart(opts.writer, part);
  if (broken.length) await reject(`${def.label} failed its checks (${broken.slice(0, 3).join("; ")}). Please re-run`);

  const [row] = await d
    .insert(tables.companyOutputs)
    .values({
      companyId: company.id,
      kind: "section",
      version: 0,
      mode: "full",
      runId: opts.runId,
      content: `section ${opts.writer}`,
      // The skills writer keeps the register it was shown, so assembly can prove
      // its F/S IDs still mean the same findings and sources.
      data: { generation: 3, writer: opts.writer, part, ...(register ? { register } : {}) },
      usage: res.usage,
      createdBy: opts.userId,
    })
    .returning();
  return { row };
}

/**
 * The newest unfinished run whose parts can be reused by a retry: written after
 * the latest research (so its evidence is current), within two days, with no
 * report yet. Lives on the server so a reload or another tab can resume it.
 */
export async function pendingCockpitRun(companyId: string): Promise<{ runId: string; done: Exec10xWriterId[] } | null> {
  const d = db();
  const since = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  const o = tables.companyOutputs;
  const [[latest], reports, sections] = await Promise.all([
    d.select({ at: max(tables.companyResearch.createdAt) }).from(tables.companyResearch).where(eq(tables.companyResearch.companyId, companyId)),
    d.select({ runId: o.runId }).from(o).where(and(eq(o.companyId, companyId), eq(o.kind, "report"), gt(o.createdAt, since))),
    // Only the small JSON fields, never the parts themselves.
    d
      .select({
        runId: o.runId,
        createdAt: o.createdAt,
        generation: sql<string | null>`${o.data}->>'generation'`,
        writer: sql<string | null>`${o.data}->>'writer'`,
        failed: sql<string | null>`${o.data}->>'failed'`,
        rejected: sql<string | null>`${o.data}->>'rejected'`,
      })
      .from(o)
      .where(and(eq(o.companyId, companyId), eq(o.kind, "section"), gt(o.createdAt, since)))
      .orderBy(desc(o.createdAt)),
  ]);
  const closed = new Set(reports.map((r) => r.runId));
  // A run assembly rejected must be written again, not resumed.
  for (const r of sections) if (r.rejected === "true") closed.add(r.runId);
  const researchAt = latest?.at ? new Date(latest.at).getTime() : 0;
  const v3 = sections.filter((r) => r.generation === "3" && r.runId && !closed.has(r.runId));
  if (!v3.length) return null;
  const runId = v3[0].runId!;
  const run = v3.filter((r) => r.runId === runId);
  if (run.some((r) => new Date(r.createdAt).getTime() < researchAt)) return null; // research changed since
  const done = [...new Set(run.filter((r) => r.failed !== "true" && r.writer).map((r) => r.writer as Exec10xWriterId))];
  return { runId, done };
}

/** Merges this run's four parts, validates, and saves the report. All or nothing. */
export async function runCockpit(opts: { companyId: string; runId: string; userId: string }) {
  const d = db();
  const [company] = await d.select().from(tables.companies).where(eq(tables.companies.id, opts.companyId)).limit(1);
  if (!company) throw new Error("Company not found");
  // Idempotent: if this run's report was already saved (the response was lost), return it.
  const [done] = await d
    .select()
    .from(tables.companyOutputs)
    .where(and(eq(tables.companyOutputs.companyId, company.id), eq(tables.companyOutputs.runId, opts.runId), eq(tables.companyOutputs.kind, "report")))
    .limit(1);
  if (done) return { row: done, validation: (done.data as { validation: ReturnType<typeof mergeAll>["data"]["validation"] }).validation };

  // Every rejection is recorded on the run, so it is never offered for resuming.
  const rejected = async (message: string): Promise<never> => {
    await d.insert(tables.companyOutputs).values({
      companyId: company.id,
      kind: "section",
      version: 0,
      mode: "full",
      runId: opts.runId,
      content: "assembly rejected",
      data: { generation: 3, rejected: true, error: message },
      createdBy: opts.userId,
    });
    throw new CockpitRejected(message);
  };

  const { parts, register } = await loadRun(company.id, opts.runId);
  const missing = EXEC10X_WRITER_IDS.filter((w) => !parts.some((p) => p.writer === w));
  if (missing.length) {
    return rejected(`${missing.map((w) => EXEC10X_WRITERS[w].label).join(", ")} missing from this run, so no report was saved. Please re-run`);
  }
  const { check } = await evidence(company.id);
  const { data, register: now } = mergeAll(parts, check);
  // If research changed while the run was writing, the skills writer's F/S IDs
  // could now point at different findings. Refuse rather than mis-attribute.
  if (registerFingerprint(now) !== registerFingerprint(register)) {
    return rejected("The saved research changed while this report was being written, so it wasn't saved. Please re-run");
  }
  if (data.validation.errors.length) {
    const top = data.validation.errors.slice(0, 4).join("; ");
    return rejected(`The report failed its checks, so it wasn't saved (the previous report is kept): ${top}`);
  }

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
      mode: "full",
      runId: opts.runId,
      content: cockpitToMarkdown(data, { company: company.name, builtOn: today() }),
      data,
      // Assembly makes no model call; the writers' usage is on their section rows (same runId).
      usage: { inputTokens: 0, outputTokens: 0, webSearches: 0, webFetches: 0, model: COCKPIT_MODEL, ms: 0 },
      createdBy: opts.userId,
    })
    .returning();
  await d.update(tables.companies).set({ updatedAt: new Date() }).where(eq(tables.companies.id, company.id));
  return { row, validation: data.validation };
}
