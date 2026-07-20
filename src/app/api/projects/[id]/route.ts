import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { requireUser, dbEnabled, isPersistableAgent } from "@/shared/current-user";
import { AGENT_REGISTRY } from "@/orchestrator/agent-orchestrator";

/**
 * Project workspace detail (ADR-007): the project itself, its artifacts
 * grouped into per-agent slots (latest version highlighted, full history
 * kept), and its conversations for resuming. Only agents that persist to
 * the DB (ADR-006 §5) get a slot — Phase-2 personal-data agents stay
 * outside the project model entirely.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const d = db();
  const [project] = await d
    .select()
    .from(tables.projects)
    .where(eq(tables.projects.id, id))
    .limit(1);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.createdBy !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const artifactRows = await d
    .select({
      id: tables.artifacts.id,
      agentSlug: tables.artifacts.agentSlug,
      version: tables.artifacts.version,
      label: tables.artifacts.label,
      status: tables.artifacts.status,
      createdAt: tables.artifacts.createdAt,
    })
    .from(tables.artifacts)
    .where(eq(tables.artifacts.projectId, id))
    .orderBy(desc(tables.artifacts.version));

  const conversations = await d
    .select({
      id: tables.conversations.id,
      agentSlug: tables.conversations.agentSlug,
      title: tables.conversations.title,
      updatedAt: tables.conversations.updatedAt,
    })
    .from(tables.conversations)
    .where(eq(tables.conversations.projectId, id))
    .orderBy(desc(tables.conversations.updatedAt));

  const slotSlugs = AGENT_REGISTRY.filter((a) => isPersistableAgent(a.slug)).map((a) => ({
    slug: a.slug,
    title: a.title,
  }));

  const slots = slotSlugs.map(({ slug, title }) => {
    const versions = artifactRows
      .filter((r) => r.agentSlug === slug)
      .sort((a, b) => b.version - a.version);
    return { slug, title, latest: versions[0] ?? null, history: versions };
  });

  return NextResponse.json({
    project,
    isOwner: project.createdBy === user.id,
    slots,
    conversations,
  });
}
