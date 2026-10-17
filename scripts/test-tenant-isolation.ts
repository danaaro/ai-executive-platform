import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, adminDb, withTenant, tables } from "@/db";
import {
  type CurrentUser,
  getProjectAccess,
  getConversationAccess,
  accessibleProjectIds,
  appendUserTurn,
  appendAssistantTurn,
} from "@/shared/current-user";
import { recordIntakeAnswers } from "@/shared/intake-answers";
import { adjustCredits, creditBalance, lockCompanyCredits, setCreditBalance } from "@/shared/credits";

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

/**
 * The throwaway PGlite socket occasionally drops a connection after a refused
 * query (real Postgres does not). Retry that transport hiccup — never a
 * database answer.
 */
function isDropped(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return /ECONNRESET|CONNECTION_CLOSED|CONNECTION_ENDED|EPIPE/.test(String(e?.code ?? e?.cause?.code ?? err));
}

async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isDropped(err) || i >= tries) throw err;
    }
  }
}

/** True only when Postgres itself refuses with "insufficient privilege" (42501). */
async function deniedByDatabase(fn: () => Promise<unknown>): Promise<boolean> {
  for (let i = 1; i <= 4; i++) {
    try {
      await fn();
      return false;
    } catch (err) {
      if (isDropped(err)) continue;
      const e = err as { code?: string; cause?: { code?: string } };
      return (e?.code ?? e?.cause?.code) === "42501";
    }
  }
  return false;
}

