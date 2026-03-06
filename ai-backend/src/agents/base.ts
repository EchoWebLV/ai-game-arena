export interface GameContext {
  hand_number: number;
  pot: number;
  current_round: string; // "preflop" | "flop" | "turn" | "river"
  community_cards: number[];
  my_hole_cards: [number, number];
  my_chips: number;
  my_current_bet: number;
  opponents: OpponentInfo[];
  small_blind: number;
  big_blind: number;
  last_raise: number;
  position: string; // "dealer" | "small_blind" | "big_blind" | "early" | "late"
}

export interface OpponentInfo {
  player_idx: number;
  chips: number;
  current_bet: number;
  is_folded: boolean;
  is_all_in: boolean;
  ai_model: string;
}

export interface PokerDecision {
  action: "fold" | "check" | "call" | "raise" | "all_in";
  raise_amount?: number;
  reasoning: string;
}

export function cardToString(card: number): string {
  const ranks = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "A",
  ];
  const suits = ["♥", "♦", "♣", "♠"];
  const rank = ranks[card % 13];
  const suit = suits[Math.floor(card / 13)];
  return `${rank}${suit}`;
}

export function roundName(round: number): string {
  return ["preflop", "flop", "turn", "river", "showdown"][round] || "unknown";
}

export function buildPokerPrompt(ctx: GameContext, personality: string): string {
  const holeCards = ctx.my_hole_cards
    .map((c) => cardToString(c))
    .join(", ");
  const communityCards =
    ctx.community_cards.length > 0
      ? ctx.community_cards.filter((c) => c !== 255).map((c) => cardToString(c)).join(", ")
      : "none yet";
  const opponentsSummary = ctx.opponents
    .filter((o) => !o.is_folded)
    .map(
      (o) =>
        `  AI#${o.player_idx} (${o.ai_model}): ${o.chips} chips, bet ${o.current_bet}${o.is_all_in ? " [ALL-IN]" : ""}`
    )
    .join("\n");

  return `You are an AI poker player in a Texas Hold'em tournament. ${personality}

CURRENT GAME STATE:
- Hand #${ctx.hand_number}, Round: ${ctx.current_round}
- Your hole cards: ${holeCards}
- Community cards: ${communityCards}
- Pot: ${ctx.pot}
- Your chips: ${ctx.my_chips}
- Your current bet this round: ${ctx.my_current_bet}
- Current raise to call: ${ctx.last_raise}
- Blinds: ${ctx.small_blind}/${ctx.big_blind}
- Your position: ${ctx.position}

ACTIVE OPPONENTS:
${opponentsSummary}

Available actions:
- "fold": Give up this hand
- "check": Pass (only if no bet to call)
- "call": Match the current bet (costs ${ctx.last_raise - ctx.my_current_bet})
- "raise": Raise to a specific amount (must be more than current raise)
- "all_in": Bet all your remaining chips (${ctx.my_chips})

Respond ONLY with valid JSON: {"action": "...", "raise_amount": number_or_null, "reasoning": "brief explanation"}`;
}

export abstract class BaseAgent {
  abstract name: string;
  abstract modelId: string;
  abstract personality: string;

  abstract makeDecision(ctx: GameContext): Promise<PokerDecision>;

  protected parseDecision(raw: string): PokerDecision {
    try {
      const jsonMatch = raw.match(/\{[^}]+\}/);
      if (!jsonMatch) {
        return { action: "fold", reasoning: "Failed to parse response" };
      }
      const parsed = JSON.parse(jsonMatch[0]);
      const validActions = ["fold", "check", "call", "raise", "all_in"];
      if (!validActions.includes(parsed.action)) {
        return { action: "fold", reasoning: "Invalid action returned" };
      }
      return {
        action: parsed.action,
        raise_amount: parsed.raise_amount ?? undefined,
        reasoning: parsed.reasoning ?? "",
      };
    } catch {
      return { action: "call", reasoning: "JSON parse error, defaulting to call" };
    }
  }
}
