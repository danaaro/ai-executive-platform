import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/db";
import { logActingWrite } from "@/shared/acting-audit";
import { dbEnabled, requireUser } from "@/shared/current-user";
import { agentStreamResponse } from "@/shared/agent-stream";
import { kitAccess, loadKit, savePart } from "@/shared/kit-store";
import { assembleInputTexts } from "@/shared/kit-inputs";
import { assemblePrompt, inputBlockA, leadershipBlock, writePart } from "@/orchestrator/interview-kit";
import { errorSummary } from "@/shared/safe-log";
import { KIT_PARTS, type KitPart } from "@/shared/interview-kit-types";

/**
 * Writes ONE part of a kit version (Susan's PRD §5.2: the two parts run in
 * parallel). The screen calls this twice at once, so each part gets its own
 * function and its own 300 s budget. Streams the agent-stream protocol: the
 * text deltas drive the "Writing… n k characters" status; the part is stored
 * the moment it is finished, so one failed part never loses the other.
 *
 * Streaming, so no transaction stays open across the model call: each
 * database step runs in its own withTenant() scope.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kitId: string }> }) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const { id, kitId } = await params;
  const access = await kitAccess(id, true);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  await logActingWrite(await requireUser(), req);
  const body = (await req.json().catch(() => ({}))) as { part?: string };
  const part = body.part as KitPart;
  if (!KIT_PARTS.includes(part)) return NextResponse.json({ error: "Unknown part" }, { status: 400 });

  const companyId = access.user.companyId;
  const kit = await withTenant(companyId, () => loadKit(id, kitId));
  if (!kit) return NextResponse.json({ error: "Kit not found" }, { status: 404 });
  // A finished part is never rewritten in place: regenerating makes a new version.
  if (kit.envelope.parts[part]) return NextResponse.json({ error: "This part is already written" }, { status: 409 });

  return agentStreamResponse(async (emit) => {
    const inputs = kit.envelope.inputs;
    const texts = await withTenant(companyId, () => assembleInputTexts(id, inputs));
    const system = assemblePrompt(part, {
      company: texts.company,
      language: inputs.language,
      leadershipSelection:
        part === "interviews"
          ? leadershipBlock({ roleLevel: inputs.roleLevel, competencies: inputs.competencies, suggest: inputs.suggest })
          : undefined,
    });
    const user = inputBlockA({ roleAndLevel: inputs.roleAndLevel, jd: texts.jd, intelligence: texts.intelligence, notes: texts.notes });

    const result = await writePart(
      part,
      system,
      user,
      (text) => emit({ type: "delta", text }),
      () => emit({ type: "reset" })
    );
    try {
      await withTenant(companyId, () => savePart(id, kitId, part, result));
    } catch (err) {
      console.error("[interview-kit] save failed:", errorSummary(err));
      throw new Error("The part was written but could not be saved. Please try again.");
    }
    console.info(`[interview-kit] ${part} ${result.status} in ${result.ms} ms, ${result.failures.length} failures, repaired=${result.repaired}`);
    emit({ type: "done", conversationId: null });
  });
}