async function seedCompany(tag: string) {
  const d = adminDb(); // setup only — the code under test runs in tenant scopes
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
    companyId: company.id,
    conversationId: null,
    projectId: project.id,
    agentSlug: "job-description",
    userId: member.id,
    userText: `Brief for role ${tag}`,
  });
  if (!started) throw new Error(`appendUserTurn returned null for ${tag}`);
  await appendAssistantTurn({
    companyId: company.id,
    conversationId: started.conversationId,
    seq: started.assistantSeq,
    assistantText: "Next question?",
  });
  await recordIntakeAnswers(
    started.conversationId,
    [{ questionId: "1.1", sectionId: 1, status: "answered", source: "typed", answer: `answer ${tag}` }],
    "text",
    company.id
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
  const d = adminDb(); // inspection only
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
    companyId: A.companyId,
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

  console.log("\n6 · The database's own wall (row-level security as app_user)");
  const seen = await retry(() => withTenant(A.companyId, () => db().select({ id: tables.projects.id }).from(tables.projects)));
  check("scope A sees only A's roles, even selecting ALL rows", seen.length > 0 && seen.every((r) => r.id !== B.projectId));
  const direct = await retry(() =>
    withTenant(A.companyId, () => db().select().from(tables.messages).where(eq(tables.messages.conversationId, B.conversationId)))
  );
  check("scope A asking for B's messages BY ID gets nothing", direct.length === 0);
  const none = await retry(() => withTenant(null, () => db().select({ id: tables.projects.id }).from(tables.projects)));
  check("an empty scope sees no rows at all", none.length === 0);
  const updated = await retry(() =>
    withTenant(A.companyId, () =>
      db().update(tables.projects).set({ title: "hijacked" }).where(eq(tables.projects.id, B.projectId)).returning({ id: tables.projects.id })
    )
  );
  check("scope A cannot UPDATE B's role", updated.length === 0);
  const companiesSeen = await retry(() => withTenant(A.companyId, () => db().select({ id: tables.companies.id }).from(tables.companies)));
  check("scope A sees only its own company record", companiesSeen.length === 1 && companiesSeen[0].id === A.companyId);
  let unscopedBlocked = false;
  try {
    await db().select().from(tables.projects).limit(1);
  } catch (err) {
    unscopedBlocked = /outside withTenant/.test(String(err));
  }
  check("customer query outside any scope is refused by the code (fail closed)", unscopedBlocked);

  console.log("\n7 · Role credits (ADR-011)");
  await d.insert(tables.creditLedger).values([
    { companyId: A.companyId, kind: "grant", delta: 1, contractRef: "TEST-A", createdBy: A.admin.id },
    { companyId: B.companyId, kind: "grant", delta: 5, contractRef: "TEST-B", createdBy: B.admin.id },
  ]);
  check("A's balance counts only A's grants", (await retry(() => withTenant(A.companyId, () => creditBalance(A.companyId)))) === 1);
  const ledgerA = await retry(() => withTenant(A.companyId, () => db().select().from(tables.creditLedger)));
  check("A's ledger shows no row of B's", ledgerA.length === 1 && ledgerA.every((r) => r.companyId === A.companyId));
  // Two simultaneous "open role" attempts with ONE credit left: exactly one wins.
  const attempt = () =>
    retry(() =>
      withTenant(A.companyId, async () => {
        await lockCompanyCredits(A.companyId);
        if ((await creditBalance(A.companyId)) < 1) return false;
        await db().insert(tables.creditLedger).values({ companyId: A.companyId, kind: "spend", delta: -1, createdBy: A.member.id });
        return true;
      })
    );
  const results = await Promise.all([attempt(), attempt()]);
  check("two simultaneous opens on 1 credit: exactly one succeeds", results.filter(Boolean).length === 1);
  check("…and the balance ends at 0, never below", (await retry(() => withTenant(A.companyId, () => creditBalance(A.companyId)))) === 0);

  // Admin corrections: never below zero, always logged, invisible to customers.
  const tooMuch = await adjustCredits({ companyId: A.companyId, delta: -1, reason: "test: overdraw", adminUserId: A.admin.id });
  check("an admin correction cannot take the balance below zero", !tooMuch.ok);
  const plus = await adjustCredits({ companyId: A.companyId, delta: 2, reason: "test: contract amended", adminUserId: A.admin.id });
  check("an admin correction adds a signed entry", plus.ok && plus.balance === 2);
  const logged = await d.select().from(tables.adminAudit).where(eq(tables.adminAudit.companyId, A.companyId));
  check("every correction is in the admin activity log", logged.some((r) => r.action === "credits.adjust"));

  // One "update" box (2026-10-18): set the balance; the ledger records the difference.
  const up = { companyId: A.companyId, reference: "test: SPP-1", priceAmount: 9000, priceCurrency: "EUR" as const, note: null, adminUserId: A.admin.id };
  const toFive = await setCreditBalance({ ...up, newBalance: 5, expectedBalance: 2 });
  check("update 2 → 5 records a grant of +3", toFive.ok && toFive.balance === 5);
  const stale = await setCreditBalance({ ...up, newBalance: 7, expectedBalance: 2 });
  check("an update based on an out-of-date balance is refused", !stale.ok);
  const toOne = await setCreditBalance({ ...up, reference: "test: amended", newBalance: 1, expectedBalance: 5 });
  check("update 5 → 1 records a correction of −4", toOne.ok && toOne.balance === 1);
  const entries = await d.select().from(tables.creditLedger).where(eq(tables.creditLedger.companyId, A.companyId));
  check("…as a grant with the contract and price, then an adjustment with the reason",
    entries.some((e) => e.kind === "grant" && e.delta === 3 && e.contractRef === "test: SPP-1" && e.priceAmount === 9000) &&
    entries.some((e) => e.kind === "adjustment" && e.delta === -4 && (e.note ?? "").includes("test: amended")));
  check("…and the balance is 1", (await retry(() => withTenant(A.companyId, () => creditBalance(A.companyId)))) === 1);

  // Deliberate refusals run LAST: each must come from the database's security
  // rules (42501). The throwaway PGlite socket can drop a connection after a
  // refused query, so nothing that needs a healthy connection runs after them.
  console.log("\n7b · Company documents (D9)");
  await d.insert(tables.companyDocuments).values([
    { companyId: A.companyId, filename: "a-values.md", content: "A values", uploadedBy: A.member.id },
    { companyId: B.companyId, filename: "b-values.md", content: "B values", uploadedBy: B.member.id },
    { companyId: A.companyId, filename: "a-internal.md", content: "hidden", visibleToCustomer: false, uploadedBy: A.admin.id },
  ]);
  const docsA = await retry(() => withTenant(A.companyId, () => db().select().from(tables.companyDocuments)));
  check("A sees its own visible documents only", docsA.length === 1 && docsA[0].filename === "a-values.md");
  const delB = await retry(() =>
    withTenant(A.companyId, () =>
      db().delete(tables.companyDocuments).where(eq(tables.companyDocuments.filename, "b-values.md")).returning({ id: tables.companyDocuments.id })
    )
  );
  check("A cannot delete B's documents", delB.length === 0);

  console.log("\n8 · Refused by the database (row-level security, grants)");
  // Refusals must come from the database's security rules (42501), not any error.
  check(
    "scope A cannot WRITE a row into company B (refused by the database)",
    await deniedByDatabase(() =>
      withTenant(A.companyId, () =>
        db().insert(tables.projects).values({ companyId: B.companyId, title: "planted in B", createdBy: A.member.id })
      )
    )
  );
  check(
    "customer scope cannot read Company Intel at all (refused by the database)",
    await deniedByDatabase(() => withTenant(A.companyId, () => db().select().from(tables.intelCompanies).limit(1)))
  );
  check(
    "a customer cannot GRANT itself credits (refused by the database)",
    await deniedByDatabase(() =>
      withTenant(A.companyId, () =>
        db().insert(tables.creditLedger).values({ companyId: A.companyId, kind: "grant", delta: 50, createdBy: A.member.id })
      )
    )
  );
  check(
    "a customer cannot write a spend into another company",
    await deniedByDatabase(() =>
      withTenant(A.companyId, () =>
        db().insert(tables.creditLedger).values({ companyId: B.companyId, kind: "spend", delta: -1, createdBy: A.member.id })
      )
    )
  );
  check(
    "a customer cannot rewrite or erase credit history",
    (await deniedByDatabase(() =>
      withTenant(A.companyId, () => db().update(tables.creditLedger).set({ delta: 99 }))
    )) &&
      (await deniedByDatabase(() => withTenant(A.companyId, () => db().delete(tables.creditLedger))))
  );
  check(
    "A cannot add a document to company B (refused by the database)",
    await deniedByDatabase(() =>
      withTenant(A.companyId, () =>
        db().insert(tables.companyDocuments).values({ companyId: B.companyId, filename: "x", content: "x", uploadedBy: A.member.id })
      )
    )
  );
  check(
    "customers cannot read the admin activity log (refused by the database)",
    await deniedByDatabase(() => withTenant(A.companyId, () => db().select().from(tables.adminAudit).limit(1)))
  );

  console.log("\n9 · Every customer API route goes through the access layer");
  const apiRoot = path.join(process.cwd(), "src/app/api");
  const exempt: Record<string, string> = {
    "company-intel": "admin-only research tool — requireAdmin (ADR-009)",
    admin: "admin-only back office — adminOr404 / requireAdmin (ADR-011)",
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
    // Database calls must run in a tenant scope: the whole route (tenantRoute),
    // or — for streaming routes — every persistence step (withTenant / helpers
    // that take the company explicitly).
    const tenantScoped = /tenantRoute\(|withTenant\(|companyId: user\.companyId|scopeCompanyId/.test(src);
    check(
      `${rel}`,
      authed && scoped && tenantScoped,
      `${authed ? "" : "no requireUser "}${scoped ? "" : "no company/project check "}${tenantScoped ? "" : "no tenant scope"}`
    );
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
