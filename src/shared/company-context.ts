/**
 * Company Context framework — the v2 report contract (ADR-009 §17, 2026-10-01).
 *
 * Source: products/interview-intelligence/docs/company-context-framework.md
 * (Dana's "Company Context → Hiring Fit" document). This file is the machine
 * version: the 15 categories with their exact questions, the four category
 * writers, the tool schemas they answer through, and — most important —
 * validateSection(), which enforces "never made up":
 *
 *   found     → needs ≥1 evidence entry whose source/URL appears in the
 *               research the writer was given
 *   inferred  → needs ≥1 such evidence entry AND a non-empty basedOn
 *   otherwise → downgraded to unknown; its interview question is kept
 *
 * Unknowns are not a failure: they become "Include these questions in your
 * interview".
 */

import { REPORT_JSON_SCHEMA, type ReportData } from "./company-report";

/* -------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------- */

export type Status = "found" | "inferred" | "unknown";
export type Evidence = { source: string; url: string | null; date: string };

type Sourced = {
  status: Status;
  evidence: Evidence[];
  basedOn: string[];
  interviewQuestion: string;
};

export type Answer = Sourced & { id: string; question: string; answer: string | null };
export type Rating = Sourced & {
  id: string;
  label: string;
  left: string;
  right: string;
  position: number | null;
  note: string | null;
};
export type RapidRow = Sourced & {
  decision: string;
  recommend: string | null;
  input: string | null;
  agree: string | null;
  decide: string | null;
  execute: string | null;
  formalVsActual: string | null;
};
export type PowerPerson = Sourced & { name: string; role: string; influence: string[]; note: string | null };
export type Stakeholder = Sourced & {
  group: string;
  importance: "high" | "medium" | "low" | null;
  note: string | null;
};
export type StageInfo = Sourced & { current: string | null; next: string | null; note: string | null };
export type Implication = {
  finding: string;
  implication: string;
  status: "found" | "inferred";
  evidence: Evidence[];
  basedOn: string[];
};

export type CategoryResult = {
  id: CategoryId;
  summary: string;
  answers: Answer[];
  ratings: Rating[];
  rapid?: RapidRow[];
  people?: PowerPerson[];
  stakeholders?: Stakeholder[];
  stage?: StageInfo;
  implications: Implication[];
};

export type KeyFigureV2 = { label: string; value: string; context: string; asOf: string | null; evidence: Evidence[] };

export type Validation = { found: number; inferred: number; unknown: number; downgraded: number; untraced: string[] };

/** The v2 report. Shares field names with v1 where they overlap, so personas,
 *  photos, timeline, group structure and sentiment components are reused. */
export type ContextReportData = {
  version: 2;
  headline: string;
  trajectory: ReportData["trajectory"];
  overallConfidence: ReportData["overallConfidence"];
  bottomLine: string[];
  keyFigures: KeyFigureV2[];
  keyPersonas: ReportData["keyPersonas"];
  timeline: ReportData["timeline"];
  groupStructure?: ReportData["groupStructure"];
  employeeSentiment: ReportData["employeeSentiment"] | null;
  sayVsDo: ReportData["sayVsDo"];
  risks: ReportData["risks"];
  opportunities: ReportData["opportunities"];
  hireImplications: Implication[];
  extraQuestions: string[];
  categories: Partial<Record<CategoryId, CategoryResult>>;
  validation: Validation;
  sources: { module: string; researchedOn: string; briefOutdated: boolean }[];
  sourcesCount: number | null;
  photosCheckedAt?: string;
  photosUsage?: ReportData["photosUsage"];
};

export function isContextReport(d: unknown): d is ContextReportData {
  return Boolean(d && typeof d === "object" && (d as { version?: number }).version === 2);
}

/* -------------------------------------------------------------------------
 * Registry — the framework's questions, verbatim in spirit
 * ---------------------------------------------------------------------- */

type Q = { id: string; q: string };
type ScaleDef = { id: string; label: string; left: string; right: string };

export const LAYERS = [
  { id: "ownership", title: "Ownership & Purpose" },
  { id: "strategy", title: "Strategy & Business" },
  { id: "organisation", title: "Organisation & Power" },
  { id: "operating", title: "Decisions & Operating System" },
  { id: "culture", title: "Culture & Leadership" },
  { id: "external", title: "External" },
] as const;

export const OWNERSHIP_MODELS = [
  "Founder-owned", "Family-owned", "Privately owned – institutional", "VC-backed", "Growth equity-backed",
  "PE-backed", "Publicly listed", "Subsidiary of public company", "State-owned enterprise",
  "Sovereign wealth fund-backed", "Government-controlled strategic enterprise", "Joint venture",
  "Consortium-owned", "Cooperative/member-owned", "Foundation/trust-owned", "Employee-owned", "Hybrid",
];

export const STAGES = [
  "Founding", "Product-market fit", "Scale-up", "International expansion", "Professionalisation",
  "Mature growth", "Transformation", "Turnaround", "Consolidation", "Exit/IPO", "Post-merger integration",
];

