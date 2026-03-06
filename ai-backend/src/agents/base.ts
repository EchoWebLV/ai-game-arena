export interface GameContext {
  hand_number: number;
  pot: number;
  current_round: string;
  community_cards: number[];
  my_hole_cards: [number, number];
  my_chips: number;
  my_current_bet: number;
  opponents: OpponentInfo[];
  small_blind: number;
  big_blind: number;
  last_raise: number;
  position: string;
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
  const ranks = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
  const suits = ["♥", "♦", "♣", "♠"];
  return `${ranks[card % 13]}${suits[Math.floor(card / 13)]}`;
}

export function roundName(round: number): string {
  return ["preflop", "flop", "turn", "river", "showdown"][round] || "unknown";
}

export function buildPokerPrompt(ctx: GameContext): string {
  const holeCards = ctx.my_hole_cards.map((c) => cardToString(c)).join(", ");
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

  return `You are a world-class poker AI competing in a Texas Hold'em tournament. Play optimally to win. Use pot odds, position, hand strength, and opponent tendencies to make the best possible decision.

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

IMPORTANT: You MUST respond with ONLY a single JSON object on one line. No markdown, no explanation, no code fences. Just raw JSON.
Format: {"action": "fold|check|call|raise|all_in", "raise_amount": number_or_null, "reasoning": "one sentence"}
Example: {"action": "call", "raise_amount": null, "reasoning": "Decent hand, pot odds justify a call"}
YOUR RESPONSE (JSON only):`;
}

export function fallbackDecision(ctx: GameContext): PokerDecision {
  const callCost = Math.max(0, ctx.last_raise - ctx.my_current_bet);
  const r = Math.random();
  if (r < 0.10) return { action: "fold", reasoning: "fallback: fold" };
  if (r < 0.40 && callCost === 0) return { action: "check", reasoning: "fallback: check" };
  if (r < 0.75) return { action: "call", reasoning: "fallback: call" };
  if (r < 0.92) return { action: "raise", raise_amount: ctx.last_raise * 2, reasoning: "fallback: raise" };
  return { action: "all_in", reasoning: "fallback: all-in" };
}

const VALID_ACTIONS = ["fold", "check", "call", "raise", "all_in"];

export function parseDecision(raw: string): PokerDecision {
  // Strip markdown code fences
  let cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();

  // Try full JSON parse first
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (VALID_ACTIONS.includes(parsed.action)) {
        return {
          action: parsed.action,
          raise_amount: parsed.raise_amount ?? undefined,
          reasoning: parsed.reasoning ?? "",
        };
      }
    }
  } catch { /* fall through to regex extraction */ }

  // Regex fallback: extract action and reasoning from malformed/truncated JSON
  try {
    const actionMatch = cleaned.match(/"action"\s*:\s*"(\w+)"/);
    const reasonMatch = cleaned.match(/"reasoning"\s*:\s*"([^"]*)"/);
    const raiseMatch = cleaned.match(/"raise_amount"\s*:\s*(\d+)/);

    if (actionMatch && VALID_ACTIONS.includes(actionMatch[1])) {
      return {
        action: actionMatch[1] as PokerDecision["action"],
        raise_amount: raiseMatch ? parseInt(raiseMatch[1]) : undefined,
        reasoning: reasonMatch?.[1] ?? "",
      };
    }
  } catch { /* fall through */ }

  return { action: "fold", reasoning: "Failed to parse response" };
}
