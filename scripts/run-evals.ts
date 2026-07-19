/**
 * Eval runner (build-queue step 5): runs every golden case in
 * products/interview-intelligence/evals/cases/cases.json against the REAL
 * agent runtime (same system-prompt assembly the app serves), applies
 * structural checks, grades outputs with an LLM judge against each case's
 * rubric, and fires guardrail probes. Results land in generated/evals/.
 *
 *   npx tsx scripts/run-evals.ts [--only slug] [--skip-judge]
 */
import fs from "node:fs";
import path from "node:path";
import { AGENT_REGISTRY, runAgentTurn, type ChatMessage } from "../src/orchestrator/agent-orchestrator";
import { getAnthropicClient, DEFAULT_MODEL } from "../src/shared/anthropic-client";

// --- env: load .env.local the way Next.js would (KEY=VALUE lines) ---
const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const EVALS_ROOT = path.join(process.cwd(), "products/interview-intelligence/evals");

type StructuralCheck = {
  name: string;
  regex?: string;
  scope?: string; // "final" (default) | "all" | "reply:<i>"
  type?: "regex" | "tableRowCount" | "maxOccurrences";
  expected?: number;
  max?: number;
};
type EvalCase = {
  slug: string;
  name: string;
  description?: string;
  userTurns: string[];
  structuralChecks: StructuralCheck[];
  rubric: string[];
};

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(EVALS_ROOT, "fixtures", `${name}.md`), "utf-8");
}

function interpolate(text: string): string {
  return text.replace(/\{\{fixture:([a-z0-9-]+)\}\}/g, (_, name) => loadFixture(name));
}

/** Count data rows across all markdown tables (rows that aren't header/separator). */
function countTableRows(text: string): number {
  let count = 0;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l.startsWith("|")) continue;
    if (/^\|[\s:-]+\|/.test(l.replace(/\|/g, "|").replace(/[^|\s:-]/g, "x")) && /^[|\s:-]+$/.test(l)) continue; // separator
    // header row = the row immediately before a separator row
    const next = (lines[i + 1] ?? "").trim();
    if (/^[|\s:-]+$/.test(next) && next.includes("-")) continue;
    count++;
  }
  return count;
}

function runStructuralCheck(check: StructuralCheck, replies: string[]): boolean {
  let target = replies[replies.length - 1] ?? "";
  if (check.scope === "all") target = replies.join("\n\n");
  else if (check.scope?.startsWith("reply:")) {
    const i = Number(check.scope.slice(6));
    target = replies[i] ?? "";
  }
  if (check.type === "tableRowCount") return countTableRows(target) === check.expected;
  if (check.type === "maxOccurrences") {
    const n = (target.match(new RegExp(check.regex!, "gis")) ?? []).length;
    return n > 0 && n <= (check.max ?? Infinity);
  }
  return new RegExp(check.regex!, "is").test(target);
}

type JudgeResult = { criteria: { name: string; score: number; evidence: string }[] };

async function judge(caseDef: EvalCase, replies: string[]): Promise<JudgeResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await judgeOnce(caseDef, replies);
    } catch (err) {
      if (attempt >= 2) throw err;
      console.warn(`  judge parse retry for ${caseDef.slug}: ${(err as Error).message}`);
    }
  }
}

async function judgeOnce(caseDef: EvalCase, replies: string[]): Promise<JudgeResult> {
  const rubricList = caseDef.rubric.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const transcript = replies
    .map((r, i) => `--- ASSISTANT REPLY ${i + 1} ---\n${r}`)
    .join("\n\n");
  const res = await getAnthropicClient().messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 3000,
    thinking: { type: "disabled" },
    system:
      "You are a strict QA judge for an executive-search AI platform. Score the assistant output " +
      "against each rubric criterion from 0 (complete failure) to 10 (flawless). Be demanding: 8+ " +
      "means genuinely production-grade for a premium search firm. Judge ONLY what is in the output. " +
      'Reply with JSON only: {"criteria":[{"name":"<short name>","score":<0-10>,"evidence":"<one sentence>"}]}',
    messages: [
      {
        role: "user",
        content: `Agent under test: ${caseDef.slug} (case: ${caseDef.name})\n\nRubric:\n${rubricList}\n\nOutput to judge:\n\n${transcript}`,
      },
    ],
  });
  const text = res.content.find((b) => b.type === "text");
  const raw = text && text.type === "text" ? text.text : "{}";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}") as JudgeResult;
  if (!Array.isArray(parsed.criteria) || parsed.criteria.length === 0) {
    throw new Error("judge JSON missing criteria[]");
  }
  return parsed;
}

async function runCase(caseDef: EvalCase, skipJudge: boolean) {
  const messages: ChatMessage[] = [];
  const replies: string[] = [];
  for (const turn of caseDef.userTurns) {
    messages.push({ role: "user", content: interpolate(turn) });
    const reply = await runAgentTurn(caseDef.slug, messages);
    messages.push({ role: "assistant", content: reply });
    replies.push(reply);
  }

  const structural = caseDef.structuralChecks.map((c) => ({
    name: c.name,
    pass: runStructuralCheck(c, replies),
  }));
  const structuralScore =
    structural.length > 0 ? structural.filter((s) => s.pass).length / structural.length : 1;

  let judgeResult: JudgeResult = { criteria: [] };
  if (!skipJudge) {
    try {
      judgeResult = await judge(caseDef, replies);
    } catch (err) {
      console.error(`  judge failed for ${caseDef.slug}:`, (err as Error).message);
    }
  }
  const judgeScore =
    judgeResult.criteria.length > 0
      ? judgeResult.criteria.reduce((a, c) => a + c.score, 0) / (judgeResult.criteria.length * 10)
      : null;

  const combined =
    judgeScore === null ? structuralScore : 0.4 * structuralScore + 0.6 * judgeScore;

  return {
    slug: caseDef.slug,
    name: caseDef.name,
    structural,
    structuralScore,
    judge: judgeResult.criteria,
    judgeScore,
    score: combined,
    replies,
  };
}

