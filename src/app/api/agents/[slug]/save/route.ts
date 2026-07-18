import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAgent } from "@/orchestrator/agent-orchestrator";

/**
 * Persists a finished agent artifact to generated/outputs/<slug>/ as a
 * Markdown file plus a JSON envelope. The envelope is the exact shape a
 * future `artifacts` database table ingests (DB decision still open) —
 * file persistence now, database later.
 */

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "artifact"
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
  }

  const { userId } = await auth();
  const body = await req.json();
  const content: string = body.content;
  const label: string = body.label || "artifact";

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Hosted preview: the serverless filesystem is ephemeral — files written
  // here would vanish after the request. Be honest instead of pretending.
  // Real persistence arrives with the database layer.
  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        error:
          "Saving artifacts isn't available on the hosted preview yet — copy the output from the chat. (File/database persistence is coming.)",
      },
      { status: 501 }
    );
  }

  try {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const base = `${stamp}-${slugify(label)}`;
    const dir = path.join(process.cwd(), "generated/outputs", slug);
    fs.mkdirSync(dir, { recursive: true });

    const mdPath = path.join(dir, `${base}.md`);
    fs.writeFileSync(mdPath, content, "utf-8");

    // DB-ready envelope: future `artifacts` table row.
    const envelope = {
      agent: slug,
      agentTitle: agent.title,
      promptVersion: "1.0",
      artifactType: body.artifactType ?? "final-output",
      label,
      createdBy: userId ?? "unknown",
      createdAt: now.toISOString(),
      inputsSummary: body.inputsSummary ?? null,
      contentFile: `${base}.md`,
      content,
    };
    fs.writeFileSync(
      path.join(dir, `${base}.json`),
      JSON.stringify(envelope, null, 2),
      "utf-8"
    );

    return NextResponse.json({
      saved: true,
      path: `generated/outputs/${slug}/${base}.md`,
    });
  } catch (err) {
    console.error(`[agents/${slug}/save]`, err);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