export const RAPID_DECISIONS = [
  "Country strategy", "Annual budget", "Pricing", "Senior hire", "Product launch",
  "Major client terms", "Headcount", "Investment",
];

export const INFLUENCE_TYPES = [
  "Formal authority", "Informal influence", "Information access", "Veto power", "Resource control",
  "Founder/board proximity",
];

export const STAKEHOLDER_GROUPS = [
  "Customers", "Regulators", "Government", "Investors", "Banks", "Partners", "Distributors", "Suppliers",
  "Media", "Industry bodies", "Unions", "Communities", "Key opinion leaders",
];

const CENTRAL_AREAS = [
  "Strategy", "Budget", "P&L", "Pricing", "Product", "Technology", "Sales", "Marketing", "Brand", "Hiring",
  "Compensation", "Senior hiring", "CapEx", "M&A", "Partnerships",
];

export type CategoryDef = {
  id: CategoryId;
  n: number;
  title: string;
  layer: (typeof LAYERS)[number]["id"];
  intro: string;
  questions: Q[];
  scales?: ScaleDef[];
  rapid?: boolean;
  people?: boolean;
  stakeholders?: boolean;
  stage?: boolean;
};

export type CategoryId =
  | "ownership" | "evolution" | "business" | "strategy" | "organisation" | "centralisation" | "decisions"
  | "power" | "information" | "leadership" | "culture" | "performance" | "talent" | "change" | "ecosystem";

