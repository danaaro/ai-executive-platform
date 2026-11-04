import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { adminDb, tables } from "@/db";
import { dbEnabled, getUserNames } from "@/shared/current-user";
import { kitAccess, loadKit } from "@/shared/kit-store";
import { assembleInputTexts } from "@/shared/kit-inputs";
import { howWeAssess } from "@/orchestrator/interview-kit";

/**
 * One kit version for the kit screen: Part 1 (fixed text), the two generated
 * parts, the choices it was built from (uploaded documents by name only) and
 * whether a newer job description exists ("Built from JD v2 · v3 is available").
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; kitId: string }> }) {
  if (!dbEnabled()) return NextResponse.json({ error: "No persistence" }, { status: 503 });
  const { id, kitId } = await params;
  const access = await kitAccess(id, false);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const kit = await loadKit(id, kitId);
  if (!kit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [latestJd] = await adminDb()
    .select({ version: tables.artifacts.version })
    .from(tables.artifacts)
    .where(and(eq(tables.artifacts.projectId, id), eq(tables.artifacts.agentSlug, "job-description")))
    .orderBy(desc(tables.artifacts.version))
    .limit(1);
  let company = "";
  try {
    company = (await assembleInputTexts(id, kit.envelope.inputs)).company;
  } catch {
    /* the JD version was removed; the kit still shows */
  }
  const names = await getUserNames([kit.createdBy]);
  const { extra, ...inputs } = kit.envelope.inputs;

  return NextResponse.json({
    id: kit.id,
    version: kit.version,
    createdAt: kit.createdAt.toISOString(),
    createdByName: names[kit.createdBy] ?? "",
    company,
    howWeAssess: howWeAssess(company || "Company"),
    inputs: { ...inputs, extra: extra.map((e) => ({ name: e.name })) },
    parts: kit.envelope.parts,
    latestJdVersion: latestJd?.version ?? null,
    canWrite: access.role !== "viewer",
  });
}
