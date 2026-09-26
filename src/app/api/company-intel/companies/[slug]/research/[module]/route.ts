import { NextRequest, NextResponse } from "next/server";
import { agentStreamResponse } from "@/shared/agent-stream";
import { isModuleId, runResearchModule } from "@/orchestrator/company-intel";
import { adminOr404, companyBySlug } from "../../../../guard";

// One module per request so each gets the full function budget (ADR-009 §5):
// a web-research run is minutes, five plus synthesis would not fit in one.
export const maxDuration = 300;

/**
 * Runs ONE research module. Streams NDJSON: each web search / fetch arrives
 * as a `delta` progress line, then `done`. The page is the orchestrator — it
 * decides which modules are stale and fires them in parallel.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; module: string }> }
) {
  const { user, error } = await adminOr404();
  if (error) return error;
  const { slug, module } = await params;
  if (!isModuleId(module)) return NextResponse.json({ error: "Unknown module" }, { status: 404 });
  const company = await companyBySlug(slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return agentStreamResponse(async (emit) => {
    await runResearchModule({
      companyId: company.id,
      module,
      userId: user.id,
      onProgress: (line) => emit({ type: "delta", text: line + "\n" }),
    });
    emit({ type: "done", conversationId: null });
  });
}
