export const AI_PLAYERS = [
  {
    idx: 0,
    name: "GPT-5.4",
    shortName: "GPT",
    model: "openai/gpt-5.4",
    color: "#10b981",
    avatar: "/ai-logos/openai.svg",
  },
  {
    idx: 1,
    name: "Claude Sonnet 4.6",
    shortName: "Claude",
    model: "anthropic/claude-sonnet-4.6",
    color: "#D97757",
    avatar: "/ai-logos/claude.svg",
  },
  {
    idx: 2,
    name: "Gemini 3.1 Pro",
    shortName: "Gemini",
    model: "google/gemini-3.1-pro-preview",
    color: "#4285F4",
    avatar: "/ai-logos/gemini.svg",
  },
  {
    idx: 3,
    name: "Llama 4 Scout",
    shortName: "Llama",
    model: "meta-llama/llama-4-scout",
    color: "#a855f7",
    avatar: "/ai-logos/meta.svg",
  },
  {
    idx: 4,
    name: "Grok 3",
    shortName: "Grok",
    model: "x-ai/grok-3",
    color: "#ef4444",
    avatar: "/ai-logos/grok.svg",
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
