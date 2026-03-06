import OpenAI from "openai";
import {
  GameContext,
  PokerDecision,
  buildPokerPrompt,
  fallbackDecision,
  parseDecision,
} from "./base";

const AGENTS = [
  { name: "GPT Shark", model: "openai/gpt-5.2-chat", temperature: 0.7 },
  { name: "Claude Strategist", model: "anthropic/claude-sonnet-4.6", temperature: 0.7 },
  { name: "Gemini Wildcard", model: "google/gemini-3.1-pro-preview", temperature: 0.7 },
  { name: "Llama Grinder", model: "meta-llama/llama-3.1-70b-instruct", temperature: 0.7 },
  { name: "Grok Bluffer", model: "x-ai/grok-3", temperature: 0.7 },
] as const;

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (client) return client;
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  client = new OpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://ai-poker-arena.com",
      "X-Title": "AI Poker Arena",
    },
  });
  return client;
}

export function getAgentInfo() {
  return AGENTS.map((a, i) => ({ idx: i, name: a.name, model: a.model }));
}

export async function makeDecision(
  agentIdx: number,
  ctx: GameContext
): Promise<PokerDecision> {
  const agent = AGENTS[agentIdx];
  if (!agent) return fallbackDecision(ctx);

  const openai = getClient();
  if (!openai) return fallbackDecision(ctx);

  try {
    const prompt = buildPokerPrompt(ctx);
    const response = await openai.chat.completions.create({
      model: agent.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: agent.temperature,
    });
    const raw = response.choices[0]?.message?.content ?? "";
    const decision = parseDecision(raw);
    if (decision.reasoning === "Failed to parse response" || decision.reasoning === "JSON parse error, defaulting to call") {
      console.warn(`[${agent.name}] Parse failed. Raw response:\n  "${raw.slice(0, 300)}"`);
    }
    return decision;
  } catch (err: any) {
    console.warn(`[${agent.name}] OpenRouter error: ${err.message?.slice(0, 120)}`);
    return fallbackDecision(ctx);
  }
}

export const AI_NAMES = AGENTS.map((a) => a.name);
export const AI_MODELS = AGENTS.map((a) => a.model);
export const NUM_AGENTS = AGENTS.length;
