import fs from "node:fs";
import path from "node:path";
import { getAnthropicClient, DEFAULT_MODEL } from "@/shared/anthropic-client";

/**
 * Generic agent runtime (per ADR-001: products are declarative, one shared
 * runtime loads them). Given a slug from the registry, assembles
 * platform guardrails + the agent's operative prompt (+ extra context files)
 * into a system prompt and runs chat turns.
 *
 * The JD agent keeps its dedicated orchestrator/route (voice depends on it);
 * it is listed here too so the agent picker can offer every agent through
 * one contract.
 */

export type AgentEntry = {
  slug: string;
  title: string;
  /** Operative prompt, relative to products/interview-intelligence/ */
  promptFile: string;
  /** Extra context files appended after the prompt (e.g. the JD question bank) */
  contextFiles?: { heading: string; file: string }[];
  /** Phase gate — phase2 agents exist but are flagged in the UI */
  phase: 1 | 2;
  maxTokens?: number;
};

export const AGENT_REGISTRY: AgentEntry[] = [
  {
    slug: "job-description",
    title: "1 · Job Description Interactive Agent",
    promptFile: "prompts/01-job-description.md",
    contextFiles: [
      {
        heading: "Reference: Question Bank (Job Discovery Questionnaire)",
        file: "docs/job-description-question-bank.md",
      },
    ],
    phase: 1,
    // Phase 2/3 deliverable = JD + 20-section coverage JSON (+ thinking):
    // truncates at 8192 (evals 2026-07-19). Keep in sync with the dedicated
    // JD orchestrator's 16384.
    maxTokens: 16384,
  },
  {
    slug: "competency-builder",
    title: "2 · Predictive Competency Builder",
    promptFile: "prompts/02-competency-builder.md",
    phase: 1,
  },
  {
    slug: "panel-designer",
    title: "3 · Strategic Interview Panel Designer",
    promptFile: "prompts/03-panel-designer.md",
    phase: 1,
  },
  {
    slug: "interview-system-builder",
    title: "4 · Structured Interview System Builder",
    promptFile: "prompts/04-interview-system-builder.md",
    phase: 1,
  },
  {
    slug: "feedback-form-builder",
    title: "5 · Interview Feedback Form Builder",
    promptFile: "prompts/05-feedback-form-builder.md",
    phase: 2,
  },
  {
    slug: "hiring-rationale",
    title: "6 · Hiring Rationale Generator",
    promptFile: "prompts/06-hiring-rationale.md",
    phase: 2,
  },
  {
    slug: "success-blueprint",
    title: "7 · Manager's Success Blueprint",
    promptFile: "prompts/07-success-blueprint.md",
    phase: 2,
  },
  {
    slug: "interview-coach",
    title: "8 · Interview Excellence Coach",
    promptFile: "prompts/08-interview-coach.md",
    phase: 2,
  },
  {
    slug: "recruiter-evaluation-report",
    title: "A1 · Recruiter Evaluation Report",
    promptFile: "prompts/09-recruiter-evaluation-report.md",
    phase: 2,
  },
  {
    slug: "screening-guide",
    title: "A2 · Recruiter Screening Guide (draft)",
    promptFile: "prompts/10-screening-guide.md",
    phase: 2,
  },
];

const PRODUCT_ROOT = path.join(process.cwd(), "products/interview-intelligence");

function readProductFile(relativePath: string): string {
  return fs.readFileSync(path.join(PRODUCT_ROOT, relativePath), "utf-8");
}

function readPlatformFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
}

export function getAgent(slug: string): AgentEntry | undefined {
  return AGENT_REGISTRY.find((a) => a.slug === slug);
}

const promptCache = new Map<string, string>();

export function buildAgentSystemPrompt(slug: string): string {
  const cached = promptCache.get(slug);
  if (cached) return cached;

  const agent = getAgent(slug);
  if (!agent) throw new Error(`Unknown agent: ${slug}`);

  const parts: string[] = [
    readPlatformFile("prompts/system/guardrails.md"),
    "\n\n",
    stripFrontmatter(readProductFile(agent.promptFile)),
  ];
  for (const ctx of agent.contextFiles ?? []) {
    parts.push(`\n\n---\n\n# ${ctx.heading}\n\n`, readProductFile(ctx.file));
  }
  parts.push(
    "\n\n---\n\n# Runtime note\n\n" +
      "You are running as a chat API. You cannot read or write files — everything you " +
      "need is loaded above. Inputs you require arrive as pasted text in the conversation; " +
      "if a required input is missing, ask for it. Deliver your final artifact directly in " +
      "your chat reply as clean Markdown, clearly marked as final. Do not claim you wrote " +
      "files; the platform saves artifacts when the user chooses to."
  );

  const prompt = parts.join("");
  promptCache.set(slug, prompt);
  return prompt;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function runAgentTurn(
  slug: string,
  messages: ChatMessage[]
): Promise<string> {
  const agent = getAgent(slug);
  if (!agent) throw new Error(`Unknown agent: ${slug}`);

  // max_tokens must budget for BOTH adaptive thinking and the visible answer:
  // at 2048, thinking alone consumed the budget on heavy inputs and users got
  // an empty or truncated reply (found by evals 2026-07-19).
  const doTurn = (thinking: boolean) =>
    getAnthropicClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: agent.maxTokens ?? 8192,
      ...(thinking ? {} : { thinking: { type: "disabled" as const } }),
      system: [
        {
          type: "text",
          text: buildAgentSystemPrompt(slug),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });

  let response = await doTurn(true);
  let textBlock = response.content.find((block) => block.type === "text");
  let text = textBlock && textBlock.type === "text" ? textBlock.text : "";

  // Self-healing guard: adaptive thinking's length varies run to run and can
  // starve or truncate the visible reply at max_tokens (claude-sonnet-5 has
  // no thinking budget parameter). On truncation, retry once with thinking
  // disabled so the entire budget goes to the answer.
  if (response.stop_reason === "max_tokens") {
    console.warn(`[orchestrator/${slug}] reply hit max_tokens — retrying without thinking`);
    response = await doTurn(false);
    textBlock = response.content.find((block) => block.type === "text");
    const retryText = textBlock && textBlock.type === "text" ? textBlock.text : "";
    if (retryText.trim()) text = retryText;
    if (response.stop_reason === "max_tokens") {
      console.warn(`[orchestrator/${slug}] still truncated at max_tokens (${agent.maxTokens ?? 8192})`);
    }
  }
  return text;
}
