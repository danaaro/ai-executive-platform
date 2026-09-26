import { NextRequest, NextResponse } from "next/server";
import { agentStreamResponse } from "@/shared/agent-stream";
import { runSynthesis } from "@/orchestrator/company-intel";
import { adminOr404, companyBySlug } from "../../../guard";

export const maxDuration = 300;

/** Opus synthesis → new draft versions of the brief (full) and culture profile. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { user, error } = await adminOr404();
  if (error) return error;
  const company = await companyBySlug((await params).slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "full" ? "full" : "culture-only";

  return agentStreamResponse(async (emit) => {
    await runSynthesis({
      companyId: company.id,
      mode,
      userId: user.id,
      onText: (text) => emit({ type: "delta", text }),
    });
    emit({ type: "done", conversationId: null });
  });
}
