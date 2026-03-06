import OpenAI from "openai";
import { BaseAgent, GameContext, PokerDecision, buildPokerPrompt } from "./base";

export class LlamaAgent extends BaseAgent {
  name = "Llama Grinder";
  modelId = "meta-llama/llama-3.1-70b-instruct";
  personality =
    "You are a tight-aggressive poker player. You only play strong hands but when you do, you bet big. You rarely bluff and wait patiently for premium hands to maximize value.";

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
        temperature: 0.6,
      });

      const raw = response.choices[0]?.message?.content ?? "";
      return this.parseDecision(raw);
    } catch (error) {
      console.error(`Llama agent error:`, error);
      return { action: "call", reasoning: "API error, defaulting to call" };
    }
  }
}
