import OpenAI from "openai";
import { BaseAgent, GameContext, PokerDecision, buildPokerPrompt } from "./base";

export class MistralAgent extends BaseAgent {
  name = "Mistral Bluffer";
  modelId = "mistralai/mistral-large-latest";
  personality =
    "You are a loose-aggressive poker player who loves to bluff. You apply maximum pressure with frequent raises and re-raises. You thrive on making opponents fold better hands.";

  private client: OpenAI;

  constructor() {
    super();
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }

  async makeDecision(ctx: GameContext): Promise<PokerDecision> {
    try {
      const prompt = buildPokerPrompt(ctx, this.personality);
      const response = await this.client.chat.completions.create({
        model: this.modelId,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.8,
      });

      const raw = response.choices[0]?.message?.content ?? "";
      return this.parseDecision(raw);
    } catch (error) {
      console.error(`Mistral agent error:`, error);
      return { action: "call", reasoning: "API error, defaulting to call" };
    }
  }
}