export const CATEGORIES: CategoryDef[] = [
  {
    id: "ownership", n: 1, title: "Ownership & capital", layer: "ownership",
    intro: "Ownership often explains behaviour that otherwise looks irrational.",
    questions: [
      { id: "owner", q: "Who ultimately owns the company?" },
      { id: "model", q: `Ownership model (one of: ${OWNERSHIP_MODELS.join(", ")})` },
      { id: "concentration", q: "How concentrated is ownership?" },
      { id: "board", q: "What is the board composition?" },
      { id: "involvement", q: "How involved are the shareholders?" },
      { id: "horizon", q: "What is the investment horizon?" },
      { id: "returns", q: "What return expectations do the owners have?" },
      { id: "governance", q: "How intense is governance?" },
      { id: "founder", q: "How much influence does the founder have?" },
      { id: "activist", q: "Is there activist-investor influence?" },
      { id: "exit", q: "What are the exit or liquidity expectations?" },
      { id: "priorities", q: "What does the owner actually care about (growth, EBITDA, cash, market share, innovation, strategic influence, IPO, exit, dividend, legacy, national interest)?" },
    ],
  },
  {
    id: "evolution", n: 2, title: "Evolution & maturity", layer: "strategy", stage: true,
    intro: "Two companies with identical ownership can need completely different executives.",
    questions: [
      { id: "history", q: "How did the company get here — its key chapters?" },
      { id: "current", q: "Current chapter: where is the company now?" },
      { id: "next", q: "Next chapter: where must it be in 2–3 years?" },
      { id: "transition", q: "Which behaviours created today's success but won't create tomorrow's?" },
      { id: "todayOrTomorrow", q: "Are we hiring for the company that exists today, or the one that must exist tomorrow?" },
    ],
  },
  {
    id: "business", n: 3, title: "Business model & economic engine", layer: "strategy",
    intro: "How the company actually makes money — and which experience really matters.",
    questions: [
      { id: "revenueModel", q: "Revenue model" },
      { id: "segments", q: "Customer segments" },
      { id: "channel", q: "B2B / B2C / B2B2C" },
      { id: "revenueType", q: "Transactional / subscription / licensing / services" },
      { id: "customerSize", q: "Enterprise / SMB / consumer" },
      { id: "recurring", q: "Recurring vs non-recurring revenue" },
      { id: "margin", q: "High-margin vs volume" },
      { id: "capital", q: "Capital intensity" },
      { id: "regulatory", q: "Regulatory intensity" },
      { id: "salesCycle", q: "Sales cycle" },
      { id: "distribution", q: "Distribution model" },
      { id: "complexity", q: "Product complexity" },
      { id: "tech", q: "Technology dependence" },
      { id: "geo", q: "Geographic concentration" },
      { id: "advantages", q: "Key competitive advantages" },
      { id: "valueDrivers", q: "What really drives enterprise value?" },
    ],
  },
  {
    id: "strategy", n: 4, title: "Strategy & value creation", layer: "strategy",
    intro: "The actual strategy — not merely the corporate presentation.",
    questions: [
      { id: "priorities", q: "Current strategic priorities" },
      { id: "outcome1", q: "Top outcome #1 expected in the next 24–36 months" },
      { id: "outcome2", q: "Top outcome #2 expected in the next 24–36 months" },
      { id: "outcome3", q: "Top outcome #3 expected in the next 24–36 months" },
      { id: "obstacles", q: "What could prevent the company achieving them?" },
      { id: "statedVsActual", q: "How does the real strategy differ from the corporate presentation?" },
    ],
  },
  {
    id: "organisation", n: 5, title: "Organisational architecture", layer: "organisation",
    intro: "Formal structure ≠ real organisation. The second map matters more for search.",
    questions: [
      { id: "archetype", q: "Structural archetype (functional, divisional, geographic, product-led, customer-led, business units, holding company, federation, matrix, platform/ecosystem, hybrid)" },
      { id: "hierarchy", q: "Hierarchy: shareholders → board → group CEO → group functions → business units/regions → countries → functions" },
      { id: "formal", q: "The formal organisation" },
      { id: "real", q: "How the organisation actually works" },
      { id: "reorgs", q: "Recent reorganisations" },
    ],
  },
  {
    id: "centralisation", n: 6, title: "Centralisation & local autonomy", layer: "organisation",
    intro: "1 = completely local · 5 = completely Group-controlled.",
    questions: [
      { id: "gmModel", q: "Is a country GM a CEO of a country, or a commercial orchestrator of global functions?" },
    ],
    scales: CENTRAL_AREAS.map((a) => ({
      id: a.toLowerCase().replace(/[^a-z]+/g, ""),
      label: a,
      left: "Completely local",
      right: "Completely Group-controlled",
    })),
  },
  {
    id: "decisions", n: 7, title: "Power & decision rights", layer: "organisation", rapid: true,
    intro: "Who can say yes, who can say no, who can block, who must be consulted.",
    questions: [
      { id: "yes", q: "Who can actually say yes?" },
      { id: "no", q: "Who can say no or block?" },
      { id: "consulted", q: "Who needs to be consulted?" },
      { id: "formalVsActual", q: "Formal decision-maker vs actual decision-maker" },
    ],
  },
  {
    id: "power", n: 8, title: "Informal power & influence", layer: "organisation", people: true,
    intro: "Formal authority, informal influence, information access, veto, resources, founder/board proximity.",
    questions: [
      { id: "needs", q: "Does an executive here need mainly authority, influence, diplomacy, political navigation, or independent execution?" },
    ],
  },
  {
    id: "information", n: 9, title: "Information flow", layer: "operating",
    intro: "How information really travels — often missed entirely.",
    questions: [
      { id: "direction", q: "How does information travel (bottom-up, top-down, lateral, network-based)?" },
      { id: "whoKnows", q: "Who knows what, and who gets information first?" },
      { id: "escalation", q: "Are problems escalated early?" },
      { id: "badNews", q: "Is bad news welcomed?" },
      { id: "filtered", q: "Does information get filtered?" },
      { id: "meetings", q: "Are meetings used to decide, debate, inform, or validate decisions made elsewhere?" },
      { id: "where", q: "Where are important decisions really made (in meetings, before, after, 1:1, chat, memos, relationships)?" },
    ],
  },
  {
    id: "leadership", n: 10, title: "Leadership & management system", layer: "culture",
    intro: "The dominant management style and how it behaves.",
    questions: [
      { id: "style", q: "Dominant style (founder-led, command/control, professional managerial, consensus-driven, data-driven, performance-driven, entrepreneurial, expert-led, relationship-led, process-led, mission-led)" },
    ],
    scales: [
      { id: "accountability", label: "Accountability", left: "Individual", right: "Collective" },
      { id: "management", label: "Management", left: "Hands-on", right: "Hands-off" },
      { id: "planning", label: "Planning", left: "Emergent", right: "Highly structured" },
      { id: "risk", label: "Risk", left: "Experimental", right: "Risk-averse" },
      { id: "performance", label: "Performance", left: "Forgiving", right: "Demanding" },
      { id: "conflict", label: "Conflict", left: "Explicit", right: "Avoided" },
      { id: "failure", label: "Failure", left: "Learning opportunity", right: "Career-limiting" },
      { id: "speed", label: "Speed", left: "Deliberate", right: "Extremely fast" },
    ],
  },
  {
    id: "culture", n: 11, title: "Culture map", layer: "culture",
    intro: "Erin Meyer's eight scales, adapted to the company (not national stereotypes).",
    questions: [
      { id: "company", q: "Company culture in a sentence" },
      { id: "leadershipTeam", q: "Leadership-team culture (where it differs from the company)" },
      { id: "country", q: "Country culture differences inside the company" },
      { id: "rewarded", q: "What actually gets rewarded" },
    ],
    scales: [
      { id: "communicating", label: "Communicating", left: "Low-context", right: "High-context" },
      { id: "evaluating", label: "Feedback", left: "Direct", right: "Indirect" },
      { id: "leading", label: "Leading", left: "Egalitarian", right: "Hierarchical" },
      { id: "deciding", label: "Deciding", left: "Consensual", right: "Top-down" },
      { id: "trusting", label: "Trusting", left: "Task-based", right: "Relationship-based" },
      { id: "disagreeing", label: "Disagreeing", left: "Confrontational", right: "Avoids confrontation" },
      { id: "scheduling", label: "Scheduling", left: "Linear", right: "Flexible" },
      { id: "persuading", label: "Persuading", left: "Principles-first", right: "Applications-first" },
    ],
  },
  {
    id: "performance", n: 12, title: "Performance & accountability", layer: "culture",
    intro: "What the organisation rewards — incentives can reinforce or contradict the design.",
    questions: [
      { id: "excellence", q: "What constitutes excellent performance (revenue, EBITDA, growth, market share, innovation, execution, cost, team building, stakeholder management, transformation)?" },
      { id: "kpis", q: "Individual vs collective KPIs" },
      { id: "horizon", q: "Short-term vs long-term incentives" },
      { id: "metrics", q: "Financial vs non-financial metrics" },
      { id: "bonus", q: "Bonus structure" },
      { id: "equity", q: "Equity / LTI" },
      { id: "promotion", q: "Promotion criteria" },
      { id: "underperformance", q: "Consequences of underperformance" },
      { id: "tolerance", q: "Tolerance for missing targets" },
    ],
  },
  {
    id: "talent", n: 13, title: "Talent philosophy", layer: "culture",
    intro: "Who succeeds here — actually, not theoretically. And who fails.",
    questions: [
      { id: "succeeds", q: "Who succeeds here?" },
      { id: "origins", q: "Where did the successful executives come from?" },
      { id: "style", q: "What style do they share?" },
      { id: "tenure", q: "How long do executives stay?" },
      { id: "promoted", q: "Who gets promoted?" },
      { id: "listened", q: "Who gets listened to?" },
      { id: "failures", q: "Which senior hires didn't work, and why?" },
      { id: "patterns", q: "What failure patterns repeat (too corporate, too independent, couldn't influence HQ, …)?" },
    ],
  },
  {
    id: "change", n: 14, title: "Change & ambiguity", layer: "external",
    intro: "How much builder / operator / transformer / diplomat the person needs to be.",
    questions: [
      { id: "needs", q: "How much builder, operator, transformer and diplomat does a senior hire need to be?" },
    ],
    scales: [
      { id: "stability", label: "Change", left: "Stable", right: "Transformation" },
      { id: "predictability", label: "Predictability", left: "Predictable", right: "Ambiguous" },
      { id: "processes", label: "Processes", left: "Established", right: "Build from scratch" },
      { id: "resources", label: "Resources", left: "Abundant", right: "Constrained" },
      { id: "politics", label: "Politics", left: "Low", right: "Highly political" },
      { id: "mandate", label: "Mandate", left: "Clear", right: "Evolving" },
      { id: "complexity", label: "Complexity", left: "Low", right: "Extreme matrix" },
      { id: "scope", label: "Stakeholder scope", left: "Local role", right: "Global complexity" },
    ],
  },
  {
    id: "ecosystem", n: 15, title: "External ecosystem", layer: "external", stakeholders: true,
    intro: "Which external relationships materially determine success.",
    questions: [
      { id: "critical", q: "Which external relationships materially determine success?" },
    ],
  },
];

