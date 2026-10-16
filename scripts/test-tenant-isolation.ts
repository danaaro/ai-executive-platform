import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import {
  type CurrentUser,
  getProjectAccess,
  getConversationAccess,
  accessibleProjectIds,
  appendUserTurn,
  appendAssistantTurn,
} from "@/shared/current-user";
import { recordIntakeAnswers } from "@/shared/intake-answers";

/**
 * ADR-010 §10 — "verification is a test, not a promise".
 *
 *   npm run test:tenancy   (normally via `npm run rehearse:tenancy`)
 *
 * Builds two customer companies side by side and proves that nothing of B is
 * reachable from A through the access layer every API route goes through —
 * including by an admin of A, by a user with no company, and by passing B's
 * ids where A's are expected. Then a static check that every customer API
 * route actually goes through that layer.
 *
 * LOCAL DATABASES ONLY. It creates and deletes companies, so it refuses any
 * DATABASE_URL that is not localhost — it can never touch the live database.
 */

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error("Refusing to run: test:tenancy only runs against a local database (localhost).");
  process.exit(1);
}

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function seedCompany(tag: string) {
  const d = db();
  const [company] = await d
    .insert(tables.companies)
    .values({ clerkOrgId: `org_test_${tag}`, name: `Company ${tag}` })
    .returning({ id: tables.companies.id });
  const member: CurrentUser = { id: `user_test_${tag}`, role: "member", email: `${tag}@example.test`, companyId: company.id };
  const admin: CurrentUser = { id: `admin_test_${tag}`, role: "admin", email: `admin-${tag}@example.test`, companyId: company.id };
  for (const u of [member, admin]) {
    await d.insert(tables.users).values({ id: u.id, role: u.role, email: u.email, companyId: company.id });
  }
  const [project] = await d
    .insert(tables.projects)
    .values({ companyId: company.id, title: `Role ${tag}`, createdBy: member.id })
    .returning({ id: tables.projects.id });
  await d.insert(tables.projectMembers).values({
    companyId: company.id,
    projectId: project.id,
    userId: member.id,
    role: "owner",
    acceptedAt: new Date(),
  });
  const started = await appendUserTurn({
    conversationId: null,
    projectId: project.id,
    agentSlug: "job-description",
    userId: member.id,
    userText: `Brief for role ${tag}`,
  });
  if (!started) throw new Error(`appendUserTurn returned null for ${tag}`);
  await appendAssistantTurn({ conversationId: started.conversationId, seq: started.assistantSeq, assistantText: "Next question?" });
  await recordIntakeAnswers(
    started.conversationId,
    [{ questionId: "1.1", sectionId: 1, status: "answered", source: "typed", answer: `answer ${tag}` }],
    "text"
  );
  const [artifact] = await d
    .insert(tables.artifacts)
    .values({
      companyId: company.id,
      projectId: project.id,
      agentSlug: "job-description",
      version: 1,
      label: "JD",
      content: `JD ${tag}`,
      createdBy: member.id,
    })
    .returning({ id: tables.artifacts.id });
  return { companyId: company.id, member, admin, projectId: project.id, conversationId: started.conversationId, artifactId: artifact.id };
}

