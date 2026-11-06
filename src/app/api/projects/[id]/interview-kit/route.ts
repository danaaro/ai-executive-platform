import { NextRequest, NextResponse } from "next/server";
import { dbEnabled } from "@/shared/current-user";
import { tenantRoute } from "@/shared/tenant-route";
import { checkUploadedDocument } from "@/shared/security-flags";
import { briefingNotes, kitOptions, sanitizeInputs } from "@/shared/kit-inputs";
import { createKitVersion, kitAccess, loadKit } from "@/shared/kit-store";
import { evaluate, KIT_PROMPT_VERSION } from "@/orchestrator/interview-kit";
import { MODELS } from "@/shared/models";
import { errorSummary } from "@/shared/safe-log";
import { KIT_PARTS, type KitEnvelope, type KitPart, type PartResult } from "@/shared/interview-kit-types";

/**
 * Interview Kit for one role (PRD §3–§5).
 *
 *   GET  → the input screen's options (JD versions, sources, competencies,
 *          defaults) and the role's kit versions.
 *          ?briefingNotes=1 → the briefing's confidential answers, for the
 *          optional "Add the confidential briefing answers" link (K3).
 *   POST → a new kit version, one of:
 *          { inputs }                          build from a fresh selection
 *          { fromKitId, regenerate: part }     same inputs, that part written again
 *          { fromKitId, edits: {screen?, interviews?} }  the user's in-place edits
 *          Generation itself runs in …/[kitId]/generate, one request per part.
 */

export const GET = tenantRoute(async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const { id } = await params;
  const access = await kitAccess(id, false);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  if (req.nextUrl.searchParams.get("briefingNotes")) {
    return NextResponse.json({ notes: await briefingNotes(id) });
  }
  const options = await kitOptions(id);
  if (!options) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...options, canWrite: access.role !== "viewer" });
});

export const POST = tenantRoute(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const { id } = await params;
  const access = await kitAccess(id, true);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    let envelope: KitEnvelope;
    if (typeof body.fromKitId === "string") {
      const from = await loadKit(id, body.fromKitId);
      if (!from) return NextResponse.json({ error: "Kit not found" }, { status: 404 });
      envelope = structuredClone(from.envelope);
      if (KIT_PARTS.includes(body.regenerate as KitPart)) {
        delete envelope.parts[body.regenerate as KitPart];
      } else if (body.edits && typeof body.edits === "object") {
        for (const part of KIT_PARTS) {
          const data = (body.edits as Record<string, unknown>)[part];
          if (data === undefined) continue;
          if (JSON.stringify(data).length > 400_000) return NextResponse.json({ error: "The edited kit is too large." }, { status: 400 });
          const checks = evaluate(part, data);
          if (checks.failures.some((f) => f.startsWith("schema:"))) {
            return NextResponse.json({ error: "The edit could not be saved: the kit's structure changed." }, { status: 400 });
          }
          const prev = envelope.parts[part];
          envelope.parts[part] = {
            status: "done",
            data: data as PartResult["data"],
            failures: checks.failures,
            warnings: checks.warnings,
            truncated: prev?.truncated ?? false,
            repaired: prev?.repaired ?? false,
            ms: prev?.ms ?? 0,
          };
        }
      } else {
        return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
      }
    } else {
      const checked = await sanitizeInputs(id, body.inputs);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
      // Documents added for this kit: instructions aimed at AI tools are
      // refused and flagged (Dana 2026-11-06).
      for (const doc of checked.inputs.extra) {
        const refused = await checkUploadedDocument({
          companyId: access.user.companyId,
          projectId: id,
          userId: access.user.id,
          source: "interview-kit",
          filename: doc.name || "added document",
          text: doc.text,
        });
        if (refused) return NextResponse.json({ error: `${doc.name || "An added document"}: ${refused}` }, { status: 422 });
      }
      envelope = { inputs: checked.inputs, parts: {}, promptVersion: KIT_PROMPT_VERSION, model: MODELS.KIT_WRITER };
    }
    const created = await createKitVersion(id, access.user, envelope);
    if ("error" in created) return NextResponse.json({ error: created.error }, { status: 409 });
    return NextResponse.json(created);
  } catch (err) {
    console.error("[interview-kit] create failed:", errorSummary(err));
    return NextResponse.json({ error: "Could not create the interview kit" }, { status: 500 });
  }
});