export const categoryById = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!;

/* -------------------------------------------------------------------------
 * The four writers (each its own request; ADR-009 §17)
 * ---------------------------------------------------------------------- */

export type WriterId = "A" | "B" | "C" | "D";
export const WRITERS: Record<
  WriterId,
  { label: string; categories: CategoryId[]; modules: string[]; extras: ("keyFigures" | "timeline" | "keyPersonas" | "groupStructure" | "employeeSentiment" | "sayVsDo")[] }
> = {
  A: {
    label: "Ownership, evolution, business model, strategy",
    categories: ["ownership", "evolution", "business", "strategy"],
    modules: ["01-identity-ownership", "02-financial-health", "03-recent-activity", "06-group-structure", "07-business-strategy"],
    extras: ["keyFigures", "timeline"],
  },
  B: {
    label: "Organisation, centralisation, decisions, power, information",
    categories: ["organisation", "centralisation", "decisions", "power", "information"],
    modules: ["01-identity-ownership", "04-people-structure", "05-culture-voice", "06-group-structure"],
    extras: ["keyPersonas", "groupStructure"],
  },
  C: {
    label: "Leadership, culture map, performance, talent",
    categories: ["leadership", "culture", "performance", "talent"],
    modules: ["04-people-structure", "05-culture-voice", "08-performance-talent-ecosystem"],
    extras: ["employeeSentiment", "sayVsDo"],
  },
  D: {
    label: "Change & ambiguity, external ecosystem",
    categories: ["change", "ecosystem"],
    modules: ["03-recent-activity", "07-business-strategy", "08-performance-talent-ecosystem"],
    extras: [],
  },
};
export const WRITER_IDS = Object.keys(WRITERS) as WriterId[];

/* -------------------------------------------------------------------------
 * Tool schemas (delivered via a save_section tool call)
 * ---------------------------------------------------------------------- */

