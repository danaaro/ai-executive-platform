import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { createClerkClient } from "@clerk/backend";
import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument, StandardFonts } from "pdf-lib";

/**
 * End-to-end QA of the job description flow, in a real browser, as a real
 * signed-in customer — on synthetic data only.
 *
 *   npm run test:e2e-jd
 *
 *  1. Throwaway real Postgres 17 (embedded-postgres, deleted afterwards) with
 *     the current schema + row-level security
 *     (secure:tenancy). The live database is never touched.
 *  2. A synthetic customer in the Clerk DEV instance (refuses sk_live keys):
 *     one user, one organization, seeded as company "Nordlys Robotics" with
 *     three credits.
 *  3. A dev server on its own port and build folder, pointed at that database.
 *  4. Playwright drives the screens: sign in → Start new role → Type →
 *     interview (a synthetic hiring manager, played by Claude Haiku, answers
 *     the agent's questions from a fixed fact sheet; one turn uploads a PDF) →
 *     80 % → Generate → Save draft & review → Word + PDF download → Approve →
 *     download again.
 *  5. A weighted QA score over flow, downloads, content and UX checks.
 *
 * Artifacts (JD Markdown, .docx, .pdf, screenshots, report) land in
 * node_modules/.cache/e2e-jd/<timestamp>/. Exits non-zero below PASS_SCORE.
 *
 * Needs Playwright with its Chromium (npx playwright install chromium) — found
 * via PLAYWRIGHT_DIR or the npx cache, so it is not a project dependency.
 */

