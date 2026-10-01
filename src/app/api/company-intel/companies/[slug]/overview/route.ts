import { NextRequest, NextResponse } from "next/server";
import { agentStreamResponse } from "@/shared/agent-stream";
import { runOverview } from "@/orchestrator/company-context-writers";
import { adminOr404, companyBySlug } from "../../../guard";

export const maxDuration = 300;

/** Assembles the v2 report from this run's validated sections (ADR-009 §17). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { user, error } = await adminOr404();
  if (error) return error;
  const company = await companyBySlug((await params).slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const runId = typeof body.runId === "string" ? body.runId : null;
  if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: "runId is required" }, { status: 400 });
  const mode = body.mode === "culture-only" ? "culture-only" : "full";

  return agentStreamResponse(async (emit) => {
    await runOverview({ companyId: company.id, runId, mode, userId: user.id, onText: (t) => emit({ type: "delta", text: t }) });
    emit({ type: "done", conversationId: null });
  });
}