const str = (description?: string) => ({ type: "string", ...(description ? { description } : {}) });
const nstr = (description?: string) => ({ type: ["string", "null"], ...(description ? { description } : {}) });
const arr = (items: object, description?: string) => ({ type: "array", items, ...(description ? { description } : {}) });
const obj = (properties: Record<string, object>, description?: string) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  ...(description ? { description } : {}),
});

const EVIDENCE = obj({
  source: str("The source's name EXACTLY as written in the research file's Sources table"),
  url: nstr("The source URL exactly as in the research file, or null"),
  date: str("Date of the source, YYYY-MM-DD / YYYY-MM / 'date unknown'"),
});
const SOURCED = {
  status: { type: "string", enum: ["found", "inferred", "unknown"] },
  evidence: arr(EVIDENCE, "Required for found and inferred. Copy from the research files; never invent a source."),
  basedOn: arr(str(), "Required for inferred: the specific facts the inference rests on"),
  interviewQuestion: str("How to ask this in a client interview (always fill — used if the answer is unknown)"),
};

function categorySchema(c: CategoryDef) {
  const props: Record<string, object> = {
    summary: str("1–2 sentences: what this category tells us about the company. Only from found/inferred answers."),
    answers: arr(
      obj({
        id: { type: "string", enum: c.questions.map((q) => q.id) },
        answer: nstr("Null when unknown. Concise. Never invent."),
        ...SOURCED,
      }),
      `Exactly one entry per question id: ${c.questions.map((q) => `${q.id} = "${q.q}"`).join("; ")}`
    ),
    implications: arr(
      obj({
        finding: str("A found/inferred finding from this category"),
        implication: str("What it means for any senior hire (candidate implication)"),
        status: { type: "string", enum: ["found", "inferred"] },
        evidence: arr(EVIDENCE),
        basedOn: arr(str()),
      }),
      "0–4 context → candidate implications, only from found/inferred answers"
    ),
  };
  if (c.scales) {
    props.ratings = arr(
      obj({
        id: { type: "string", enum: c.scales.map((s) => s.id) },
        position: { type: ["number", "null"], description: "1 = LEFT pole … 5 = RIGHT pole; null when unknown. Never a default midpoint." },
        note: nstr("What the position means, one sentence"),
        ...SOURCED,
      }),
      `Exactly one entry per scale: ${c.scales.map((s) => `${s.id} (1 = ${s.left}, 5 = ${s.right})`).join("; ")}`
    );
  }
  if (c.rapid) {
    props.rapid = arr(
      obj({
        decision: { type: "string", enum: RAPID_DECISIONS },
        recommend: nstr(), input: nstr(), agree: nstr(), decide: nstr(), execute: nstr(),
        formalVsActual: nstr("Formal vs actual decision-maker, if evidenced"),
        ...SOURCED,
      }),
      "Exactly one row per decision. Roles (e.g. 'Group CFO', 'Country MD') only where evidenced; else null + status unknown."
    );
  }
  if (c.people) {
    props.people = arr(
      obj({
        name: str(), role: str(),
        influence: arr({ type: "string", enum: INFLUENCE_TYPES }),
        note: nstr(),
        ...SOURCED,
      }),
      "The power map: only people whose current role is confirmed by the official website or dated press ≤12 months. Public professional information only."
    );
  }
  if (c.stakeholders) {
    props.stakeholders = arr(
      obj({
        group: { type: "string", enum: STAKEHOLDER_GROUPS },
        importance: { type: ["string", "null"], enum: ["high", "medium", "low", null] },
        note: nstr("Who specifically, and why they matter"),
        ...SOURCED,
      }),
      "One row per stakeholder group that is relevant; unknown importance stays null."
    );
  }
  if (c.stage) {
    props.stage = obj({
      current: { type: ["string", "null"], enum: [...STAGES, null] },
      next: { type: ["string", "null"], enum: [...STAGES, null] },
      note: nstr(),
      ...SOURCED,
    });
  }
  return obj(props);
}

export function writerSchema(w: WriterId) {
  const def = WRITERS[w];
  const R = (REPORT_JSON_SCHEMA as { properties: Record<string, object> }).properties;
  const extras: Record<string, object> = {};
  for (const e of def.extras) {
    if (e === "keyFigures") {
      extras.keyFigures = arr(
        obj({ label: str(), value: str(), context: str(), asOf: nstr(), evidence: arr(EVIDENCE) }),
        "3–5 headline numbers, each with evidence copied from the research. Never estimate."
      );
    } else if (e === "employeeSentiment") {
      extras.employeeSentiment = { anyOf: [R.employeeSentiment, { type: "null" }] };
    } else {
      extras[e] = R[e];
    }
  }
  // Categories are TOP-LEVEL fields (2026-10-01): nested under one wrapper,
  // a writer returned the whole thing as a JSON-encoded string.
  return obj({
    ...Object.fromEntries(def.categories.map((id) => [id, categorySchema(categoryById(id))])),
    ...extras,
  });
}