const ROOT = process.cwd();
const PORT = 3021;
const BASE = `http://localhost:${PORT}`;
const DB_PORT = 54331;
const DB_URL = `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
const RUN_DIR = path.join(ROOT, "node_modules/.cache/e2e-jd", new Date().toISOString().replace(/[:.]/g, "-"));
// 80 % readiness needs most of the 71-question bank (a section counts only when all its
// questions are resolved), at 1–2 questions a turn: ~35–45 typed turns.
const MAX_TURNS = Number(process.env.E2E_MAX_TURNS ?? 50);
const PASS_SCORE = 90;
const TEST_EMAIL = "exec10x-e2e+clerk_test@example.com";
const ORG_NAME = "E2E Synthetic — Nordlys Robotics";
const COMPANY = "Nordlys Robotics";
const ROLE_TITLE = "Chief Revenue Officer";

function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

/* ---------------- synthetic hiring manager --------------------------------- */

const FACTS = `
You are Maarja Kask, CEO and co-founder of Nordlys Robotics (fictional). You are hiring a Chief Revenue Officer.
- Company: Nordlys Robotics, Tallinn HQ, Estonia; 230 employees; Series C (EUR 60M, 2026, led by a Nordic growth fund). Builds autonomous mobile robots for mid-size warehouses; robots-as-a-service subscription model. ARR EUR 28M, growing 70% a year. 140 live customer sites across the Nordics, Baltics and Germany.
- Why now: the founders have sold every deal so far; the board wants a revenue leader before expanding into DACH and Benelux. Pilots convert to fleet contracts too slowly (pilot-to-fleet conversion 35%, target 60%).
- New role. Reports to the CEO (you). Member of the executive committee. Owns sales (14 AEs), solutions engineering (6), customer success (9), and revenue operations (2) — 31 people in total. Marketing stays a separate function under the CMO but must partner closely.
- Budget: owns the commercial budget (~EUR 9M). Can hire within plan without CEO sign-off; pricing changes above 15% discount need CEO + CFO.
- First 6–12 months: build a repeatable pilot-to-fleet motion; hire DACH country lead and open Munich office; lift conversion to 50%. 12–24 months: ARR EUR 60M; net revenue retention above 120%; partner channel (system integrators) delivering 25% of new bookings.
- Current situation: no CRM discipline (HubSpot, half-used), forecasting is founder gut feel; two senior AEs are strong, the rest are junior. Churn is low (3%).
- Stakeholders: CFO Jonas Berg (finance discipline, sceptical of discounts), CTO (product roadmap trade-offs), COO (deployment capacity is the bottleneck), board observer from the lead investor.
- Manager style (internal): you are direct, fast, and data-driven; you hate surprises; weekly 1:1, monthly board pack. Previous VP Sales left after 9 months because they tried to copy a SaaS playbook that ignored deployment constraints.
- Team (internal): sales team is loyal to the founders and wary of outsiders; one senior AE (Liis) was passed over and may resent the hire.
- Environment: hybrid, Tallinn HQ 3 days/week; 40% travel across Nordics/DACH; English is the working language. Fast, scrappy, engineering-led culture.
- Must-have experience: scaled B2B revenue from ~EUR 25M to 75M+ in hardware-enabled or industrial tech; built channel partnerships with system integrators; has led a team of 25+ across several countries; complex multi-stakeholder enterprise sales (operations + finance + IT buyers). Fluent English; German is a strong plus.
- Leadership approach: credible with engineers, coaches juniors, installs process without killing speed, honest forecasting.
- Nice to have: robotics/logistics/warehouse automation, robots-as-a-service or subscription hardware pricing.
- Culture: values are "Ship it", "Own the outcome", "Straight talk". Flat structure, decisions made fast, low politics.
- EVP: meaningful equity (0.6–0.9%), build the commercial function from the ground up, executive committee seat, visible impact on a category-leading Baltic tech company.
- Salary: EUR 180,000–220,000 base plus 40% variable and equity. Do NOT publish the salary on the job description.
`.trim();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function personaAnswer(agentMessage: string, history: string[]): Promise<string> {
  const res = await anthropic.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 500,
    system:
      `${FACTS}\n\nYou are in a briefing interview with a job description agent. Answer ONLY what the agent just asked, ` +
      "in 2–6 natural sentences, in first person, as a busy CEO typing in a chat. Use the facts above; if asked something " +
      "they don't cover, give a short plausible answer consistent with them. If the agent asks you to confirm a summary, " +
      "confirm and correct anything wrong. Never mention that you are an AI or that this is a test. No markdown.",
    messages: [
      { role: "user", content: `Earlier in this interview you said:\n${history.slice(-6).join("\n---\n") || "(nothing yet)"}\n\nThe agent now writes:\n\n${agentMessage}` },
    ],
  });
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  return text || "Yes, that's right.";
}

async function onePagerPdf(file: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  const lines = [
    "Nordlys Robotics - company one-pager (synthetic test document)",
    "",
    "Mission: make every mid-size warehouse as productive as the best in Europe.",
    "Product: autonomous mobile robots, sold as robots-as-a-service subscriptions.",
    "Founded 2019 in Tallinn. 230 people. Offices: Tallinn (HQ), Stockholm, Hamburg.",
    "Customers: 140 live sites - 3PLs, grocery and e-commerce fulfilment.",
    "Values: Ship it. Own the outcome. Straight talk.",
    "Funding: Series C, EUR 60M (2026).",
  ];
  lines.forEach((l, i) => page.drawText(l, { x: 50, y: 790 - i * 18, size: 11, font }));
  fs.writeFileSync(file, await pdf.save());
}

/* ---------------- QA scoring ------------------------------------------------ */

type Check = { area: string; name: string; weight: number; ok: boolean; detail?: string };
const checks: Check[] = [];
function check(area: string, name: string, ok: boolean, weight = 1, detail = "") {
  checks.push({ area, name, weight, ok, detail });
  console.log(`${ok ? "  ✓" : "  ✗"} [${area}] ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

/* ---------------- environment ---------------------------------------------- */

function findPlaywright(): string {
  const candidates = [process.env.PLAYWRIGHT_DIR].filter(Boolean) as string[];
  const npx = path.join(process.env.HOME ?? "", ".npm/_npx");
  if (fs.existsSync(npx)) {
    for (const d of fs.readdirSync(npx)) candidates.push(path.join(npx, d, "node_modules/playwright"));
  }
  const hit = candidates.find((c) => fs.existsSync(path.join(c, "package.json")));
  if (!hit) throw new Error("Playwright not found — run `npx playwright install chromium` or set PLAYWRIGHT_DIR.");
  return hit;
}

