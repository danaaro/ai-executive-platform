import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { getAnthropicClient } from "@/shared/anthropic-client";
import { MODELS } from "@/shared/models";
import { checkInterviews, checkScreen } from "@/shared/kit-checks";
import type { CompetencyOption, KitPart, PartResult, RoleLevel } from "@/shared/interview-kit-types";

/**
 * Interview Kit engine (Step 2). Implements the runtime contract of Susan's
 * Hiring Toolkit PRD v1.1 §7: her prompt files are loaded from disk and
 * assembled, never paraphrased; the assembled prompt is the system prompt; the
 * inputs travel in the user message as INPUT BLOCK A; the answer is parsed,
 * validated against her JSON schemas and her §10 checks, with one repair call.
 *
 * The platform guardrails (prompts/system/guardrails.md) are deliberately NOT
 * prepended: they are written for chat agents and answer an off-topic request
 * with a polite sentence, which would break a JSON-only output. Susan's own
 * `safety` partial carries the same protections for this task.
 *
 * Server-only: everything here reads the method files, which never reach the
 * browser (CLAUDE.md, Susan's PRD §9).
 */

const KIT_DIR = path.join(process.cwd(), "products/interview-intelligence/prompts/hiring-toolkit");
export const KIT_PROMPT_VERSION = "hiring-toolkit v1.1 (2026-10-31)";

const fileCache = new Map<string, string>();
function readKitFile(rel: string): string {
  let text = fileCache.get(rel);
  if (text === undefined) {
    text = fs.readFileSync(path.join(KIT_DIR, rel), "utf-8");
    fileCache.set(rel, text);
  }
  return text;
}
const dropLeadingComment = (s: string) => s.replace(/^\s*<!--[\s\S]*?-->\s*/, "");

/* ---------------- The Leadership framework ---------------------------------- */

export type Competency = CompetencyOption & {
  definition: string;
  areas: string[];
  evidence: string;
  rubric: Record<"Limited" | "Borderline" | "Solid" | "Outstanding", string>;
  questions: string[];
};
type Framework = {
  scale: Record<string, string>;
  calibration: Record<RoleLevel, { scope: string; level3: string; evidence: string }>;
  competencies: Competency[];
};
let fw: Framework | null = null;
export function framework(): Framework {
  if (!fw) fw = JSON.parse(readKitFile("data/leadership_framework.json")) as Framework;
  return fw;
}
export function competencyOptions(): CompetencyOption[] {
  return framework().competencies.map(({ no, name, cluster, core }) => ({ no, name, cluster, core }));
}
export const coreCompetencies = () => framework().competencies.filter((c) => c.core).map((c) => c.no);

const LEVELS = ["Limited", "Borderline", "Solid", "Outstanding"] as const;

function entry(c: Competency): string {
  const qs = c.questions.length
    ? c.questions.join(" / ")
    : "none in the framework; write 3 role-specific past-behaviour questions";
  const rub = LEVELS.map((l) => `${l}: ${c.rubric[l]}`).join(" | ");
  return (
    `[${c.no}] ${c.name}${c.core ? " (core)" : ""} · Cluster: ${c.cluster}\n` +
    `Definition: ${c.definition}\nAreas to assess: ${c.areas.join(" · ")}\nEvidence: ${c.evidence}\n` +
    `Rubric: ${rub}\nInterview questions: ${qs}`
  );
}

/**
 * The LEADERSHIP SELECTION block for {{leadership_selection}} — a line-for-line
 * port of Susan's scripts/build_leadership_block.py (PRD §5.5: "the app must
 * produce identical text").
 */
export function leadershipBlock(opts: { roleLevel: RoleLevel; competencies: number[]; suggest: boolean }): string {
  const { competencies: comps, calibration, scale } = framework();
  const cal = calibration[opts.roleLevel];
  if (!cal) throw new Error(`Unknown role level: ${opts.roleLevel}`);
  const known = new Set(comps.map((c) => c.no));
  const sel = opts.competencies.length ? opts.competencies : coreCompetencies();
  const unknown = sel.filter((n) => !known.has(n));
  if (unknown.length) throw new Error(`Unknown competency numbers: ${unknown.join(", ")}`);
  const scaleText = Object.entries(scale)
    .map(([k, v]) => `${k} = ${v}`)
    .join(" ");
  const mode = opts.suggest
    ? 'SUGGEST (keep every selected competency and add the 2-3 from the catalogue that this role most requires, with a "why"; mark them role-specific)'
    : "SELECTED (assess exactly these competencies, no others)";
  let t =
    `LEADERSHIP SELECTION (from the SP&P Executive Leadership & Future Readiness Framework)\n` +
    `Role level: ${opts.roleLevel}. Scope of impact: ${cal.scope}. Expected at level 3 (Solid): ${cal.level3}. Typical evidence: ${cal.evidence}.\n` +
    `Scale: ${scaleText}\nMode: ${mode}\n\nSELECTED COMPETENCIES\n` +
    comps
      .filter((c) => sel.includes(c.no))
      .map(entry)
      .join("\n\n");
  if (opts.suggest) {
    t +=
      "\n\nCATALOGUE (the other competencies, to choose from)\n" +
      comps
        .filter((c) => !sel.includes(c.no))
        .map(entry)
        .join("\n\n");
  }
  return t;
}

/* ---------------- Prompt assembly (PRD §7) ---------------------------------- */

const PART_FILE: Record<KitPart, string> = {
  screen: "pack_recruiter_screen.md",
  interviews: "pack_interviews.md",
};

