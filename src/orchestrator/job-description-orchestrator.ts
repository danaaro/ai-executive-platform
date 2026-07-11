import fs from "node:fs";
import path from "node:path";
import { anthropic, DEFAULT_MODEL } from "@/shared/anthropic-client";

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

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
}

let cachedSystemPrompt: string | null = null;

export function buildJobDescriptionSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  const agentDefinition = stripFrontmatter(
    readProductFile("agents/specialists/job-description.md")
  );
  const questionBank = readProductFile("docs/job-description-question-bank.md");
  const prd = readProductFile("docs/job-description-PRD.md");

  cachedSystemPrompt = [
    agentDefinition,
    "\n\n---\n\n# Reference: Question Bank\n\n",
    questionBank,
    "\n\n---\n\n# Reference: PRD\n\n",
    prd,
    "\n\n---\n\n# Runtime note\n\n" +
      "You are running as a chat API, not inside Claude Code. You cannot read files " +
      "yourself — the definition, question bank, and PRD above are already loaded for you. " +
      "You also cannot write files to disk. When the interview concludes and the hiring " +
      "manager approves the draft, output the final job description directly in your chat " +
      "reply as clean Markdown, clearly marked as the final version, followed by the " +
      "structured intake record as a JSON code block. Do not claim you wrote files.",
  ].join("");

  return cachedSystemPrompt;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function runJobDescriptionTurn(
  messages: ChatMessage[]
): Promise<string> {
  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    system: buildJobDescriptionSystemPrompt(),
    messages,
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}