/** Minimal query surface the test needs, over a real Postgres. */
type TestDb = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
};

async function startDb(): Promise<{ db: TestDb; stop(): Promise<void> }> {
  // A real Postgres, not PGlite: PGlite multiplexes every client over ONE
  // session, so the app's concurrent requests and open transactions queued
  // behind each other for minutes (CONNECT_TIMEOUT, 220s responses).
  const dataDir = path.join(RUN_DIR, "pgdata");
  const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "postgres", port: DB_PORT, persistent: false });
  await server.initialise();
  await server.start();
  const sql = postgres(DB_URL, { max: 1, onnotice: () => undefined });
  const db: TestDb = {
    query: async <T,>(text: string, params: unknown[] = []) => ({ rows: (await sql.unsafe(text, params as never[])) as unknown as T[] }),
    close: () => sql.end(),
  };

  await sql.unsafe(`CREATE ROLE anon; CREATE ROLE authenticated;`);
  const work = path.join(RUN_DIR, "sql");
  execFileSync("npx", ["drizzle-kit", "generate", "--dialect=postgresql", "--schema=src/db/schema.ts", `--out=${work}`], {
    cwd: ROOT,
    stdio: "pipe",
  });
  const sqlFile = fs.readdirSync(work).find((f) => f.endsWith(".sql"))!;
  for (const stmt of fs.readFileSync(path.join(work, sqlFile), "utf-8").split("--> statement-breakpoint")) {
    if (stmt.trim()) await sql.unsafe(stmt);
  }
  execFileSync("npx", ["tsx", "scripts/secure-tenancy.ts", "--apply"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "pipe",
  });
  return {
    db,
    stop: async () => {
      await db.close().catch(() => undefined);
      await server.stop().catch(() => undefined);
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function syntheticCustomer(pg: TestDb) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  let [user] = (await clerk.users.getUserList({ emailAddress: [TEST_EMAIL] })).data;
  if (!user) {
    user = await clerk.users.createUser({
      emailAddress: [TEST_EMAIL],
      firstName: "Maarja",
      lastName: "Kask (E2E)",
      password: `E2e-${Math.random().toString(36).slice(2)}-Xq9!`,
      skipPasswordChecks: true,
    });
  }
  const memberships = await clerk.users.getOrganizationMembershipList({ userId: user.id, limit: 10 });
  let org = memberships.data.find((m) => m.organization.name === ORG_NAME)?.organization;
  if (!org) org = await clerk.organizations.createOrganization({ name: ORG_NAME, createdBy: user.id });
  // resolveCompanyId() needs exactly one membership when the session names no org.
  for (const m of memberships.data) {
    if (m.organization.id !== org.id) {
      await clerk.organizations.deleteOrganizationMembership({ organizationId: m.organization.id, userId: user.id });
    }
  }

  const { rows: [company] } = await pg.query<{ id: string }>(
    `INSERT INTO companies (clerk_org_id, name) VALUES ($1, $2) RETURNING id`,
    [org.id, COMPANY]
  );
  await pg.query(
    `INSERT INTO users (id, email, name, role, company_id, synced_at) VALUES ($1, $2, $3, 'member', $4, now())`,
    [user.id, TEST_EMAIL, "Maarja Kask (E2E)", company.id]
  );
  await pg.query(
    `INSERT INTO credit_ledger (company_id, kind, delta, contract_ref, note, created_by) VALUES ($1, 'grant', 3, 'E2E-SYNTHETIC', 'test:e2e-jd', $2)`,
    [company.id, user.id]
  );
  return { clerk, userId: user.id, companyId: company.id };
}

async function startServer(): Promise<{ proc: ChildProcess; log: string }> {
  const log = path.join(RUN_DIR, "server.log");
  const out = fs.openSync(log, "w");
  execFileSync("node", ["scripts/copy-pdfjs.mjs"], { cwd: ROOT }); // what `npm run dev` does in predev
  const proc = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: ROOT,
    // Own build folder: never overwrite a developer's running .next.
    env: { ...process.env, DATABASE_URL: DB_URL, NEXT_DIST_DIR: ".next-e2e" },
    stdio: ["ignore", out, out],
    detached: true,
  });
  for (let i = 0; i < 120; i++) {
    if (fs.readFileSync(log, "utf-8").includes("Ready in")) return { proc, log };
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("dev server did not start in 120s");
}

