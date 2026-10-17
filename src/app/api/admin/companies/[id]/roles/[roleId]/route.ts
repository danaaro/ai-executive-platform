import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { adminOr404 } from "@/app/api/company-intel/guard";
import { logAdminAction } from "@/shared/credits";
import { getUserNames } from "@/shared/current-user";
import { isSyntheticOpener } from "@/shared/intake-openers";
import { splitIntakeBlock } from "@/shared/intake-answers";
import { adminDb, tables } from "@/db";

/**
 * Admin: one customer role, read-only — facts, job description versions and
 * the briefing conversation. The audited cross-company path (ADR-010 §1):
 * admins cannot open another company's role through the customer screens, so
 * this is how they look inside; every view is logged as `role.view`.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; roleId: string }> }) {
  const gate = await adminOr404();
  if (gate.error) return gate.error;
  const { id, roleId } = await params;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(id) || !uuid.test(roleId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = adminDb();
  const [role] = await db
    .select({
      id: tables.projects.id,
      title: tables.projects.title,
      status: tables.projects.status,
      salaryMin: tables.projects.salaryMin,
      salaryMax: tables.projects.salaryMax,
      salaryCurrency: tables.projects.salaryCurrency,
      showSalaryOnJd: tables.projects.showSalaryOnJd,
      hiringManagerEmail: tables.projects.hiringManagerEmail,
      createdBy: tables.projects.createdBy,
      createdAt: tables.projects.createdAt,
      companyName: tables.companies.name,
    })
    .from(tables.projects)
    .innerJoin(tables.companies, eq(tables.companies.id, tables.projects.companyId))
    .where(and(eq(tables.projects.id, roleId), eq(tables.projects.companyId, id)))
    .limit(1);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [artifacts, conversations] = await Promise.all([
    db
      .select({
        id: tables.artifacts.id,
        agentSlug: tables.artifacts.agentSlug,
        version: tables.artifacts.version,
        status: tables.artifacts.status,
        content: tables.artifacts.content,
        createdBy: tables.artifacts.createdBy,
        createdAt: tables.artifacts.createdAt,
      })
      .from(tables.artifacts)
      .where(eq(tables.artifacts.projectId, roleId))
      .orderBy(desc(tables.artifacts.version)),
    db
      .select({ id: tables.conversations.id, agentSlug: tables.conversations.agentSlug, updatedAt: tables.conversations.updatedAt })
      .from(tables.conversations)
      .where(eq(tables.conversations.projectId, roleId))
      .orderBy(desc(tables.conversations.updatedAt)),
  ]);
  const messages = conversations.length
    ? await db
        .select({
          conversationId: tables.messages.conversationId,
          role: tables.messages.role,
          content: tables.messages.content,
          createdAt: tables.messages.createdAt,
        })
        .from(tables.messages)
        .where(inArray(tables.messages.conversationId, conversations.map((c) => c.id)))
        .orderBy(asc(tables.messages.createdAt), asc(tables.messages.seq))
    : [];

  await logAdminAction({ adminUserId: gate.user.id, action: "role.view", companyId: id, details: { roleId } });

  const names = await getUserNames([role.createdBy, ...artifacts.map((a) => a.createdBy)]);
  return NextResponse.json({
    role: { ...role, createdBy: names[role.createdBy] ?? role.createdBy },
    artifacts: artifacts.map((a) => ({ ...a, createdBy: names[a.createdBy] ?? a.createdBy })),
    // What the customer saw: platform trigger turns and the hidden intake
    // record are left out.
    messages: messages
      .filter((m) => !(m.role === "user" && isSyntheticOpener(m.content)))
      .map((m) => ({
        role: m.role,
        content: m.role === "assistant" ? splitIntakeBlock(m.content).visibleText : m.content,
        createdAt: m.createdAt,
      })),
  });
}
