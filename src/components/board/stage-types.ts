/**
 * Client-side mirror of the stage shape returned by /api/projects/[id],
 * derived server-side in src/orchestrator/stages.ts. Kept as a separate
 * module so client components never import the server orchestrator (which
 * reads the filesystem).
 */

export type StageStatus = "done" | "active" | "warning" | "not-started";

export type ArtifactRef = {
  id: string;
  agentSlug: string;
  version: number;
  label: string;
  status: "draft" | "approved";
  createdAt: string;
};

export type Stage = {
  slug: string;
  title: string;
  name: string;
  order: number;
  phase: 1 | 2;
  status: StageStatus;
  latest: ArtifactRef | null;
  approved: ArtifactRef | null;
  history: ArtifactRef[];
  threadId: string | null;
  blockedBy: { slug: string; name: string }[];
  inheritedFrom: { agentSlug: string; name: string; version: number }[];
};

export type ProjectDetail = {
  project: {
    id: string;
    title: string;
    status: "open" | "draft" | "filled" | "archived";
    ownerName: string;
    createdAt: string;
    updatedAt: string;
  };
  viewerRole: "owner" | "editor" | "viewer" | "admin";
  canWrite: boolean;
  canAdminister: boolean;
  stages: Stage[];
  conversations: { id: string; agentSlug: string; title: string | null; updatedAt: string }[];
  members: { id: string; name: string | null; role: string; pending: boolean }[];
};

export const STAGE_LABEL: Record<StageStatus, string> = {
  done: "done",
  active: "active",
  warning: "open anyway",
  "not-started": "not started",
};

export function stageTone(status: StageStatus): "done" | "active" | "warn" | "neutral" {
  if (status === "done") return "done";
  if (status === "active") return "active";
  if (status === "warning") return "warn";
  return "neutral";
}
