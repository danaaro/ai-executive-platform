import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { creditBalance, isCurrency, lockCompanyCredits } from "@/shared/credits";

/**
 * Open a role (ADR-011): spends one role credit and locks the title and salary
 * range. Must run inside `withTenant(companyId)` — one transaction, filtered by
 * row-level security to that company. A per-company lock stops two
 * simultaneous requests from spending the same last credit; the database's own
 * policy only lets a −1 spend be written for the scoped company.
 *
 * Two callers: a customer opening a role in their own company, and an admin
 * opening one for a customer company (`onBehalf`, Dana 2026-10-18). On behalf,
 * the admin is not a member of the company, so the hiring manager must be
 * someone else and no owner row is written for the admin.
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_SALARY = 100_000_000;

type Result = { status: number; json: Record<string, unknown> };
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Result => ({
  status,
  json: { error, ...extra },
});

export async function openRole(opts: {
  companyId: string;
  actor: { id: string; email: string | null };
  body: Record<string, unknown>;
  onBehalf: boolean;
  invite: (email: string) => Promise<unknown>;
}): Promise<Result> {
  const { companyId, actor, body, onBehalf } = opts;

  const title = String(body.title ?? "").trim();
  if (!title || title.length > 120) return fail(400, "Give the role a title (up to 120 characters).");
  const salaryMin = Number(body.salaryMin);
  const salaryMax = Number(body.salaryMax);
  if (
    !Number.isInteger(salaryMin) ||
    !Number.isInteger(salaryMax) ||
    salaryMin <= 0 ||
    salaryMax < salaryMin ||
    salaryMax > MAX_SALARY
  ) {
    return fail(400, "Enter the annual base salary range as whole numbers, minimum first.");
  }
  if (!isCurrency(body.salaryCurrency)) return fail(400, "Choose the salary currency.");
  const salaryCurrency = body.salaryCurrency;
  const showSalaryOnJd = body.showSalaryOnJd === true;

  // The hiring manager approves the job description (enforced in JD v3):
  // the person opening the role, or a colleague by email. An admin opening a
  // role on behalf always names the customer's hiring manager.
  const self = onBehalf ? "" : (actor.email ?? "").toLowerCase();
  const hmEmailRaw = body.hiringManagerEmail == null ? "" : String(body.hiringManagerEmail).trim().toLowerCase();
  if (onBehalf && !EMAIL.test(hmEmailRaw)) return fail(400, "Enter the customer's hiring manager email.");
  const hmIsSelf = !onBehalf && (!hmEmailRaw || hmEmailRaw === self);
  if (!hmIsSelf && !EMAIL.test(hmEmailRaw)) return fail(400, "Enter a valid email for the hiring manager.");

  // Collaborators invited at creation (#4c). Invites are by email and may
  // precede the account — they bind to a Clerk id on first sign-in
  // (ADR-008 §2).
  const invites: { email: string; role: "editor" | "viewer" }[] = Array.isArray(body.invites)
    ? (body.invites as { email?: unknown; role?: unknown }[])
        .slice(0, 20)
        .map((i) => ({
          email: String(i?.email ?? "")
            .trim()
            .toLowerCase(),
          role: i?.role === "editor" ? ("editor" as const) : ("viewer" as const),
        }))
        .filter((i) => EMAIL.test(i.email) && i.email !== self)
    : [];
  // The hiring manager always gets editor access to the role.
  if (!hmIsSelf && !invites.some((i) => i.email === hmEmailRaw)) {
    invites.push({ email: hmEmailRaw, role: "editor" });
  }

  const d = db();
  await lockCompanyCredits(companyId);
  const balance = await creditBalance(companyId);
  if (balance < 1) return fail(402, "No role credits left — contact us to add more.", { credits: balance });

  let hiringManagerUserId: string | null = hmIsSelf ? actor.id : null;
  if (!hmIsSelf) {
    // Already a user of this company? (Row-level security: own company only.)
    const [existing] = await d
      .select({ id: tables.users.id })
      .from(tables.users)
      .where(eq(tables.users.email, hmEmailRaw))
      .limit(1);
    hiringManagerUserId = existing?.id ?? null;
  }

  const [row] = await d
    .insert(tables.projects)
    .values({
      companyId,
      title,
      createdBy: actor.id,
      salaryMin,
      salaryMax,
      salaryCurrency,
      showSalaryOnJd,
      hiringManagerUserId,
      hiringManagerEmail: hmIsSelf ? self || null : hmEmailRaw,
    })
    .returning({ id: tables.projects.id, title: tables.projects.title });

  await d.insert(tables.creditLedger).values({
    companyId,
    kind: "spend",
    delta: -1,
    projectId: row.id,
    note: title,
    createdBy: actor.id,
  });

  // The creator's owner row. getProjectAccess() also treats `createdBy` as
  // owner, so this is belt-and-braces — but it keeps membership listings
  // complete, which is what the sharing UI reads. Not for an admin acting on
  // behalf: they are not part of the customer company.
  const memberValues = [
    ...(onBehalf
      ? []
      : [{ companyId, projectId: row.id, userId: actor.id, role: "owner" as const, acceptedAt: new Date() }]),
    ...invites.map((i) => ({
      companyId,
      projectId: row.id,
      invitedEmail: i.email,
      role: i.role,
      invitedBy: actor.id,
    })),
  ];
  if (memberValues.length) await d.insert(tables.projectMembers).values(memberValues).onConflictDoNothing();
  // Invitees must be in the company to reach the role (ADR-010).
  await Promise.all(invites.map((i) => opts.invite(i.email)));

  return { status: 200, json: { project: row, invited: invites.length, credits: balance - 1 } };
}