/* ---------------- the run --------------------------------------------------- */

async function main() {
  if (!/^sk_test_/.test(process.env.CLERK_SECRET_KEY ?? "")) {
    console.error("Refusing to run: test:e2e-jd only runs against a Clerk DEVELOPMENT instance (sk_test_).");
    process.exit(1);
  }
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const pw = await import(pathToFileURL(path.join(findPlaywright(), "index.js")).href);
  const chromium = pw.chromium ?? pw.default.chromium; // CommonJS module: named exports sit on default

  console.log("1 · Throwaway database");
  const { db: pg, stop: stopDb } = await startDb();
  let srv: ChildProcess | null = null;
  let browser: { close(): Promise<void> } | null = null;
  let onFailure: (() => Promise<void>) | null = null;

  try {
    console.log("2 · Synthetic customer (Clerk dev instance)");
    const { clerk, userId } = await syntheticCustomer(pg);
    check("setup", "synthetic customer seeded", true, 0);

    console.log("3 · Dev server");
    srv = (await startServer()).proc;

    console.log("4 · Browser");
    // The machine's Chrome (headless, throwaway profile) when present — no browser download needed.
    const b = await chromium.launch(fs.existsSync("/Applications/Google Chrome.app") ? { channel: "chrome" } : {});
    browser = b;
    const context = await b.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    const consoleErrors: string[] = [];
    page.on("pageerror", (e: Error) => consoleErrors.push(e.message));
    // Network trace of the API calls, for diagnosing a stuck meter or a hung request.
    const netLog = fs.createWriteStream(path.join(RUN_DIR, "browser-network.log"));
    const t0 = Date.now();
    const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
    page.on("request", (r: { url(): string; method(): string }) => {
      if (r.url().includes("/api/")) netLog.write(`${stamp()} → ${r.method()} ${r.url().replace(BASE, "")}\n`);
    });
    page.on("requestfinished", (r: { url(): string }) => {
      if (r.url().includes("/api/")) netLog.write(`${stamp()} ✓ ${r.url().replace(BASE, "")}\n`);
    });
    page.on("requestfailed", (r: { url(): string; failure(): { errorText: string } | null }) => {
      if (r.url().includes("/api/")) netLog.write(`${stamp()} ✗ ${r.url().replace(BASE, "")} ${r.failure()?.errorText}\n`);
    });
    page.on("console", (m: { type(): string; text(): string }) => {
      if (m.type() === "error" || m.type() === "warning") netLog.write(`${stamp()} console.${m.type()}: ${m.text().slice(0, 300)}\n`);
    });
    const shot = (name: string) => page.screenshot({ path: path.join(RUN_DIR, `${name}.png`), fullPage: true });
    onFailure = async () => {
      await shot("99-failure").catch(() => undefined);
      const state = await page
        .evaluate(() => ({
          url: location.href,
          textareaDisabled: document.querySelector("textarea")?.disabled,
          bubbles: Array.from(document.querySelectorAll("div.self-start, div.self-end")).map((d) => (d.textContent ?? "").slice(0, 160)),
          alerts: Array.from(document.querySelectorAll('[role="alert"], .text-danger')).map((d) => d.textContent),
        }))
        .catch((e: Error) => ({ error: e.message }));
      fs.writeFileSync(path.join(RUN_DIR, "99-failure-state.json"), JSON.stringify(state, null, 2));
    };

    // Sign in with a one-time sign-in token (Clerk's <SignIn> consumes __clerk_ticket).
    const token = await clerk.signInTokens.createSignInToken({ userId, expiresInSeconds: 900 });
    await page.goto(`${BASE}/sign-in?__clerk_ticket=${token.token}`, { timeout: 180_000 });
    let signedIn = true;
    try {
      await page.waitForURL((u: URL) => !u.pathname.startsWith("/sign-in"), { timeout: 90_000 });
    } catch {
      signedIn = false;
    }
    await shot("01-after-sign-in");
    if (!check("flow", "signs in as the synthetic customer", signedIn, 2)) throw new Error("sign-in failed");

    // Company home → Start new role
    await page.goto(`${BASE}/projects`, { timeout: 180_000 });
    await page.getByRole("button", { name: /Start new role/ }).click({ timeout: 120_000 });
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("e.g. Chief Financial Officer").fill(ROLE_TITLE);
    await dialog.getByLabel("Salary from").fill("180000");
    await dialog.getByLabel("Salary to").fill("220000");
    await dialog.getByLabel("Currency").selectOption("EUR").catch(() => undefined);
    await shot("02-new-role");
    await dialog.locator("button.btn-gold").click();
    let opened = true;
    try {
      await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/start/, { timeout: 120_000 });
    } catch {
      opened = false;
    }
    if (!check("flow", "opens a new role (spends a credit)", opened, 2)) {
      await shot("02b-new-role-failed");
      throw new Error("could not open the role");
    }
    const projectId = /projects\/([0-9a-f-]{36})/.exec(page.url())![1];
    const { rows: [credits] } = await pg.query<{ n: number }>(`SELECT coalesce(sum(delta),0)::int AS n FROM credit_ledger`);
    check("flow", "credit balance 3 → 2", credits.n === 2, 1, `balance ${credits.n}`);

    // Type mode
    await page.locator(`a[href$="/interview?mode=type"]`).click();
    await page.waitForURL(/\/interview/, { timeout: 120_000 });

    const agentBubbles = page.locator("div.self-start", { has: page.locator("p.label-mono", { hasText: /^Agent$/ }) });
    const textarea = page.locator("textarea").first();
    const pctText = page.locator("span.font-display.text-4xl");
    const pct = async () => Number((await pctText.textContent())?.replace("%", "") ?? 0);
    const waitForAgent = async (before: number) => {
      await page.waitForFunction(
        ([sel, n]: [string, number]) => {
          const bubbles = Array.from(document.querySelectorAll(sel)).filter((d) => d.querySelector("p.label-mono")?.textContent === "Agent");
          const ta = document.querySelector("textarea");
          return bubbles.length > n && ta && !ta.disabled;
        },
        ["div.self-start", before] as [string, number],
        { timeout: 240_000 }
      );
    };

    await waitForAgent(0);
    check("flow", "agent opens the interview", (await agentBubbles.count()) >= 1, 2);
    const focused = async () => page.evaluate(() => document.activeElement?.tagName === "TEXTAREA");
    check("ux", "cursor is in the answer box on load", await focused(), 1);

    const said: string[] = [];
    let focusAfterReplies = 0;
    let replies = 0;
    let turns = 0;
    let uploaded = false;
    for (; turns < MAX_TURNS && (await pct()) < 80; turns++) {
      const before = await agentBubbles.count();
      if (turns === 2 && !uploaded) {
        const pdfPath = path.join(RUN_DIR, "nordlys-one-pager.pdf");
        await onePagerPdf(pdfPath);
        await page.locator('input[type="file"]').first().setInputFiles(pdfPath);
        uploaded = true;
      } else {
        const last = (await agentBubbles.nth(before - 1).innerText()).replace(/^Agent\s*/, "");
        const answer = await personaAnswer(last, said);
        said.push(answer);
        await textarea.fill(answer);
        await textarea.press("Enter");
      }
      await waitForAgent(before);
      replies++;
      if (await focused()) focusAfterReplies++;
      console.log(`    turn ${turns + 1}: ${await pct()}%`);
    }
    await shot("03-interview-80");
    const finalPct = await pct();
    check("flow", "interview reaches 80 % readiness", finalPct >= 80, 3, `${finalPct}% after ${turns} turns`);
    check("flow", "readiness within 35 turns (interview length a hiring manager will tolerate)", finalPct >= 80 && turns <= 35, 1, `${turns} turns`);
    check("ux", "cursor returns to the box after every reply", replies > 0 && focusAfterReplies === replies, 1, `${focusAfterReplies}/${replies}`);
    const docsCard = await page.getByText("nordlys-one-pager.pdf").count();
    check("upload", "PDF upload is parsed and listed on the role", uploaded && docsCard > 0, 2);
    const uploadErr = await page.getByText(/couldn't be read|Upload failed|No readable text/).count();
    check("upload", "no upload error shown", uploadErr === 0, 1);

    // Generate → Save draft & review
    const gen = page.getByRole("button", { name: /Generate job description/ });
    check("flow", "Generate unlocks at 80 %", await gen.isEnabled().catch(() => false), 2);
    await gen.click();
    const save = page.getByRole("button", { name: /Save draft & review/ });
    let drafted = true;
    try {
      await save.waitFor({ timeout: 420_000 });
    } catch {
      drafted = false;
    }
    await shot("04-draft-generated");
    if (!check("flow", "agent writes the job description", drafted, 3)) throw new Error("no deliverable");
    await save.click();
    await page.waitForURL(/\/review\?artifact=/, { timeout: 120_000 });
    const artifactId = new URL(page.url()).searchParams.get("artifact")!;
    await page.getByText("The Opportunity").first().waitFor({ timeout: 60_000 });
    await shot("05-review");
    check("flow", "draft saved as v1 and shown on Review", (await page.getByText(/Draft v1/).count()) > 0, 2);

    // Content QA on the saved Markdown
    const art = await page.evaluate(async (id: string) => (await fetch(`/api/artifacts?id=${id}`)).json(), artifactId);
    const md: string = art.artifact.content;
    fs.writeFileSync(path.join(RUN_DIR, "jd.md"), md);
    const sections = ["The Opportunity", "Business & Leadership Context", "Your Mandate", "What Success Looks Like", "What You Bring", `About ${COMPANY}`];
    const positions = sections.map((s) => md.indexOf(s));
    check("content", "all six Exec10X sections present", positions.every((p) => p >= 0), 3, sections.filter((_, i) => positions[i] < 0).join(", ") || "");
    check("content", "sections in template order", positions.every((p, i) => i === 0 || p > positions[i - 1]), 1);
    const words = md.split(/\s+/).filter(Boolean).length;
    check("content", "length 600–1,050 words (template 650–900 + header)", words >= 600 && words <= 1050, 1, `${words} words`);
    const toConfirm = (md.match(/\[To confirm/g) ?? []).length;
    check("content", "at most 2 [To confirm] gaps", toConfirm <= 2, 1, `${toConfirm}`);
    check("content", "uses the hiring manager's facts", ["Tallinn", "DACH", "pilot", "system integrator"].every((f) => md.toLowerCase().includes(f.toLowerCase())), 2);
    check("content", "salary NOT published (box unticked)", !/180[,.\s]?000|220[,.\s]?000|180k|220k/i.test(md), 2);
    check("content", "internal details not exposed (manager style, passed-over AE, ex-VP)", !/\bLiis\b|passed over|left after 9 months|\bresent(s|ed|ful)?\b/i.test(md), 2);
    check("content", "no leaked prompt / instructions", !/Internal instructions|never published|Writing standards|\[EXECUTIVE ROLE TITLE\]/i.test(md), 2);

    // Downloads (draft)
    const roleIdExpected = `R-${projectId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const { PDFParse } = await import("pdf-parse");
    const download = async (label: RegExp, file: string) => {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), page.getByRole("link", { name: label }).click()]);
      const dest = path.join(RUN_DIR, file);
      await dl.saveAs(dest);
      return { dest, suggested: dl.suggestedFilename() as string, buf: fs.readFileSync(dest) };
    };
    const docx = await download(/Word document/, "draft.docx");
    const docxXml = execFileSync("unzip", ["-p", docx.dest, "word/document.xml", "word/footer1.xml"]).toString();
    check("download", "Word downloads (valid .docx)", docx.buf.subarray(0, 2).toString() === "PK" && docx.suggested.endsWith(".docx"), 3, docx.suggested);
    check("download", "Word has title, company and sections", docxXml.includes(ROLE_TITLE) && docxXml.includes(COMPANY) && docxXml.includes("The Opportunity"), 2);
    check("download", "Word footer has the Role ID and 'Draft'", docxXml.includes(roleIdExpected) && docxXml.includes("v1 Draft"), 2, roleIdExpected);

    const pdfDl = await download(/^PDF$/, "draft.pdf");
    const parser = new PDFParse({ data: new Uint8Array(pdfDl.buf) });
    const pdfText = (await parser.getText()).text;
    await parser.destroy();
    check("download", "PDF downloads (valid .pdf)", pdfDl.buf.subarray(0, 5).toString() === "%PDF-" && pdfDl.suggested.endsWith(".pdf"), 3, pdfDl.suggested);
    check("download", "PDF has title, company and all sections", [ROLE_TITLE, COMPANY, ...sections].every((s) => pdfText.includes(s)), 2);
    check("download", "PDF footer has the Role ID on every page", (pdfText.match(new RegExp(roleIdExpected, "g")) ?? []).length >= 1 && /Page 1 of \d/.test(pdfText), 2);
    check("download", "PDF has no unprintable-character substitutions", !/\?\?\?/.test(pdfText), 1);

    // Approve, then the approved download
    await page.getByRole("button", { name: /^Approve$/ }).click();
    await page.getByRole("heading", { name: "Approved" }).waitFor({ timeout: 60_000 });
    check("flow", "hiring manager approves", true, 2);
    const approvedPdf = await download(/^PDF$/, "approved.pdf");
    const p2 = new PDFParse({ data: new Uint8Array(approvedPdf.buf) });
    const approvedText = (await p2.getText()).text;
    await p2.destroy();
    check("download", "approved download says 'v1 Approved'", approvedText.includes("v1 Approved"), 1);
    await shot("06-approved");

    // Security: another company's user cannot download — an unauthenticated fetch must be refused.
    const anon = await fetch(`${BASE}/api/artifacts/${artifactId}/download?format=pdf`);
    check("security", "download refuses unauthenticated requests", anon.status === 401, 2, `HTTP ${anon.status}`);
    const bad = await page.evaluate(async (id: string) => (await fetch(`/api/artifacts/${id}/download?format=exe`)).status, artifactId);
    check("security", "download rejects an unknown format", bad === 400, 1, `HTTP ${bad}`);

    check("ux", "no uncaught browser errors", consoleErrors.length === 0, 1, consoleErrors.slice(0, 2).join(" | "));
  } catch (err) {
    console.error("\nRun stopped:", err instanceof Error ? err.message : err);
    await onFailure?.();
    check("flow", "run completed without stopping", false, 5, err instanceof Error ? err.message : String(err));
  } finally {
    await browser?.close().catch(() => undefined);
    if (srv?.pid) {
      try {
        process.kill(-srv.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    await stopDb();
  }

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.filter((c) => c.ok).reduce((s, c) => s + c.weight, 0);
  const score = total ? Math.round((got / total) * 100) : 0;
  const report = [
    `# JD intake e2e — QA score ${score}/100 (${new Date().toISOString()})`,
    "",
    "| Area | Check | Weight | Result | Detail |",
    "|---|---|---|---|---|",
    ...checks.map((c) => `| ${c.area} | ${c.name} | ${c.weight} | ${c.ok ? "pass" : "FAIL"} | ${c.detail ?? ""} |`),
  ].join("\n");
  fs.writeFileSync(path.join(RUN_DIR, "report.md"), report);
  console.log(`\nQA SCORE ${score}/100 — ${checks.filter((c) => !c.ok).length} failing check(s). Artifacts: ${RUN_DIR}`);
  process.exitCode = score >= PASS_SCORE ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