export function assemblePrompt(
  part: KitPart,
  vars: { company: string; language: string; leadershipSelection?: string }
): string {
  let t = dropLeadingComment(readKitFile(PART_FILE[part]));
  t = t.replace(/\{\{>\s*(\w+)\s*\}\}/g, (_, name: string) => readKitFile(`partials/${name}.md`).trim());
  const fill: Record<string, string> = {
    company: vars.company,
    company_upper: vars.company.toUpperCase(),
    language: vars.language,
    leadership_selection: vars.leadershipSelection ?? "",
  };
  t = t.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in fill ? fill[k] : m));
  if (t.includes("{{")) throw new Error(`Prompt assembly left a placeholder in ${PART_FILE[part]}`);
  return t;
}

/** Part 1: fixed text, only the company filled in. Never generated. */
export function howWeAssess(company: string): string {
  return dropLeadingComment(readKitFile("how_we_assess.md")).split("{{company}}").join(company).trim();
}

export const INPUT_LIMITS = { jd: 60_000, intelligence: 80_000, notes: 10_000 };

/** INPUT BLOCK A (PRD §7.1). */
export function inputBlockA(opts: { roleAndLevel: string; jd: string; intelligence: string; notes: string }): string {
  return [
    "<job_description>",
    `Role and level: ${opts.roleAndLevel.trim() || "[from the job description]"}`,
    opts.jd.slice(0, INPUT_LIMITS.jd),
    "</job_description>",
    "<company_intelligence>",
    (opts.intelligence.trim() || "None provided").slice(0, INPUT_LIMITS.intelligence),
    "</company_intelligence>",
    "<notes>",
    (opts.notes.trim() || "None").slice(0, INPUT_LIMITS.notes),
    "</notes>",
  ].join("\n");
}

/* ---------------- JSON handling (PRD §7.5) ---------------------------------- */

export function parseJsonObject(text: string): unknown {
  const s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no JSON object in the answer");
  return JSON.parse(s.slice(a, b + 1));
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = new Map<KitPart, ReturnType<typeof ajv.compile>>();
function schemaErrors(part: KitPart, data: unknown): string[] {
  let v = validators.get(part);
  if (!v) {
    const file = part === "screen" ? "schemas/recruiter_screen.schema.json" : "schemas/interviews.schema.json";
    v = ajv.compile(JSON.parse(readKitFile(file)));
    validators.set(part, v);
  }
  if (v(data)) return [];
  return (v.errors ?? []).slice(0, 30).map((e) => `schema: ${e.instancePath || "/"} ${e.message ?? "is invalid"}`);
}

/** Schema + Susan's §10 checks. Hard failures and warnings. */
export function evaluate(part: KitPart, data: unknown): { failures: string[]; warnings: string[] } {
  const schema = schemaErrors(part, data);
  if (schema.length) return { failures: schema, warnings: [] };
  return part === "screen" ? checkScreen(data as never) : checkInterviews(data as never, framework().competencies);
}

/* ---------------- Generation ------------------------------------------------ */

const MAX_TOKENS: Record<KitPart, number> = { screen: 24_000, interviews: 32_000 };

async function streamCall(
  part: KitPart,
  system: string,
  user: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<{ text: string; truncated: boolean }> {
  const stream = await getAnthropicClient().messages.create(
    {
      model: MODELS.KIT_WRITER,
      max_tokens: MAX_TOKENS[part],
      output_config: { effort: "medium" },
      system,
      messages: [{ role: "user", content: user }],
      stream: true,
    },
    { signal }
  );
  let text = "";
  let stop: string | null = null;
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
      text += event.delta.text;
      onDelta(event.delta.text);
    } else if (event.type === "message_delta") stop = event.delta.stop_reason ?? stop;
  }
  return { text, truncated: stop === "max_tokens" };
}

/** Only repair when there is time left inside the 300 s function budget. */
const REPAIR_DEADLINE_MS = 130_000;

/**
 * Writes one part: generate → parse → validate + check → (one repair call) →
 * result. Never throws on bad model output: an unusable answer comes back as a
 * `failed` result with the raw text, so the user sees it and can regenerate.
 */
export async function writePart(
  part: KitPart,
  system: string,
  user: string,
  onDelta: (text: string) => void,
  onReset: () => void
): Promise<PartResult> {
  const started = Date.now();
  const first = await streamCall(part, system, user, onDelta);
  let text = first.text;
  let truncated = first.truncated;
  let data: unknown = null;
  let checks = { failures: [] as string[], warnings: [] as string[] };
  try {
    data = parseJsonObject(text);
    checks = evaluate(part, data);
  } catch {
    checks = { failures: ["The answer could not be read as JSON."], warnings: [] };
  }

  let repaired = false;
  if (checks.failures.length && !truncated && Date.now() - started < REPAIR_DEADLINE_MS) {
    onReset();
    const repairUser = [
      user,
      "<previous_output>",
      text,
      "</previous_output>",
      "<problems>",
      checks.failures.map((f) => `- ${f}`).join("\n"),
      "</problems>",
      "Return the full corrected JSON object only.",
    ].join("\n");
    try {
      const second = await streamCall(part, system, repairUser, onDelta);
      const fixed = parseJsonObject(second.text);
      const fixedChecks = evaluate(part, fixed);
      if (fixedChecks.failures.length <= checks.failures.length) {
        text = second.text;
        data = fixed;
        checks = fixedChecks;
        truncated = second.truncated;
        repaired = true;
      }
    } catch {
      /* keep the first answer and its list of problems */
    }
  }

  const usable = data !== null && typeof data === "object" && !checks.failures.some((f) => f.startsWith("schema:") || f.includes("JSON"));
  return {
    status: usable ? "done" : "failed",
    data: usable ? (data as PartResult["data"]) : null,
    raw: usable ? undefined : text,
    failures: checks.failures,
    warnings: checks.warnings,
    truncated,
    repaired,
    ms: Date.now() - started,
  };
}
