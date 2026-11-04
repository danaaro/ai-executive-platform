import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Interview Kit engine checks (PRD §7, §9 step 1).
 *
 *   npm run test:interview-kit          offline: prompt assembly, leadership block = Susan's Python
 *   npm run test:interview-kit -- --live  + both parts on a real COREX job description from the
 *                                         database (Opus 5.5), timed, and Susan's check_pack.py run
 *                                         on the output to confirm the TypeScript port agrees.
 *
 * The Python reference scripts live in input/hiring-toolkit/scripts (parent workspace).
 */

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TOOLKIT = path.join(process.cwd(), "../input/hiring-toolkit");
let failed = 0;
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
  if (!cond) failed++;
};

async function main() {
  loadEnv();
  const kit = await import("../src/orchestrator/interview-kit");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kit-"));

  // 1. Leadership block identical to build_leadership_block.py, in both modes and levels.
  const cases = [
    { role_level: "N-1 executive", competencies: [5, 6, 11, 14, 17, 7, 8, 10], suggest: false },
    { role_level: "C-level", competencies: [5, 6, 11, 14, 17], suggest: true },
  ] as const;
  for (const c of cases) {
    const file = path.join(tmp, "sel.json");
    fs.writeFileSync(file, JSON.stringify(c));
    const py = execFileSync("python3", ["-I", path.join(TOOLKIT, "scripts/build_leadership_block.py"), file], { encoding: "utf-8" }).replace(/\n$/, "");
    const ts = kit.leadershipBlock({ roleLevel: c.role_level, competencies: [...c.competencies], suggest: c.suggest });
    ok(py === ts, `leadership block identical to Python (${c.role_level}, suggest=${c.suggest})`);
  }

  // 2. Prompt assembly leaves no placeholder and keeps Susan's text.
  const screen = kit.assemblePrompt("screen", { company: "COREX", language: "English" });
  const inter = kit.assemblePrompt("interviews", { company: "COREX", language: "English", leadershipSelection: "LEADERSHIP SELECTION test" });
  ok(!screen.includes("{{") && !inter.includes("{{"), "assembled prompts have no placeholders");
  ok(screen.includes("THE SP&P ASSESSMENT FRAMEWORK") && screen.includes("CONFIDENTIALITY AND SAFETY"), "screen prompt carries framework + safety partials");
  ok(inter.includes("LEADERSHIP SELECTION test") && inter.includes("COREX CONTEXT"), "interviews prompt carries selection + company");
  ok(!kit.howWeAssess("COREX").includes("{{") && kit.howWeAssess("COREX").includes("COREX CONTEXT"), "How we assess filled with the company");

  if (process.argv.includes("--live")) {
    const { adminDb, tables } = await import("../src/db");
    const { and, eq, ilike, desc } = await import("drizzle-orm");
    const { cleanDeliverable } = await import("../src/shared/clean-deliverable");
    const [jd] = await adminDb()
      .select({ content: tables.artifacts.content })
      .from(tables.artifacts)
      .where(and(eq(tables.artifacts.agentSlug, "job-description"), ilike(tables.artifacts.content, "%COREX%")))
      .orderBy(desc(tables.artifacts.createdAt))
      .limit(1);
    if (!jd) throw new Error("No COREX job description in the database");
    const user = kit.inputBlockA({ roleAndLevel: "", jd: cleanDeliverable(jd.content), intelligence: "", notes: "" });
    const parts = await Promise.all(
      (["screen", "interviews"] as const).map(async (part) => {
        const system = kit.assemblePrompt(part, {
          company: "COREX",
          language: "English",
          leadershipSelection: part === "interviews" ? kit.leadershipBlock({ roleLevel: "N-1 executive", competencies: [5, 6, 11, 14, 17], suggest: true }) : undefined,
        });
        let chars = 0;
        const r = await kit.writePart(part, system, user, (t) => (chars += t.length), () => (chars = 0));
        console.log(`      ${part}: ${r.status} in ${(r.ms / 1000).toFixed(0)} s, ${chars} chars, repaired=${r.repaired}, truncated=${r.truncated}`);
        for (const f of r.failures) console.log(`        fail: ${f}`);
        for (const w of r.warnings.slice(0, 8)) console.log(`        warn: ${w}`);
        ok(r.status === "done", `${part} written and parsed`);
        ok(r.ms < 280_000, `${part} under the 300 s function budget`);
        if (r.data) fs.writeFileSync(path.join(tmp, `${part}.json`), JSON.stringify(r.data, null, 1));
        return r;
      })
    );
    if (parts.every((p) => p.data)) {
      let out = "";
      try {
        out = execFileSync("python3", [path.join(TOOLKIT, "scripts/check_pack.py"), path.join(tmp, "screen.json"), path.join(tmp, "interviews.json")], { encoding: "utf-8" });
      } catch (e) {
        out = String((e as { stdout?: string }).stdout ?? "");
      }
      const pyFails = Number(/(\d+) failures/.exec(out)?.[1] ?? -1);
      const tsFails = parts.reduce((s, p) => s + p.failures.length, 0);
      ok(pyFails === tsFails, `check port agrees with check_pack.py (${tsFails} vs ${pyFails} failures)`);
      console.log(`      output kept in ${tmp}`);
    }
  }

  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
