import { AGENT_REGISTRY, type AgentEntry } from "./agent-orchestrator";

/**
 * The pipeline board's stage model (wireframes #1b, #4b).
 *
 * Stage state is DERIVED, never stored — there is no `stages` table. The
 * truth is the artifacts and conversations that already exist; deriving keeps
 * the board honest and means an artifact saved from the legacy chat page
 * still lights up its card. Both `/api/projects` and `/api/projects/[id]`
 * call this so Home's mini indicator and the board can never disagree.
 */

export type StageStatus = "done" | "active" | "warning" | "not-started";

export type ArtifactRef = {
  id: string;
  agentSlug: string;
  version: number;
  label: string;
  status: "draft" | "approved";
  createdAt: Date | string;
};

export type ConversationRef = {
  id: string;
  agentSlug: string;
  title: string | null;
  updatedAt: Date | string;
  messageCount?: number;
};

export type Stage = {
  slug: string;
  title: string;
  name: string;
  order: number;
  phase: 1 | 2;
  status: StageStatus;
  /** Highest version in the slot, whatever its status. */
  latest: ArtifactRef | null;
  /** Highest APPROVED version — the one that feeds downstream. */
  approved: ArtifactRef | null;
  history: ArtifactRef[];
  /**
   * The thread the drawer opens: most recently updated conversation for this
   * slot (ADR-008 / plan G11). One stage, one live thread.
   */
  threadId: string | null;
  /** Dependencies lacking an approved artifact — drives the soft warning. */
  blockedBy: { slug: string; name: string }[];
  /** Approved upstream artifacts this stage will inherit on its first turn. */
  inheritedFrom: { agentSlug: string; name: string; version: number }[];
};

/** The four candidate-agnostic stages that form the Phase-1 pipeline. */
export const BOARD_STAGES: AgentEntry[] = AGENT_REGISTRY.filter(
  (a) => a.stageOrder !== undefined
).sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0));

export const PHASE_1_STAGES = BOARD_STAGES.filter((a) => a.phase === 1);

function byVersionDesc(a: ArtifactRef, b: ArtifactRef) {
  return b.version - a.version;
}

export function deriveStages(opts: {
  artifacts: ArtifactRef[];
  conversations: ConversationRef[];
}): Stage[] {
  const { artifacts, conversations } = opts;

  // First pass: resolve each slot's artifacts so dependency checks in the
  // second pass can consult any stage, including later ones.
  const slots = new Map<string, { latest: ArtifactRef | null; approved: ArtifactRef | null; history: ArtifactRef[] }>();
  for (const agent of BOARD_STAGES) {
    const history = artifacts.filter((a) => a.agentSlug === agent.slug).sort(byVersionDesc);
    slots.set(agent.slug, {
      history,
      latest: history[0] ?? null,
      approved: history.find((a) => a.status === "approved") ?? null,
    });
  }

  return BOARD_STAGES.map((agent) => {
    const slot = slots.get(agent.slug)!;

    const thread = conversations
      .filter((c) => c.agentSlug === agent.slug)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

    const deps = agent.dependsOn ?? [];
    const blockedBy = deps
      .filter((d) => !slots.get(d)?.approved)
      .map((d) => ({ slug: d, name: stageName(d) }));

    const inheritedFrom = deps
      .map((d) => {
        const approved = slots.get(d)?.approved;
        return approved
          ? { agentSlug: d, name: stageName(d), version: approved.version }
          : null;
      })
      .filter((x): x is { agentSlug: string; name: string; version: number } => x !== null);

    let status: StageStatus;
    if (slot.approved) {
      status = "done";
    } else if (slot.latest || thread) {
      // Work has started here — that outranks any dependency warning,
      // because the warning's whole job is to caution before you begin.
      status = "active";
    } else if (blockedBy.length > 0) {
      status = "warning";
    } else {
      status = "not-started";
    }

    return {
      slug: agent.slug,
      title: agent.title,
      name: agent.stageName,
      order: agent.stageOrder ?? 0,
      phase: agent.phase,
      status,
      latest: slot.latest,
      approved: slot.approved,
      history: slot.history,
      threadId: thread?.id ?? null,
      blockedBy,
      inheritedFrom,
    };
  });
}

export function stageName(slug: string): string {
  return AGENT_REGISTRY.find((a) => a.slug === slug)?.stageName ?? slug;
}

/**
 * Connector state between consecutive Phase-1 stages: solid once the
 * hand-off has actually happened (upstream approved), dashed while pending.
 */
export function connectorSolid(from: Stage, to: Stage): boolean {
  return from.status === "done" && (to.status === "done" || to.status === "active");
}
