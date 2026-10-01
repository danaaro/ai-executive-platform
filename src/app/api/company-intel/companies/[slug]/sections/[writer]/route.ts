import { NextRequest, NextResponse } from "next/server";
import { agentStreamResponse } from "@/shared/agent-stream";
import { runSectionWriter } from "@/orchestrator/company-context-writers";
import { WRITER_IDS, type WriterId } from "@/shared/company-context";
import { adminOr404, companyBySlug } from "../../../../guard";

// One category writer per request (ADR-009 §17): each fits the function budget.
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; writer: string }> }) {
  const { user, error } = await adminOr404();
  if (error) return error;
  const { slug, writer } = await params;
  if (!WRITER_IDS.includes(writer as WriterId)) return NextResponse.json({ error: "Unknown writer" }, { status: 404 });
  const company = await companyBySlug(slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const runId = typeof body.runId === "string" ? body.runId : null;
  if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: "runId is required" }, { status: 400 });
  const mode = body.mode === "culture-only" ? "culture-only" : "full";

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
