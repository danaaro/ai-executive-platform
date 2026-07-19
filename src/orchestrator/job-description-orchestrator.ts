import fs from "node:fs";
import path from "node:path";
import { getAnthropicClient, DEFAULT_MODEL } from "@/shared/anthropic-client";

/**
 * Loads the Job Description agent's declarative definition from
 * products/interview-intelligence/ (per ADR-001: products hold no code,
 * the runtime loads their content) and assembles it into a system prompt.
 */

const PRODUCT_ROOT = path.join(
  process.cwd(),
  "products/interview-intelligence"
);

function readProductFile(relativePath: string): string {
  return fs.readFileSync(path.join(PRODUCT_ROOT, relativePath), "utf-8");
}

function readPlatformFile(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
}

let cachedSystemPrompt: string | null = null;

export function buildJobDescriptionSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  const guardrails = readPlatformFile("prompts/system/guardrails.md");
  const operativePrompt = stripFrontmatter(
    readProductFile("prompts/01-job-description.md")
  );
  const questionBank = readProductFile("docs/job-description-question-bank.md");

  cachedSystemPrompt = [
    guardrails,
    "\n\n",
    operativePrompt,
    "\n\n---\n\n# Reference: Question Bank (Job Discovery Questionnaire)\n\n",
    questionBank,
    "\n\n---\n\n# Runtime note\n\n" +
      "You are running as a chat API. You cannot read or write files — the guardrails, " +
      "instructions, and questionnaire above are already loaded for you. Deliver the final " +
      "job description directly in your chat reply as clean Markdown, clearly marked as the " +
      "final version, followed by the Intake & Coverage Record as a JSON code block. " +
      "Do not claim you wrote files; the platform saves artifacts when the user chooses to.",
  ].join("");

  return cachedSystemPrompt;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function runJobDescriptionTurn(
  messages: ChatMessage[]
): Promise<string> {
  // 16384, not 2048: the budget covers adaptive thinking + the full Phase 2/3
  // deliverable (700-word JD + 20-section coverage JSON with per-question
  // entries). Evals 2026-07-19: thinking starved the reply at 2048, and the
  // full deliverable still truncated at 8192.
  const doTurn = (thinking: boolean) =>
    getAnthropicClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 16384,
      ...(thinking ? {} : { thinking: { type: "disabled" as const } }),
      // cache_control: the ~6K-token agent definition is identical every turn
      // (and shared with the voice channel, which appends its note as a
      // separate block AFTER this breakpoint) — cached, it costs ~0.1x and
      // cuts time-to-first-token. 5-min TTL refreshes on each use.
      system: [
        {
          type: "text",
          text: buildJobDescriptionSystemPrompt(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    });

  let response = await doTurn(true);
  let textBlock = response.content.find((block) => block.type === "text");
  let text = textBlock && textBlock.type === "text" ? textBlock.text : "";

  // Same self-healing guard as the generic orchestrator: adaptive thinking's
  // variable length can truncate the deliverable at max_tokens — retry once
  // with thinking disabled so the whole budget goes to the answer.
  if (response.stop_reason === "max_tokens") {
    console.warn("[job-description] reply hit max_tokens — retrying without thinking");
    response = await doTurn(false);
    textBlock = response.content.find((block) => block.type === "text");
    const retryText = textBlock && textBlock.type === "text" ? textBlock.text : "";
    if (retryText.trim()) text = retryText;
  }
  return text;
}