type GuardrailConfig = {
  refusalSentence: string;
  leakMarkers: string[];
  agents: string[];
  probes: { name: string; text: string }[];
};

async function runGuardrails(cfg: GuardrailConfig) {
  const results: { agent: string; probe: string; pass: boolean; reply: string }[] = [];
  for (const agent of cfg.agents) {
    for (const probe of cfg.probes) {
      const reply = await runAgentTurn(agent, [{ role: "user", content: probe.text }]);
      const refused = reply.includes(cfg.refusalSentence);
      const leaked = cfg.leakMarkers.some((m) => reply.includes(m));
      results.push({ agent, probe: probe.name, pass: refused && !leaked, reply });
      console.log(`  guardrail ${agent} / ${probe.name}: ${refused && !leaked ? "PASS" : "FAIL"}`);
    }
  }
  return results;
}

async function main() {
  const only = process.argv.includes("--only")
    ? process.argv[process.argv.indexOf("--only") + 1]
    : null;
  const skipJudge = process.argv.includes("--skip-judge");

  const spec = JSON.parse(
    fs.readFileSync(path.join(EVALS_ROOT, "cases", "cases.json"), "utf-8")
  );
  let cases: EvalCase[] = spec.cases;
  if (only) cases = cases.filter((c) => c.slug === only);

  for (const c of cases) {
    if (!AGENT_REGISTRY.some((a) => a.slug === c.slug)) {
      throw new Error(`Case references unknown agent: ${c.slug}`);
    }
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const outDir = path.join(process.cwd(), "generated", "evals", `run-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Running ${cases.length} agent cases (concurrency 3)…`);
  const results: Awaited<ReturnType<typeof runCase>>[] = [];
  const queue = [...cases];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (queue.length > 0) {
        const c = queue.shift()!;
        console.log(`  running ${c.slug} (${c.name})…`);
        try {
          const r = await runCase(c, skipJudge);
          console.log(
            `  done ${c.slug}: structural ${(r.structuralScore * 100).toFixed(0)}% · judge ${r.judgeScore === null ? "n/a" : (r.judgeScore * 100).toFixed(0) + "%"}`
          );
          results.push(r);
        } catch (err) {
          console.error(`  CASE ERROR ${c.slug}:`, (err as Error).message);
          results.push({
            slug: c.slug, name: c.name, structural: [], structuralScore: 0,
            judge: [], judgeScore: 0, score: 0, replies: [`ERROR: ${(err as Error).message}`],
          });
        }
      }
    })
  );

  console.log("Running guardrail probes…");
  const guardrails = only ? [] : await runGuardrails(spec.guardrailProbes);

  const agentAvg = results.reduce((a, r) => a + r.score, 0) / Math.max(results.length, 1);
  const guardrailScore =
    guardrails.length > 0 ? guardrails.filter((g) => g.pass).length / guardrails.length : null;

  const summary = {
    ranAt: new Date().toISOString(),
    model: DEFAULT_MODEL,
    agentAvg,
    guardrailScore,
    results: results.map(({ replies, ...r }) => r),
    guardrails: guardrails.map(({ reply, ...g }) => g),
  };
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(summary, null, 2));
  // Full transcripts for debugging, separate file (they're large).
  fs.writeFileSync(
    path.join(outDir, "transcripts.json"),
    JSON.stringify({ results, guardrails }, null, 2)
  );

  const lines: string[] = [
    `# Eval run — ${summary.ranAt}`,
    ``,
    `Model: ${DEFAULT_MODEL} · Agent quality avg: **${(agentAvg * 100).toFixed(1)}%** · Guardrails: **${guardrailScore === null ? "n/a" : (guardrailScore * 100).toFixed(0) + "%"}**`,
    ``,
    `| Agent | Case | Structural | Judge | Combined |`,
    `|---|---|---|---|---|`,
    ...results
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map(
        (r) =>
          `| ${r.slug} | ${r.name} | ${(r.structuralScore * 100).toFixed(0)}% (${r.structural.filter((s) => s.pass).length}/${r.structural.length}) | ${r.judgeScore === null ? "n/a" : (r.judgeScore * 100).toFixed(0) + "%"} | **${(r.score * 100).toFixed(0)}%** |`
      ),
    ``,
    `## Failed structural checks`,
    ...results.flatMap((r) =>
      r.structural.filter((s) => !s.pass).map((s) => `- ${r.slug}: ${s.name}`)
    ),
    ``,
    `## Judge lowlights (score ≤ 6)`,
    ...results.flatMap((r) =>
      r.judge.filter((j) => j.score <= 6).map((j) => `- ${r.slug} · ${j.name} (${j.score}/10): ${j.evidence}`)
    ),
    ``,
    `## Guardrails`,
    ...guardrails.map((g) => `- ${g.agent} / ${g.probe}: ${g.pass ? "PASS" : "**FAIL**"}`),
  ];
  fs.writeFileSync(path.join(outDir, "report.md"), lines.join("\n"));
  console.log(`\nAgent quality avg: ${(agentAvg * 100).toFixed(1)}%`);
  if (guardrailScore !== null) console.log(`Guardrails: ${(guardrailScore * 100).toFixed(0)}%`);
  console.log(`Report: ${path.relative(process.cwd(), path.join(outDir, "report.md"))}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
