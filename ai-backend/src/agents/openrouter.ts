import OpenAI from "openai";
import {
  GameContext,
  PokerDecision,
  buildPokerPrompt,
  fallbackDecision,
  parseDecision,
  cardToString,
} from "./base";

const AGENTS = [
  { name: "GPT-5.2", model: "openai/gpt-5.2-chat", temperature: 0.7 },
  { name: "Claude Sonnet 4.6", model: "anthropic/claude-sonnet-4.6", temperature: 0.7 },
  { name: "Gemini 3.1 Pro", model: "google/gemini-3.1-pro-preview", temperature: 0.7 },
  { name: "Llama 3.1 70B", model: "meta-llama/llama-3.1-70b-instruct", temperature: 0.7 },
  { name: "Grok 3", model: "x-ai/grok-3", temperature: 0.7 },
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

const SYSTEM_MSG = `You are a poker AI. You MUST respond with ONLY a single JSON object. No text before or after. No markdown. The "reasoning" field MUST contain a non-empty explanation of your decision. Example: {"action":"call","raise_amount":null,"reasoning":"pot odds justify a call"}`;

const MAX_RETRIES = 2;

export async function makeDecision(
  agentIdx: number,
  ctx: GameContext
): Promise<PokerDecision> {
  const agent = AGENTS[agentIdx];
  if (!agent) return fallbackDecision(ctx);

  const openai = getClient();
  if (!openai) return fallbackDecision(ctx);

  const prompt = buildPokerPrompt(ctx);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: agent.model,
        messages: [
          { role: "system", content: SYSTEM_MSG },
          { role: "user", content: prompt },
        ],
        max_tokens: 300,
        temperature: agent.temperature,
      });
      const raw = response.choices[0]?.message?.content ?? "";

      if (!raw.trim()) {
        console.warn(`[${agent.name}] Empty response (attempt ${attempt + 1}/${MAX_RETRIES})`);
        continue;
      }

      const decision = parseDecision(raw);
      if (decision.reasoning === "Failed to parse response") {
        console.warn(`[${agent.name}] Parse failed (attempt ${attempt + 1}/${MAX_RETRIES}). Raw:\n  "${raw.slice(0, 300)}"`);
        if (attempt < MAX_RETRIES - 1) continue;
        const fb = fallbackDecision(ctx);
        fb.reasoning = `AI response unparseable, using fallback: ${fb.action}`;
        return fb;
      }

      if (!decision.reasoning || !decision.reasoning.trim()) {
        decision.reasoning = generateDefaultReasoning(decision.action, ctx);
      }

      return decision;
    } catch (err: any) {
      console.warn(`[${agent.name}] OpenRouter error (attempt ${attempt + 1}/${MAX_RETRIES}): ${err.message?.slice(0, 120)}`);
      if (attempt < MAX_RETRIES - 1) continue;
    }
  }

  return fallbackDecision(ctx);
}

function generateDefaultReasoning(action: string, ctx: GameContext): string {
  const cards = ctx.my_hole_cards.map((c) => cardToString(c)).join("-");
  switch (action) {
    case "fold": return `Folding ${cards} — not strong enough for this spot.`;
    case "check": return `Checking ${cards} — no need to build the pot here.`;
    case "call": return `Calling with ${cards} — odds are acceptable.`;
    case "raise": return `Raising with ${cards} — building the pot with a strong hand.`;
    case "all_in": return `Going all-in with ${cards} — maximum pressure.`;
    default: return `Playing ${cards}.`;
  }
}

export const AI_NAMES = AGENTS.map((a) => a.name);
export const AI_MODELS = AGENTS.map((a) => a.model);
export const NUM_AGENTS = AGENTS.length;
