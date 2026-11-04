import { and, desc, eq, sql } from "drizzle-orm";
import { db as tenantDb, tables } from "@/db";
import { canWrite, getProjectAccess, requireUser, type CurrentUser, type ProjectRole } from "@/shared/current-user";
import { KIT_MAX_VERSIONS, KIT_SLUG, type KitEnvelope, type KitPart, type PartResult } from "@/shared/interview-kit-types";

/**
 * Storage for the Interview Kit: one artifact slot per role
 * (agent_slug "interview-kit"), versioned like the job description (PRD §5).
 * The structured kit lives in `envelope`; `content` holds a short label only —
 * downloads render from the envelope.
 *
 * Everything below `kitAccess()` must run inside withTenant() (the routes use
 * tenantRoute, or scope each step while streaming), so row-level security
 * limits every query to the session's company on top of the project filter.
 */

export async function kitAccess(projectId: string, write: boolean): Promise<{ user: CurrentUser; role: ProjectRole } | { error: string; status: number }> {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return { error: "Not found", status: 404 };
  const user = await requireUser();
  if (!user) return { error: "Unauthorized", status: 401 };
  const role = await getProjectAccess(projectId, user);
  if (!role) return { error: "Not found", status: 404 };
  if (write && !canWrite(role)) return { error: "You have view-only access to this role", status: 403 };
  return { user, role };
}

export async function loadKit(projectId: string, kitId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(kitId)) return null;
  const [row] = await tenantDb()
    .select({
      id: tables.artifacts.id,
      version: tables.artifacts.version,
      envelope: tables.artifacts.envelope,
      createdBy: tables.artifacts.createdBy,
      createdAt: tables.artifacts.createdAt,
      companyId: tables.artifacts.companyId,
    })
    .from(tables.artifacts)
    .where(and(eq(tables.artifacts.id, kitId), eq(tables.artifacts.projectId, projectId), eq(tables.artifacts.agentSlug, KIT_SLUG)))
    .limit(1);
  return row ? { ...row, envelope: row.envelope as KitEnvelope } : null;
}

/** A new kit version. Refuses past the per-role cap (K7). */
export async function createKitVersion(
  projectId: string,
  user: CurrentUser,
  envelope: KitEnvelope
): Promise<{ id: string; version: number } | { error: string }> {
  const db = tenantDb();
  const [project] = await db
    .select({ companyId: tables.projects.companyId })
    .from(tables.projects)
    .where(eq(tables.projects.id, projectId))
    .limit(1);
  if (!project) return { error: "Role not found" };
  const [last] = await db
    .select({ version: tables.artifacts.version })
    .from(tables.artifacts)
    .where(and(eq(tables.artifacts.projectId, projectId), eq(tables.artifacts.agentSlug, KIT_SLUG)))
    .orderBy(desc(tables.artifacts.version))
    .limit(1);
  const version = (last?.version ?? 0) + 1;
  if (version > KIT_MAX_VERSIONS) {
    return { error: `This role has reached ${KIT_MAX_VERSIONS} interview kit versions, the maximum.` };
  }
  const [row] = await db
    .insert(tables.artifacts)
    .values({
      companyId: project.companyId,
      projectId,
      agentSlug: KIT_SLUG,
      version,
      label: `Interview kit v${version}`,
      artifactType: "final-output",
      status: "draft",
      content: `Interview kit v${version}`,
      envelope,
      createdBy: user.id,
    })
    .returning({ id: tables.artifacts.id, version: tables.artifacts.version });
  return row;
}

/**
 * Stores one part's result. A single atomic jsonb update, so the two parts —
 * written by two parallel requests — never overwrite each other.
 */
export async function savePart(projectId: string, kitId: string, part: KitPart, result: PartResult): Promise<void> {
  await tenantDb()
    .update(tables.artifacts)
    .set({
      envelope: sql`jsonb_set(coalesce(${tables.artifacts.envelope}, '{}'::jsonb), ${`{parts,${part}}`}::text[], ${JSON.stringify(result)}::jsonb, true)`,
    })
    .where(and(eq(tables.artifacts.id, kitId), eq(tables.artifacts.projectId, projectId), eq(tables.artifacts.agentSlug, KIT_SLUG)));
}
