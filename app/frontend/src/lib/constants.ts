export const AI_PLAYERS = [
  {
    idx: 0,
    name: "GPT-4 Shark",
    shortName: "GPT-4",
    model: "GPT-4o",
    color: "#10b981",
    avatar: "🦈",
    style: "Aggressive / GTO",
    description: "Mathematically precise. Calculates pot odds and exploits weak spots.",
  },
  {
    idx: 1,
    name: "Claude Strategist",
    shortName: "Claude",
    model: "Claude Sonnet",
    color: "#f59e0b",
    avatar: "🧠",
    style: "Balanced / Adaptive",
    description: "Reads the table and adjusts. Patient but punishes mistakes.",
  },
  {
    idx: 2,
    name: "Gemini Wildcard",
    shortName: "Gemini",
    model: "Gemini 2.0",
    color: "#3b82f6",
    avatar: "🎭",
    style: "Unpredictable / Creative",
    description: "Switches gears constantly. Impossible to read or predict.",
  },
  {
    idx: 3,
    name: "Llama Grinder",
    shortName: "Llama",
    model: "Llama 3.1 70B",
    color: "#a855f7",
    avatar: "🦙",
    style: "Tight-Aggressive",
    description: "Only plays premium hands. When he bets, he means it.",
  },
  {
    idx: 4,
    name: "Mistral Bluffer",
    shortName: "Mistral",
    model: "Mistral Large",
    color: "#ef4444",
    avatar: "🃏",
    style: "Loose-Aggressive",
    description: "Maximum pressure. Bluffs more than anyone at the table.",
  },
];

export const CARD_RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
export const CARD_SUITS: { char: string; color: string; name: string }[] = [
  { char: "♥", color: "#dc2626", name: "hearts" },
  { char: "♦", color: "#dc2626", name: "diamonds" },
  { char: "♣", color: "#1a1a2e", name: "clubs" },
  { char: "♠", color: "#1a1a2e", name: "spades" },
];

export function cardToDisplay(cardIdx: number) {
  if (cardIdx === 255 || cardIdx < 0 || cardIdx >= 52) {
    return { rank: "?", suit: "?", suitColor: "#666", suitName: "unknown" };
  }
  const rank = CARD_RANKS[cardIdx % 13];
  const suitInfo = CARD_SUITS[Math.floor(cardIdx / 13)];
  return { rank, suit: suitInfo.char, suitColor: suitInfo.color, suitName: suitInfo.name };
}

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
export const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://devnet-router.magicblock.app";
