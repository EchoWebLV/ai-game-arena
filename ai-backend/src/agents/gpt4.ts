import OpenAI from "openai";
import { BaseAgent, GameContext, PokerDecision, buildPokerPrompt } from "./base";

export class GPT4Agent extends BaseAgent {
  name = "GPT-4 Shark";
  modelId = "gpt-4o";
  personality =
    "You are an aggressive, mathematically precise poker player. You calculate pot odds carefully and apply GTO (Game Theory Optimal) strategy. You bluff strategically and exploit weak players.";

  private client: OpenAI;

  constructor() {
    super();
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async makeDecision(ctx: GameContext): Promise<PokerDecision> {
    try {
      const prompt = buildPokerPrompt(ctx, this.personality);
      const response = await this.client.chat.completions.create({
        model: this.modelId,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      });

      const raw = response.choices[0]?.message?.content ?? "";
      return this.parseDecision(raw);
    } catch (error) {
      console.error(`GPT-4 agent error:`, error);
      return { action: "call", reasoning: "API error, defaulting to call" };
    }
  }
}
