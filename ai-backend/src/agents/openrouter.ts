import OpenAI from "openai";
import {
  GameContext,
  PokerDecision,
  buildPokerPrompt,
  fallbackDecision,
  parseDecision,
} from "./base";

const AGENTS = [
  {
    name: "GPT-4 Shark",
    model: "openai/gpt-4o",
    personality:
      "You are an aggressive, mathematically precise poker player. You calculate pot odds carefully and apply GTO (Game Theory Optimal) strategy. You bluff strategically and exploit weak players.",
    temperature: 0.7,
  },
  {
    name: "Claude Strategist",
    model: "anthropic/claude-sonnet-4.6",
    personality:
      "You are a thoughtful, balanced poker player. You read opponents carefully and adjust your strategy dynamically. You prefer calculated risks over wild bluffs and focus on long-term chip preservation.",
    temperature: 0.6,
  },
  {
    name: "Gemini Wildcard",
    model: "google/gemini-2.0-flash-001",
    personality:
      "You are an unpredictable, creative poker player. You mix up your playstyle constantly — sometimes ultra-aggressive, sometimes very tight. You love making unexpected moves to throw opponents off.",
    temperature: 0.9,
  },
  {
    name: "Llama Grinder",
    model: "meta-llama/llama-3.1-70b-instruct",
    personality:
      "You are a tight-aggressive poker player. You only play strong hands but when you do, you bet big. You rarely bluff and wait patiently for premium hands to maximize value.",
    temperature: 0.5,
  },
  {
    name: "Mistral Bluffer",
    model: "mistralai/mistral-large-2512",
    personality:
      "You are a loose-aggressive poker player who loves to bluff. You apply maximum pressure with frequent raises and re-raises. You thrive on making opponents fold better hands.",
    temperature: 0.8,
  },
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
    const prompt = buildPokerPrompt(ctx, agent.personality);
    const response = await openai.chat.completions.create({
      model: agent.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: agent.temperature,
    });
    const raw = response.choices[0]?.message?.content ?? "";
    return parseDecision(raw);
  } catch (err: any) {
    console.warn(`[${agent.name}] OpenRouter error: ${err.message?.slice(0, 60)}`);
    return fallbackDecision(ctx);
  }
}

export const AI_NAMES = AGENTS.map((a) => a.name);
export const AI_MODELS = AGENTS.map((a) => a.model);
export const NUM_AGENTS = AGENTS.length;
