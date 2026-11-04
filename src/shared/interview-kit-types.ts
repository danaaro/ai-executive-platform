/**
 * Interview Kit (Step 2) — shapes shared by the server and the screens.
 * No file system, no prompts: safe to import from client components.
 * Spec: products/interview-intelligence/docs/(C) interview-kit-PRD.md, on top
 * of Susan's Hiring Toolkit PRD v1.1 (prompts/hiring-toolkit/).
 */

export type KitPart = "screen" | "interviews";
export const KIT_PARTS: KitPart[] = ["screen", "interviews"];
export const KIT_SLUG = "interview-kit";
/** One kit per role, versioned; each build, rebuild, part regeneration or edit is a version (K7). */
export const KIT_MAX_VERSIONS = 20;

export const KIT_LANGUAGES = ["English", "Français", "Deutsch", "Español"] as const;
export type KitLanguage = (typeof KIT_LANGUAGES)[number];
export const ROLE_LEVELS = ["N-1 executive", "C-level"] as const;
export type RoleLevel = (typeof ROLE_LEVELS)[number];

export type Question = { q: string; probes: string[] };
export type RubricLevel = { level: string; text: string };

export type ScreenArea = { name: string; checks: string; questions: Question[]; rubric: RubricLevel[] };
export type RecruiterScreen = {
  intro: string;
  running_order: { minutes: string; what: string }[];
  areas: ScreenArea[];
  do_not_ask: string;
};

export type GuideArea = {
  id: string;
  name: string;
  what: string;
  must_have: boolean;
  questions: Question[];
  rubric: RubricLevel[];
  framework_no?: number;
  selection?: "core" | "role-specific";
  why?: string;
  evidence?: string;
};
export type Attribute = { key: "PE" | "CC" | "LF" | "MF"; name: string; question: string; areas: GuideArea[]; level?: RoleLevel };
export type InterviewGuide = { attributes: Attribute[] };

/** What the user picked on the input screen. Stored with every version so Rebuild starts from it. */
export type KitInputs = {
  jdArtifactId: string;
  jdVersion: number;
  roleAndLevel: string;
  useResearch: boolean;
  useProfile: boolean;
  documentIds: string[];
  extra: { name: string; text: string }[];
  notes: string;
  roleLevel: RoleLevel;
  competencies: number[];
  suggest: boolean;
  language: KitLanguage;
};

export type PartResult = {
  status: "done" | "failed";
  data: RecruiterScreen | InterviewGuide | null;
  /** The model's text when it could not be parsed at all. */
  raw?: string;
  failures: string[];
  warnings: string[];
  truncated: boolean;
  repaired: boolean;
  ms: number;
};

export type KitEnvelope = {
  inputs: KitInputs;
  parts: Partial<Record<KitPart, PartResult>>;
  promptVersion: string;
  model: string;
};

/** Competency list for the checklist: names and clusters only, never rubrics or questions. */
export type CompetencyOption = { no: number; name: string; cluster: string; core: boolean };
