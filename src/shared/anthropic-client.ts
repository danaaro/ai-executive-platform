import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (client) return client;

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.local.example to .env.local, add your key, and restart `npm run dev`."
    );
  }

  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const DEFAULT_MODEL = "claude-sonnet-5";
