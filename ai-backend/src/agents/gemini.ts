import { GoogleGenerativeAI } from "@google/generative-ai";
import { BaseAgent, GameContext, PokerDecision, buildPokerPrompt } from "./base";

export class GeminiAgent extends BaseAgent {
  name = "Gemini Wildcard";
  modelId = "gemini-2.0-flash";
  personality =
    "You are an unpredictable, creative poker player. You mix up your playstyle constantly — sometimes ultra-aggressive, sometimes very tight. You love making unexpected moves to throw opponents off.";

  private client: GoogleGenerativeAI;

  constructor() {
    super();
    this.client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? "");
  }

  async makeDecision(ctx: GameContext): Promise<PokerDecision> {
    try {
      const prompt = buildPokerPrompt(ctx, this.personality);
      const model = this.client.getGenerativeModel({
        model: this.modelId,
      });
      const result = await model.generateContent(prompt);
      const raw = result.response.text();
      return this.parseDecision(raw);
    } catch (error) {
      console.error(`Gemini agent error:`, error);
      return { action: "call", reasoning: "API error, defaulting to call" };
    }
  }
}
