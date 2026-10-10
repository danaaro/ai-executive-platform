import { NextRequest, NextResponse } from "next/server";
import { agentStreamResponse } from "@/shared/agent-stream";
import { runSectionWriter } from "@/orchestrator/company-context-writers";
import { WRITER_IDS, type WriterId } from "@/shared/company-context";
import { runExec10xWriter } from "@/orchestrator/exec10x-writers";
import { isExec10xWriter } from "@/shared/exec10x";
import { adminOr404, companyBySlug } from "../../../../guard";

// One writer per request (ADR-009 §17, §18): each fits the function budget.
// v3 writers: company · market · culture · skills; v2 writers: A–D.
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; writer: string }> }) {
  const { user, error } = await adminOr404();
  if (error) return error;
  const { slug, writer } = await params;
  const v3 = isExec10xWriter(writer);
  if (!v3 && !WRITER_IDS.includes(writer as WriterId)) return NextResponse.json({ error: "Unknown writer" }, { status: 404 });
  const company = await companyBySlug(slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const runId = typeof body.runId === "string" ? body.runId : null;
  if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: "runId is required" }, { status: 400 });
  const mode = body.mode === "culture-only" ? "culture-only" : "full";

  if (v3) {
    return agentStreamResponse(async (emit) => {
      await runExec10xWriter({ companyId: company.id, writer, runId, userId: user.id, onText: (t) => emit({ type: "delta", text: t }) });
      emit({ type: "done", conversationId: null });
    });
  }

  return agentStreamResponse(async (emit) => {
    const { stats } = await runSectionWriter({
      companyId: company.id,
      writer: writer as WriterId,
      runId,
      mode,
      userId: user.id,
      onText: (t) => emit({ type: "delta", text: t }),
    });
    emit({ type: "delta", text: `\n[stats] ${JSON.stringify(stats)}\n` });
    emit({ type: "done", conversationId: null });
  });
}
