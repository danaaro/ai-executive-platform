import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

/**
 * Security scan: the checks that can be measured the same way every time
 * (the security-scan skill adds tests, live probes and a code review on top).
 *
 *   npm run security:scan            human-readable report
 *   npm run security:scan -- --json  findings as JSON (for the skill)
 *
 * READ ONLY. The database part runs SELECTs against DATABASE_URL (normally
 * the live database): row-level security, policies, grants. Nothing is
 * changed, no secret value is ever printed. Exit 1 if any HIGH finding.
 */

type Severity = "HIGH" | "MEDIUM" | "LOW" | "OK";
type Finding = { area: string; severity: Severity; check: string; detail: string; fix?: string };
const findings: Finding[] = [];
const add = (f: Finding) => findings.push(f);

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf-8");
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

function loadEnv() {
  if (!exists(".env.local")) return;
  for (const line of read(".env.local").split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function walk(dir: string, out: string[] = []): string[] {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

/* ---------------- 1 · Database: row-level security, policies, grants ---------------- */

/** Tables customers never reach (revoked from app_user); RLS on, no tenant policy needed. */
const ADMIN_ONLY_TABLES = new Set([
  "admin_audit",
  "security_flags",
  "intel_companies",
  "intel_company_inputs",
  "intel_company_research",
  "intel_company_outputs",
]);

async function databaseChecks() {
  if (!process.env.DATABASE_URL) {
    add({ area: "Database", severity: "MEDIUM", check: "database reachable", detail: "DATABASE_URL not set: RLS not checked" });
    return;
  }
  const host = /@([^:/]+)/.exec(process.env.DATABASE_URL)?.[1] ?? "?";
  const region = /aws-0-([a-z]+-[a-z]+-\d)/.exec(host)?.[1];
  add({
    area: "Database",
    severity: region?.startsWith("eu-") ? "OK" : "HIGH",
    check: "data region",
    detail: region ? `${region}${region.startsWith("eu-") ? " (EU)" : " (outside the EU)"}` : `host ${host.split(".")[0]}…`,
    fix: region?.startsWith("eu-") ? undefined : "Client data must stay in the EU Supabase region (CLAUDE.md).",
  });
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  try {
    const tables = await sql<{ name: string; rls: boolean; has_company: boolean }[]>`
      select c.relname as name, c.relrowsecurity as rls,
        exists (select 1 from information_schema.columns col
                where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'company_id') as has_company
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname not like '\\_\\_%' order by 1`;
    const policies = await sql<{ table: string; qual: string | null; check: string | null }[]>`
      select tablename as table, qual, with_check as check from pg_policies where schemaname = 'public'`;
    const grants = await sql<{ table: string; grantee: string }[]>`
      select table_name as table, grantee from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')`;
    const appUser = await sql<{ table: string; privilege: string }[]>`
      select table_name as table, privilege_type as privilege from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'app_user'`;

    for (const t of tables) {
      const tp = policies.filter((p) => p.table === t.name);
      // Policies compare company_id with app_company(), which reads app.company_id.
      const tenantPolicy = tp.some((p) => /company_id\s*=\s*(app_company\(\)|current_setting\('app\.company_id')/.test(`${p.qual ?? ""} ${p.check ?? ""}`));
      const customerReach = appUser.some((g) => g.table === t.name);
      if (!t.rls) {
        add({ area: "Database", severity: "HIGH", check: `RLS on ${t.name}`, detail: "row-level security is OFF", fix: "Enable RLS with a company policy in the same migration." });
      } else if (t.has_company && customerReach && !tenantPolicy) {
        add({ area: "Database", severity: "HIGH", check: `company policy on ${t.name}`, detail: "customers can reach it but no policy filters by app.company_id", fix: "Add a tenant_isolation policy on company_id." });
      } else if (ADMIN_ONLY_TABLES.has(t.name) && customerReach) {
        add({ area: "Database", severity: "HIGH", check: `${t.name} admin-only`, detail: "the customer role has privileges on an admin-only table", fix: "REVOKE ALL ON the table FROM app_user." });
      }
    }
    const rlsOn = tables.filter((t) => t.rls).length;
    add({ area: "Database", severity: "OK", check: "row-level security", detail: `${rlsOn}/${tables.length} tables have RLS on` });
    if (grants.length) {
      add({ area: "Database", severity: "HIGH", check: "anon/authenticated grants", detail: `${grants.length} grant(s): ${[...new Set(grants.map((g) => g.table))].join(", ")}`, fix: "Revoke: the Supabase public API must reach nothing." });
    } else add({ area: "Database", severity: "OK", check: "anon/authenticated grants", detail: "none (Supabase public API reaches nothing)" });
  } catch (err) {
    add({ area: "Database", severity: "MEDIUM", check: "database query", detail: `could not inspect: ${(err as Error).name}` });
  } finally {
    await sql.end();
  }
}

/* ---------------- 2 · Access control in the code ---------------- */

/** RLS-bypassing connection: allowed only here, each with its reason. Anything new is reported. */
const ADMIN_DB_ALLOWED: Record<string, string> = {
  "src/app/api/artifacts/[id]/download/route.ts": "client logo from admin-only Intel, after the access check",
  "src/app/api/job-description/voice-token/route.ts": "spoken opening line, after the access check",
  "src/orchestrator/role-context.ts": "role context incl. admin-only Intel, gated by callers' access check (moves into withTenant in S1)",
  "src/shared/kit-inputs.ts": "Company Intel report only (admin-only table), after kitAccess",
  "src/shared/current-user.ts": "session → company lookups before a company is known; user names",
  "src/shared/credits.ts": "admin back office (credits, company creation, audit log)",
  "src/shared/enter-company.ts": "super admin company switch",
  "src/shared/security-flags.ts": "writes security flags (admin-only table)",
  "src/shared/acting-audit.ts": "admin activity log",
  "src/shared/company-context.ts": "admin-only Intel attachment",
  "src/shared/jd-export.ts": "client logo URL (admin-only Intel)",
  "src/db/index.ts": "defines adminDb()",
  "src/orchestrator/company-intel.ts": "admin-only Company Intel tool; imported only by adminOr404 routes",
  "src/orchestrator/company-context-writers.ts": "admin-only Company Intel tool; imported only by adminOr404 routes",
  "src/orchestrator/exec10x-writers.ts": "admin-only Company Intel tool; imported only by adminOr404 routes",
};
const ADMIN_AREAS = /^src\/app\/(api\/(admin|company-intel)|internal)\//;

function accessChecks() {
  const files = [...walk("src/app/api"), ...walk("src/shared"), ...walk("src/orchestrator"), ...walk("src/db")];
  const unexplained: string[] = [];
  for (const f of files) {
    if (ADMIN_AREAS.test(f)) continue;
    const src = read(f);
    if (/\badminDb\s*\(|adminDb as /.test(src) && !(f in ADMIN_DB_ALLOWED)) unexplained.push(f);
  }
  if (unexplained.length) {
    add({ area: "Access control", severity: "MEDIUM", check: "RLS-bypassing connection (adminDb)", detail: `used without an allowlist reason in: ${unexplained.join(", ")}`, fix: "Read customer data inside withTenant(); or add the file with its reason to ADMIN_DB_ALLOWED after review." });
  } else add({ area: "Access control", severity: "OK", check: "RLS-bypassing connection (adminDb)", detail: `only in ${Object.keys(ADMIN_DB_ALLOWED).length} reviewed places` });

  const routes = walk("src/app/api").filter((f) => f.endsWith("route.ts") && !ADMIN_AREAS.test(f));
  const EXEMPT = /job-description\/voice-llm|upload-parse/;
  const bad: string[] = [];
  for (const r of routes) {
    if (EXEMPT.test(r)) continue;
    const src = read(r);
    const authed = /requireUser\(|kitAccess\(/.test(src);
    const scoped = /getProjectAccess|getConversationAccess|accessibleProjectIds|user\.companyId|kitAccess\(/.test(src);
    if (!authed || !scoped) bad.push(r.replace("src/app/api/", ""));
  }
  add(
    bad.length
      ? { area: "Access control", severity: "HIGH", check: "API routes check user + company", detail: bad.join(", "), fix: "Every route: requireUser, company/role access check on the server." }
      : { area: "Access control", severity: "OK", check: "API routes check user + company", detail: `${routes.length} customer routes checked` }
  );
  const adminRoutes = walk("src/app/api").filter((f) => f.endsWith("route.ts") && /^src\/app\/api\/(admin|company-intel)\//.test(f));
  const unguarded = adminRoutes.filter((f) => !/adminOr404|requireAdmin/.test(read(f)));
  add(
    unguarded.length
      ? { area: "Access control", severity: "HIGH", check: "admin routes guarded", detail: unguarded.join(", "), fix: "adminOr404() at the top of every handler." }
      : { area: "Access control", severity: "OK", check: "admin routes guarded", detail: `${adminRoutes.length} admin routes use adminOr404/requireAdmin` }
  );
}

/* ---------------- 3 · Secrets ---------------- */

function secretChecks() {
  const hook = ".claude/hooks/block-secrets.py";
  if (!exists(hook)) {
    add({ area: "Secrets", severity: "MEDIUM", check: "secrets hook", detail: "block-secrets.py missing", fix: "Restore the PreToolUse hook." });
    return;
  }
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf-8" }).split("\0").filter(Boolean);
  const tree = spawnSync("python3", ["-I", hook, "--scan", ...tracked], { encoding: "utf-8", maxBuffer: 1 << 26 });
  const treeHits = tree.stdout.trim().split("\n").filter(Boolean);
  add(
    treeHits.length
      ? { area: "Secrets", severity: "HIGH", check: "secrets in tracked files", detail: treeHits.join("; "), fix: "Remove, rotate the key, move it to an environment variable." }
      : { area: "Secrets", severity: "OK", check: "secrets in tracked files", detail: `${tracked.length} files clean` }
  );
  const log = spawnSync("git", ["log", "-p", "--all", "--format=commit %H"], { encoding: "utf-8", maxBuffer: 1 << 30 });
  const hist = spawnSync("python3", ["-I", hook, "--scan-history"], { input: log.stdout, encoding: "utf-8", maxBuffer: 1 << 26 });
  const histHits = hist.stdout.trim().split("\n").filter(Boolean);
  add(
    histHits.length
      ? { area: "Secrets", severity: "HIGH", check: "secrets in git history", detail: `commit/kind: ${histHits.join("; ")}`, fix: "Rotate those keys now; history keeps them even after deletion." }
      : { area: "Secrets", severity: "OK", check: "secrets in git history", detail: "clean" }
  );
  const settings = exists(".claude/settings.json") ? read(".claude/settings.json") : "";
  add(
    settings.includes("block-secrets.py")
      ? { area: "Secrets", severity: "OK", check: "secrets hook registered", detail: ".claude/settings.json PreToolUse" }
      : { area: "Secrets", severity: "MEDIUM", check: "secrets hook registered", detail: "not in .claude/settings.json", fix: "Register the PreToolUse hook." }
  );
  const publicSecrets = [...walk("src"), ".env.local.example"].filter((f) => exists(f) && /NEXT_PUBLIC_\w*(SECRET|PRIVATE|SERVICE_ROLE|API_KEY|TOKEN)/.test(read(f)));
  add(
    publicSecrets.length
      ? { area: "Secrets", severity: "HIGH", check: "no secrets sent to the browser", detail: publicSecrets.join(", "), fix: "Never prefix secrets with NEXT_PUBLIC_." }
      : { area: "Secrets", severity: "OK", check: "no secrets sent to the browser", detail: "no NEXT_PUBLIC_ secret names" }
  );
  const clientLeaks = walk("src").filter((f) => {
    const s = read(f);
    return /^["']use client["']/.test(s.trimStart()) && /from ["']@\/(db|orchestrator)|from ["']node:fs["']|process\.env\.(?!NEXT_PUBLIC_)/.test(s);
  });
  add(
    clientLeaks.length
      ? { area: "Secrets", severity: "HIGH", check: "browser code imports server-only code", detail: clientLeaks.join(", "), fix: "Move the import to a server route." }
      : { area: "Secrets", severity: "OK", check: "browser code imports server-only code", detail: "none" }
  );
}

/* ---------------- 4 · Personal data in logs ---------------- */

function loggingChecks() {
  const raw: string[] = [];
  const content: string[] = [];
  for (const f of walk("src")) {
    read(f).split("\n").forEach((line, i) => {
      if (!/console\.(log|info|warn|error)\(/.test(line)) return;
      if (/,\s*(err|error|e)\s*\)/.test(line) && !/errorSummary/.test(line)) raw.push(`${f}:${i + 1}`);
      if (/\b(content|answer|transcript|messages?|cv|resume|userText|text)\b(?!\.length|Length)/.test(line.replace(/console\.\w+\(\s*["'`][^"'`]*["'`]/, ""))) content.push(`${f}:${i + 1}`);
    });
  }
  add(
    raw.length
      ? { area: "Personal data", severity: "LOW", check: "raw error objects logged", detail: `${raw.length}: ${raw.slice(0, 8).join(", ")}${raw.length > 8 ? " …" : ""}`, fix: "Log errorSummary(err) (database errors can carry user content)." }
      : { area: "Personal data", severity: "OK", check: "raw error objects logged", detail: "none" }
  );
  add(
    content.length
      ? { area: "Personal data", severity: "LOW", check: "log lines that may print content", detail: `${content.length} to review: ${content.slice(0, 8).join(", ")}${content.length > 8 ? " …" : ""}`, fix: "Log ids and counts only, never CV, transcript or message text." }
      : { area: "Personal data", severity: "OK", check: "log lines that may print content", detail: "none found" }
  );
  const schema = read("src/db/schema.ts");
  const traits = schema.match(/\b(ethnicity|religion|health|sexual|political|date_of_birth|birth_date|age)\b/gi);
  add(
    traits
      ? { area: "Personal data", severity: "HIGH", check: "sensitive traits in the schema", detail: [...new Set(traits)].join(", "), fix: "Never store sensitive traits (CLAUDE.md GDPR)." }
      : { area: "Personal data", severity: "OK", check: "sensitive traits in the schema", detail: "none" }
  );
  const retention = /["'](retain_until|retention_until)["']/.test(schema);
  add(
    retention
      ? { area: "Personal data", severity: "OK", check: "retention dates", detail: "present in schema" }
      : { area: "Personal data", severity: "MEDIUM", check: "retention dates and deletion", detail: "no retention column, no deletion path", fix: "Plan S3: Delete role / company, retain_until." }
  );
}

/* ---------------- 5 · Web hardening, AI, dependencies ---------------- */

function hardeningChecks() {
  const cfg = read("next.config.mjs") + (exists("vercel.json") ? read("vercel.json") : "");
  const headers: [string, RegExp][] = [
    ["Strict-Transport-Security", /Strict-Transport-Security/i],
    ["frame protection (frame-ancestors / X-Frame-Options)", /frame-ancestors|X-Frame-Options/i],
    ["X-Content-Type-Options", /X-Content-Type-Options/i],
    ["Referrer-Policy", /Referrer-Policy/i],
    ["Content-Security-Policy", /Content-Security-Policy/i],
  ];
  const missing = headers.filter(([, rx]) => !rx.test(cfg)).map(([n]) => n);
  add(
    missing.length
      ? { area: "Web hardening", severity: "MEDIUM", check: "security headers", detail: `missing: ${missing.join(", ")}`, fix: "Add them in next.config.mjs headers() (plan S4)." }
      : { area: "Web hardening", severity: "OK", check: "security headers", detail: "all configured" }
  );
  const guard = exists("prompts/system/guardrails.md") ? read("prompts/system/guardrails.md") : "";
  const injectionRule = /never (as )?instructions|treat[^.\n]{0,40}as data|untrusted/i.test(guard);
  add(
    injectionRule
      ? { area: "AI", severity: "OK", check: "prompt-injection rule for all agents", detail: "present in prompts/system/guardrails.md" }
      : { area: "AI", severity: "HIGH", check: "prompt-injection rule for all agents", detail: "documents, Intel, CVs and transcripts are not marked as data in the shared guardrails", fix: "Plan S1: fence material in tagged blocks + 'data, never instructions' rule." }
  );
  const promptFiles = execFileSync("git", ["ls-files", "prompts", "products/interview-intelligence/prompts"], { encoding: "utf-8" }).split("\n").filter((f) => f.endsWith(".md"));
  // A line that asks for an overall score/fit or a ranking; lines that forbid
  // it ("never", "do not") and third-party ratings (Glassdoor) don't count.
  const overall = promptFiles.filter((f) =>
    read(f).split("\n").some((l) => {
      const m = /overall (score|fit|rating)|\/100\b|rank(ing)? (the )?candidates/i.exec(l);
      return !!m && !/\b(never|not|don't|no)\b/i.test(l.slice(0, m.index)) && !/glassdoor/i.test(l);
    })
  );
  add(
    overall.length
      ? { area: "AI", severity: "MEDIUM", check: "no overall score / ranking in prompts", detail: overall.join(", "), fix: "Evidence model: quotes + 4 levels per competency, no overall score (decision 2026-11-06)." }
      : { area: "AI", severity: "OK", check: "no overall score / ranking in prompts", detail: "none" }
  );
  const aiLog = /ai_runs|aiRuns/.test(read("src/db/schema.ts"));
  add(
    aiLog
      ? { area: "AI", severity: "OK", check: "AI analyses logged", detail: "AI run log table present" }
      : { area: "AI", severity: "MEDIUM", check: "AI analyses logged", detail: "no AI run log (model, prompt version, inputs, output, human decision)", fix: "Plan S2." }
  );
  const activity = /activity_log|activityLog/.test(read("src/db/schema.ts"));
  add(
    activity
      ? { area: "Audit trail", severity: "OK", check: "activity log", detail: "present" }
      : { area: "Audit trail", severity: "MEDIUM", check: "activity log for every user action", detail: "only admin actions and approvals are logged; nothing in the app reads the log", fix: "Plan S2: activity_log + admin Activity page." }
  );
  const audit = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf-8" });
  try {
    const v = JSON.parse(audit.stdout).metadata.vulnerabilities as Record<string, number>;
    const sev: Severity = v.critical || v.high ? "HIGH" : v.moderate ? "MEDIUM" : v.low ? "LOW" : "OK";
    add({ area: "Dependencies", severity: sev, check: "npm audit (production packages)", detail: `critical ${v.critical}, high ${v.high}, moderate ${v.moderate}, low ${v.low}`, fix: sev === "OK" ? undefined : "npm audit fix; test; deploy (plan S4)." });
  } catch {
    add({ area: "Dependencies", severity: "LOW", check: "npm audit", detail: "could not run (offline?)" });
  }
  add(
    exists(".github/dependabot.yml")
      ? { area: "Dependencies", severity: "OK", check: "Dependabot", detail: ".github/dependabot.yml present" }
      : { area: "Dependencies", severity: "LOW", check: "Dependabot", detail: "no config", fix: "Add .github/dependabot.yml." }
  );
}

/* ---------------- report ---------------- */

async function main() {
  loadEnv();
  await databaseChecks();
  accessChecks();
  secretChecks();
  loggingChecks();
  hardeningChecks();

  const order: Severity[] = ["HIGH", "MEDIUM", "LOW", "OK"];
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  const count = (s: Severity) => findings.filter((f) => f.severity === s).length;
  const status = count("HIGH") ? "RED" : count("MEDIUM") ? "AMBER" : "GREEN";

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ status, counts: { HIGH: count("HIGH"), MEDIUM: count("MEDIUM"), LOW: count("LOW"), OK: count("OK") }, findings }, null, 2));
  } else {
    console.log(`Security scan: ${status} · HIGH ${count("HIGH")} · MEDIUM ${count("MEDIUM")} · LOW ${count("LOW")} · OK ${count("OK")}\n`);
    for (const f of findings) {
      console.log(`${f.severity.padEnd(6)} [${f.area}] ${f.check}: ${f.detail}`);
      if (f.fix) console.log(`       → ${f.fix}`);
    }
  }
  process.exitCode = count("HIGH") ? 1 : 0;
}

main().catch((err) => {
  console.error("security scan failed:", (err as Error).name, (err as Error).message.slice(0, 200));
  process.exitCode = 2;
});
