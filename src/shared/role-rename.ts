import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import type { CurrentUser } from "@/shared/current-user";
import { createKitVersion } from "@/shared/kit-store";
import { KIT_SLUG, type KitEnvelope } from "@/shared/interview-kit-types";

/**
 * After a super admin corrects a role's title (Dana 2026-11-01: a typo such
 * as "Heqd Of Georgia" must be fixable without redoing anything): the newest
 * job description and the newest interview kit get a NEW version with the old
 * title replaced by the new one. Plain text replacement, no model call, no
 * credit; earlier versions stay as they were. A new JD version is a draft and
 * needs approving again, like any other version.
 *
 * Runs inside the caller's tenant scope (the role's company).
 */
export async function applyTitleToDocuments(
  projectId: string,
  oldTitle: string,
  newTitle: string,
  user: CurrentUser
): Promise<{ jdVersion: number | null; kitVersion: number | null; kitError?: string }> {
  const pattern = new RegExp(oldTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const replace = (text: string) => text.replace(pattern, newTitle);
  const d = db();

  const newest = async (slug: string) =>
    (
      await d
        .select()
        .from(tables.artifacts)
        .where(and(eq(tables.artifacts.projectId, projectId), eq(tables.artifacts.agentSlug, slug)))
        .orderBy(desc(tables.artifacts.version))
        .limit(1)
    )[0];

  let jdVersion: number | null = null;
  const jd = await newest("job-description");
  if (jd && pattern.test(jd.content)) {
    pattern.lastIndex = 0;
    const [row] = await d
      .insert(tables.artifacts)
      .values({
        companyId: jd.companyId,
        projectId,
        agentSlug: jd.agentSlug,
        version: jd.version + 1,
        label: jd.label,
        artifactType: jd.artifactType,
        status: "draft",
        content: replace(jd.content),
        envelope: jd.envelope,
        conversationId: jd.conversationId,
        createdBy: user.id,
      })
      .returning({ version: tables.artifacts.version });
    jdVersion = row.version;
  }
  pattern.lastIndex = 0;

  let kitVersion: number | null = null;
  let kitError: string | undefined;
  const kit = await newest(KIT_SLUG);
  if (kit?.envelope) {
    const before = JSON.stringify(kit.envelope);
    // Every string in the kit, never the JSON syntax around it.
    const after = JSON.stringify(kit.envelope, (_k, v) => (typeof v === "string" ? replace(v) : v));
    if (after !== before) {
      const made = await createKitVersion(projectId, user, JSON.parse(after) as KitEnvelope);
      if ("error" in made) kitError = made.error;
      else kitVersion = made.version;
    }
  }
  return { jdVersion, kitVersion, kitError };
}