/** Tool inputs sometimes arrive with an object JSON-encoded as a string; recover it, or drop it. */
function decodeField(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

/* -------------------------------------------------------------------------
 * Validation — "never made up", enforced
 * ---------------------------------------------------------------------- */

const lc = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A citation is real only if its URL/domain or its exact source name occurs in the research text. */
export function makeEvidenceCheck(corpus: string) {
  const text = lc(corpus);
  return (e: Evidence | undefined | null): boolean => {
    if (!e || typeof e.source !== "string") return false;
    if (e.url) {
      try {
        const u = new URL(e.url);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        const path = (host + u.pathname).replace(/\/$/, "").toLowerCase();
        if (text.includes(path) || (host.length > 4 && text.includes(host))) return true;
      } catch {
        // not a URL — fall through to the name check
      }
    }
    const name = lc(e.source);
    return name.length >= 5 && text.includes(name);
  };
}

function cleanSourced<T extends Sourced>(item: T, ok: (e: Evidence) => boolean, fallbackQ: string, stats: Validation): T {
  const evidence = Array.isArray(item.evidence) ? item.evidence.filter(ok) : [];
  const basedOn = Array.isArray(item.basedOn) ? item.basedOn.filter((b) => typeof b === "string" && b.trim()) : [];
  let status: Status = item.status === "found" || item.status === "inferred" ? item.status : "unknown";
  if (status === "found" && evidence.length === 0) status = "unknown";
  if (status === "inferred" && (evidence.length === 0 || basedOn.length === 0)) status = "unknown";
  if (status === "unknown" && (item.status === "found" || item.status === "inferred")) stats.downgraded++;
  stats[status]++;
  const interviewQuestion =
    typeof item.interviewQuestion === "string" && item.interviewQuestion.trim() ? item.interviewQuestion.trim() : fallbackQ;
  return { ...item, status, evidence: status === "unknown" ? [] : evidence, basedOn: status === "inferred" ? basedOn : [], interviewQuestion };
}

const emptyStats = (): Validation => ({ found: 0, inferred: 0, unknown: 0, downgraded: 0, untraced: [] });

/**
 * Turns a writer's raw tool input into validated categories. Every registry
 * question/scale/decision is present afterwards (missing → unknown), every
 * unsupported claim is downgraded, and unknown values are nulled — so the
 * page can never show an unsourced answer or a default score.
 */
export function validateSection(raw: unknown, w: WriterId, corpus: string) {
  const stats = emptyStats();
  const ok = makeEvidenceCheck(corpus);
  const top = (raw ?? {}) as Record<string, unknown>;
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(top)) r[k] = decodeField(v);
  // Older shape: everything under `categories` (possibly as a string).
  const wrapped = (r.categories ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(wrapped)) if (r[k] === undefined) r[k] = decodeField(v);
  const out: Partial<Record<CategoryId, CategoryResult>> = {};

  for (const id of WRITERS[w].categories) {
    const def = categoryById(id);
    const c = ((r[id] && typeof r[id] === "object" ? r[id] : {}) ?? {}) as Partial<CategoryResult> & { answers?: Partial<Answer>[]; ratings?: Partial<Rating>[] };

    const answers: Answer[] = def.questions.map((q) => {
      const a = (c.answers ?? []).find((x) => x?.id === q.id) ?? {};
      const v = cleanSourced(
        { status: "unknown", evidence: [], basedOn: [], interviewQuestion: "", ...a, id: q.id, question: q.q, answer: (a as Answer).answer ?? null } as Answer,
        ok, `Ask: ${q.q}`, stats
      );
      return { ...v, answer: v.status === "unknown" ? null : v.answer };
    });

    const ratings: Rating[] = (def.scales ?? []).map((s) => {
      const a = (c.ratings ?? []).find((x) => x?.id === s.id) ?? {};
      const v = cleanSourced(
        { status: "unknown", evidence: [], basedOn: [], interviewQuestion: "", note: null, ...a, id: s.id, label: s.label, left: s.left, right: s.right, position: (a as Rating).position ?? null } as Rating,
        ok, `Ask: where does the company sit between "${s.left}" and "${s.right}" on ${s.label.toLowerCase()}?`, stats
      );
      const pos = typeof v.position === "number" && Number.isFinite(v.position) ? Math.min(5, Math.max(1, v.position)) : null;
      // A scored position without evidence is exactly the "made-up number" this guards against.
      const status: Status = pos === null ? "unknown" : v.status;
      return { ...v, status, position: status === "unknown" ? null : pos, note: status === "unknown" ? null : v.note };
    });

    const result: CategoryResult = {
      id,
      summary: typeof c.summary === "string" ? c.summary : "",
      answers,
      ratings,
      implications: (c.implications ?? [])
        .filter((i) => i && (i.evidence ?? []).some(ok) && (i.status === "found" || (i.basedOn ?? []).length > 0))
        .map((i) => ({ ...i, evidence: (i.evidence ?? []).filter(ok) })),
    };

    if (def.rapid) {
      result.rapid = RAPID_DECISIONS.map((decision) => {
        const row = ((c.rapid ?? []) as Partial<RapidRow>[]).find((x) => x?.decision === decision) ?? {};
        const v = cleanSourced(
          { status: "unknown", evidence: [], basedOn: [], interviewQuestion: "", recommend: null, input: null, agree: null, decide: null, execute: null, formalVsActual: null, ...row, decision } as RapidRow,
          ok, `Ask: for "${decision}", who recommends, who gives input, who must agree, who decides and who executes — formally and in practice?`, stats
        );
        return v.status === "unknown"
          ? { ...v, recommend: null, input: null, agree: null, decide: null, execute: null, formalVsActual: null }
          : v;
      });
    }
    if (def.people) {
      result.people = ((c.people ?? []) as Partial<PowerPerson>[])
        .filter((p) => p?.name)
        .map((p) => cleanSourced({ status: "unknown", evidence: [], basedOn: [], interviewQuestion: "", influence: [], note: null, role: "", ...p } as PowerPerson, ok, `Ask: how much influence does ${p.name} really have, and of what kind?`, stats))
        .filter((p) => p.status !== "unknown");
    }
    if (def.stakeholders) {
      result.stakeholders = STAKEHOLDER_GROUPS.map((group) => {
        const row = ((c.stakeholders ?? []) as Partial<Stakeholder>[]).find((x) => x?.group === group);
        if (!row) return null;
        const v = cleanSourced({ status: "unknown", evidence: [], basedOn: [], interviewQuestion: "", importance: null, note: null, ...row, group } as Stakeholder, ok, `Ask: how much do ${group.toLowerCase()} shape success here?`, stats);
        return v.status === "unknown" ? { ...v, importance: null, note: null } : v;
      }).filter((x): x is Stakeholder => Boolean(x));
    }
    if (def.stage) {
      const s = (c.stage ?? {}) as Partial<StageInfo>;
      const v = cleanSourced({ status: "unknown", evidence: [], basedOn: [], interviewQuestion: "", current: null, next: null, note: null, ...s } as StageInfo, ok, "Ask: which chapter is the company in now, and where must it be in 2–3 years?", stats);
      result.stage = v.status === "unknown" ? { ...v, current: null, next: null, note: null } : v;
    }
    out[id] = result;
  }

  // Extras: numbers must be traceable too.
  const extras: Partial<ContextReportData> = {};
  if (Array.isArray(r.keyFigures)) {
    extras.keyFigures = (r.keyFigures as KeyFigureV2[])
      .map((k) => ({ ...k, evidence: (k.evidence ?? []).filter(ok) }))
      .filter((k) => {
        const keep = k.evidence.length > 0;
        if (!keep) stats.untraced.push(`${k.label}: ${k.value}`);
        return keep;
      });
  }
  if ("employeeSentiment" in r) extras.employeeSentiment = checkSentiment(r.employeeSentiment as ReportData["employeeSentiment"] | null, corpus, stats);
  for (const k of ["timeline", "keyPersonas", "groupStructure", "sayVsDo"] as const) {
    if (k in r) (extras as Record<string, unknown>)[k] = r[k];
  }
  return { categories: out, extras, stats };
}

