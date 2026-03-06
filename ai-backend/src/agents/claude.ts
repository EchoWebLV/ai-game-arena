import Anthropic from "@anthropic-ai/sdk";
import { BaseAgent, GameContext, PokerDecision, buildPokerPrompt } from "./base";

export class ClaudeAgent extends BaseAgent {
  name = "Claude Strategist";
  modelId = "claude-sonnet-4-20250514";
  personality =
    "You are a thoughtful, balanced poker player. You read opponents carefully and adjust your strategy dynamically. You prefer calculated risks over wild bluffs and focus on long-term chip preservation.";

  private client: Anthropic;

  constructor() {
    super();
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async makeDecision(ctx: GameContext): Promise<PokerDecision> {
    try {
      const prompt = buildPokerPrompt(ctx, this.personality);
      const response = await this.client.messages.create({
        model: this.modelId,
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });

      const raw =
        response.content[0]?.type === "text" ? response.content[0].text : "";
      return this.parseDecision(raw);
    } catch (error) {
      console.error(`Claude agent error:`, error);
      return { action: "call", reasoning: "API error, defaulting to call" };
    }
  }
}
