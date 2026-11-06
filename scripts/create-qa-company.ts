import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";

/**
 * Creates "QA Test Co", the sandbox company the ux-reviewer agent may create,
 * edit and delete in (the local dev server uses the live database). Same path
 * as Admin → Add company: a Clerk organization, the company row and an opening
 * grant of test credits, logged as an admin action. Refuses if it exists.
 *
 *   npx tsx scripts/create-qa-company.ts <admin-email>
 */

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const NAME = "QA Test Co";
const CREDITS = 3;

async function main() {
  loadEnv();
  const email = (process.argv[2] ?? "").toLowerCase();
  if (!email) throw new Error("Usage: npx tsx scripts/create-qa-company.ts <admin-email>");
  const { adminDb, tables } = await import("../src/db");
  const { createCompany } = await import("../src/shared/credits");

  const [admin] = await adminDb()
    .select({ id: tables.users.id, role: tables.users.role })
    .from(tables.users)
    .where(eq(tables.users.email, email))
    .limit(1);
  if (admin?.role !== "admin") throw new Error(`${email} is not a super admin in the users table`);

  const [exists] = await adminDb().select({ id: tables.companies.id }).from(tables.companies).where(eq(tables.companies.name, NAME)).limit(1);
  if (exists) {
    console.log(`${NAME} already exists: ${exists.id}`);
    return;
  }

  const result = await createCompany({
    name: NAME,
    intelCompanyId: null,
    credits: CREDITS,
    reference: "QA sandbox, not billable",
    priceAmount: null,
    priceCurrency: null,
    note: "Test company for ux-reviewer checks. Safe to create, edit and archive here.",
    adminUserId: admin.id,
  });
  if (!result.ok) throw new Error(result.error);
  console.log(`Created ${NAME}: ${result.companyId} with ${CREDITS} credits`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