/** Ratings and percentages only survive if the number appears in the research. */
function checkSentiment(s: ReportData["employeeSentiment"] | null, corpus: string, stats: Validation) {
  if (!s || !s.available) return s ?? null;
  const has = (n: number | null) => n === null || corpus.includes(String(n)) || corpus.includes(n.toFixed(1));
  const drop = (label: string, n: number | null) => {
    if (n !== null && !has(n)) {
      stats.untraced.push(`${label}: ${n}`);
      return null;
    }
    return n;
  };
  return {
    ...s,
    overallRating: drop("Overall rating", s.overallRating),
    ceoApprovalPct: drop("CEO approval", s.ceoApprovalPct),
    recommendPct: drop("Recommend %", s.recommendPct),
    categoryRatings: (s.categoryRatings ?? []).filter((c) => {
      const ok = has(c.score);
      if (!ok) stats.untraced.push(`${c.label}: ${c.score}`);
      return ok;
    }),
  };
}

/** Numbers in the overview prose that don't appear anywhere in the validated sections. */
export function untracedNumbers(texts: string[], basis: string): string[] {
  // Only figures that carry meaning: money, percentages, or 3+ digit numbers.
  // Dates ("2025-06", "Mar 2025") and small reference numbers are ignored.
  const text = texts.join(" ").replace(/\b(19|20)\d\d(-\d\d){0,2}\b/g, " ");
  const nums = text.match(/[$€£]\s?\d[\d,.]*\s?(?:bn|[kKmMbB]n?)?|\d[\d,.]*\s?%|\b\d{1,3}(?:,\d{3})+\b|\b\d{3,}\b/g) ?? [];
  const b = basis.replace(/\s+/g, " ");
  return [...new Set(nums.map((n) => n.trim()))].filter((n) => {
    const core = n.replace(/[$€£%\s]/g, "").replace(/(bn|[kKmMbB]n?)$/, "").replace(/[.,]$/, "");
    return core.length >= 1 && !b.includes(core) && !b.includes(core.replace(/,/g, ""));
  });
}

