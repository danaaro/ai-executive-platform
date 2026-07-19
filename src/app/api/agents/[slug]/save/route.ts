import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { getAgent } from "@/orchestrator/agent-orchestrator";
import { requireUser, dbEnabled } from "@/shared/current-user";
import { db, tables } from "@/db";

/**
 * Saves a finished agent artifact into the versioned artifacts table
 * (ADR-006 §4): one slot per (owner, agent), version = latest + 1,
 * status starts as "draft" (approve flow = build-queue step 4).
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
  }
  if (!dbEnabled()) {
    return NextResponse.json(
      { error: "Persistence is not configured (DATABASE_URL missing)." },
      { status: 503 }
    );
  }

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const content: string = body.content;
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  try {
    const d = db();
    const [latest] = await d
      .select({ version: tables.artifacts.version })
      .from(tables.artifacts)
      .where(
        and(
          eq(tables.artifacts.createdBy, user.id),
          eq(tables.artifacts.agentSlug, slug)
        )
      )
      .orderBy(desc(tables.artifacts.version))
      .limit(1);
    const version = (latest?.version ?? 0) + 1;

    const [row] = await d
      .insert(tables.artifacts)
      .values({
        agentSlug: slug,
        version,
        label: body.label || agent.title,
        artifactType: body.artifactType ?? "final-output",
        content,
        envelope: {
          agentTitle: agent.title,
          promptVersion: "1.0",
          inputsSummary: body.inputsSummary ?? null,
        },
        conversationId: body.conversationId ?? null,
        createdBy: user.id,
      })
      .returning({ id: tables.artifacts.id, version: tables.artifacts.version });

    return NextResponse.json({
      saved: true,
      id: row.id,
      version: row.version,
      path: `artifacts/${slug} · v${row.version}`,
    });
  } catch (err) {
    console.error(`[agents/${slug}/save]`, err);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