async function main() {
  const d = db();
  console.log("Seeding two companies…");
  const A = await seedCompany("a");
  const B = await seedCompany("b");
  const homeless: CurrentUser = { id: "user_test_nocompany", role: "member", email: null, companyId: null };
  const homelessAdmin: CurrentUser = { id: "admin_test_nocompany", role: "admin", email: null, companyId: null };

  console.log("\n1 · Project access");
  check("A's member owns A's role", (await getProjectAccess(A.projectId, A.member)) === "owner");
  check("A's member cannot reach B's role", (await getProjectAccess(B.projectId, A.member)) === null);
  check("A's ADMIN cannot reach B's role", (await getProjectAccess(B.projectId, A.admin)) === null);
  check("A's admin reaches A's role as admin", (await getProjectAccess(A.projectId, A.admin)) === "admin");
  check("user with no company reaches nothing", (await getProjectAccess(A.projectId, homeless)) === null);
  check("ADMIN with no company reaches nothing", (await getProjectAccess(A.projectId, homelessAdmin)) === null);
  check("unknown id looks the same as another company's", (await getProjectAccess("00000000-0000-0000-0000-000000000000", A.member)) === null);

  console.log("\n2 · Conversation access");
  check("A cannot open B's conversation", (await getConversationAccess(B.conversationId, A.member)) === null);
  check("A's admin cannot open B's conversation", (await getConversationAccess(B.conversationId, A.admin)) === null);
  const own = await getConversationAccess(A.conversationId, A.member);
  check("A opens own conversation, company reported", own?.companyId === A.companyId);

  console.log("\n3 · Lists");
  const listA = await accessibleProjectIds(A.member);
  const listAdmin = await accessibleProjectIds(A.admin);
  check("A's list holds A's role", listA.includes(A.projectId));
  check("A's list never holds B's role", !listA.includes(B.projectId));
  check("A's ADMIN list never holds B's role", !listAdmin.includes(B.projectId) && listAdmin.includes(A.projectId));
  check("no-company list is empty (not 'everything')", (await accessibleProjectIds(homelessAdmin)).length === 0);

  console.log("\n4 · Writes with B's ids from A's side");
  // A's user sends B's conversation id while working on A's role: the turn must
  // fork into a new A conversation, never land in B's.
  const before = await d.select().from(tables.messages).where(eq(tables.messages.conversationId, B.conversationId));
  const forked = await appendUserTurn({
    conversationId: B.conversationId,
    projectId: A.projectId,
    agentSlug: "job-description",
    userId: A.member.id,
    userText: "smuggled into B?",
  });
  const after = await d.select().from(tables.messages).where(eq(tables.messages.conversationId, B.conversationId));
  check("B's conversation unchanged", after.length === before.length);
  check("the turn forked into a new conversation", !!forked && forked.conversationId !== B.conversationId);
  if (forked) {
    const [conv] = await d.select({ companyId: tables.conversations.companyId }).from(tables.conversations).where(eq(tables.conversations.id, forked.conversationId));
    check("…which belongs to A", conv?.companyId === A.companyId);
  }

  console.log("\n5 · Every row carries the right company");
  for (const [name, t] of [
    ["projects", tables.projects],
    ["project_members", tables.projectMembers],
    ["conversations", tables.conversations],
    ["messages", tables.messages],
    ["intake_answers", tables.intakeAnswers],
    ["artifacts", tables.artifacts],
  ] as const) {
    const rows = await d.select({ companyId: t.companyId }).from(t);
    const known = new Set([A.companyId, B.companyId]);
    check(`${name}: ${rows.length} rows, all stamped with A or B`, rows.length > 0 && rows.every((r) => known.has(r.companyId)));
  }
  const [msgB] = await d.select({ companyId: tables.messages.companyId }).from(tables.messages).where(eq(tables.messages.conversationId, B.conversationId)).limit(1);
  check("B's messages carry B's company", msgB?.companyId === B.companyId);

  console.log("\n6 · Every customer API route goes through the access layer");
  const apiRoot = path.join(process.cwd(), "src/app/api");
  const exempt: Record<string, string> = {
    "company-intel": "admin-only research tool — requireAdmin (ADR-009)",
    "job-description/voice-llm": "ElevenLabs callback — authorized by bearer secret + signed conversation grant",
    "upload-parse": "text extraction only — no database access",
  };
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") files.push(p);
    }
  };
  walk(apiRoot);
  for (const f of files) {
    const rel = path.relative(apiRoot, f);
    const ex = Object.keys(exempt).find((k) => rel.startsWith(k));
    if (ex) continue;
    const src = fs.readFileSync(f, "utf-8");
    const authed = /requireUser\(/.test(src);
    const scoped = /getProjectAccess|getConversationAccess|accessibleProjectIds|user\.companyId/.test(src);
    check(`${rel}`, authed && scoped, `${authed ? "" : "no requireUser "}${scoped ? "" : "no company/project check"}`);
  }
  for (const [k, why] of Object.entries(exempt)) console.log(`  · ${k} — exempt: ${why}`);

  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll isolation checks passed.");
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
