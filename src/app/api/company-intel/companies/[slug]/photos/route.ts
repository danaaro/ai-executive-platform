import { NextRequest, NextResponse } from "next/server";
import { agentStreamResponse } from "@/shared/agent-stream";
import { addPersonaPhotos } from "@/orchestrator/company-intel";
import { adminOr404, companyBySlug } from "../../../guard";

export const maxDuration = 300;

/** Finds official photos for the latest report's key personas (see persona-photos.ts). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { error } = await adminOr404();
  if (error) return error;
  const company = await companyBySlug((await params).slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return agentStreamResponse(async (emit) => {
    const found = await addPersonaPhotos(company.id);
    emit({ type: "delta", text: `${found} photo(s) found\n` });
    emit({ type: "done", conversationId: null });
  });
}