/* -------------------------------------------------------------------------
 * Interview questions, coverage, Markdown
 * ---------------------------------------------------------------------- */

export function interviewQuestions(d: ContextReportData): { category: string; questions: string[] }[] {
  const out: { category: string; questions: string[] }[] = [];
  const seen = new Set<string>();
  for (const def of CATEGORIES) {
    const c = d.categories[def.id];
    if (!c) continue;
    const qs: string[] = [];
    const add = (x: Sourced) => {
      if (x.status !== "unknown") return;
      const key = x.interviewQuestion.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        qs.push(x.interviewQuestion);
      }
    };
    c.answers.forEach(add);
    c.ratings.forEach(add);
    c.rapid?.forEach(add);
    if (c.stage) add(c.stage);
    if (qs.length) out.push({ category: def.title, questions: qs });
  }
  if (d.extraQuestions.length) out.push({ category: "Across the company", questions: d.extraQuestions });
  return out;
}

export function coverage(c: CategoryResult) {
  const all: Sourced[] = [...c.answers, ...c.ratings, ...(c.rapid ?? []), ...(c.stage ? [c.stage] : [])];
  const n = (s: Status) => all.filter((x) => x.status === s).length;
  return { found: n("found"), inferred: n("inferred"), unknown: n("unknown"), total: all.length };
}

const ev = (e: Evidence[]) => (e.length ? ` _(${e.map((x) => `${x.source}, ${x.date}`).join("; ")})_` : "");
const tag = (s: Status) => (s === "found" ? "✔ Found" : s === "inferred" ? "≈ Inferred" : "? Unknown");

export function contextToMarkdown(d: ContextReportData, meta: { company: string; builtOn: string }): string {
  const o: string[] = [
    `# ${meta.company} — Company Context Report`,
    "",
    `> ${d.headline}`,
    "",
    `Built ${meta.builtOn} · confidence ${d.overallConfidence} · ${d.validation.found} found · ${d.validation.inferred} inferred · ${d.validation.unknown} unknown`,
    "",
    "## Bottom line",
    ...d.bottomLine.map((b) => `- ${b}`),
    "",
  ];
  for (const def of CATEGORIES) {
    const c = d.categories[def.id];
    if (!c) continue;
    o.push(`## ${def.n}. ${def.title}`, "", c.summary, "");
    if (c.stage && c.stage.status !== "unknown") o.push(`**Stage:** ${c.stage.current ?? "?"} → next: ${c.stage.next ?? "?"} (${tag(c.stage.status)})${ev(c.stage.evidence)}`, "");
    for (const a of c.answers) {
      o.push(`- **${a.question}** — ${a.status === "unknown" ? "_Unknown → interview question_" : a.answer} (${tag(a.status)})${ev(a.evidence)}`);
      if (a.status === "inferred") o.push(`  - based on: ${a.basedOn.join("; ")}`);
    }
    if (c.ratings.length) {
      o.push("", "| Scale | Position (1–5) | Status | Note |", "|---|---|---|---|");
      for (const r of c.ratings) o.push(`| ${r.label}: ${r.left} ↔ ${r.right} | ${r.position ?? "—"} | ${tag(r.status)} | ${r.note ?? ""} |`);
    }
    if (c.rapid) {
      o.push("", "| Decision | Recommend | Input | Agree | Decide | Execute |", "|---|---|---|---|---|---|");
      for (const r of c.rapid) o.push(`| ${r.decision} | ${r.recommend ?? "?"} | ${r.input ?? "?"} | ${r.agree ?? "?"} | ${r.decide ?? "?"} | ${r.execute ?? "?"} |`);
    }
    if (c.people?.length) o.push("", ...c.people.map((p) => `- ${p.name}, ${p.role}: ${p.influence.join(", ")} (${tag(p.status)})`));
    if (c.stakeholders?.length) o.push("", ...c.stakeholders.map((s) => `- ${s.group}: ${s.importance ?? "unknown"}${s.note ? ` — ${s.note}` : ""}`));
    if (c.implications.length) o.push("", "**What this means for a senior hire:**", ...c.implications.map((i) => `- ${i.finding} → ${i.implication}`));
    o.push("");
  }
  o.push("## Include these questions in your interview", "");
  for (const g of interviewQuestions(d)) o.push(`### ${g.category}`, ...g.questions.map((q, i) => `${i + 1}. ${q}`), "");
  if (d.hireImplications.length) o.push("## What this means for any senior hire", ...d.hireImplications.map((i) => `- ${i.finding} → ${i.implication}`), "");
  return o.join("\n");
}
