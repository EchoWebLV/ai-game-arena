/**
 * Off-chain Texas Hold'em hand evaluator.
 * Card encoding: card % 13 = rank (0=2, 1=3, ..., 12=A)
 *                Math.floor(card / 13) = suit (0-3)
 */

const HAND_HIGH_CARD = 0;
const HAND_PAIR = 1;
const HAND_TWO_PAIR = 2;
const HAND_TRIPS = 3;
const HAND_STRAIGHT = 4;
const HAND_FLUSH = 5;
const HAND_FULL_HOUSE = 6;
const HAND_QUADS = 7;
const HAND_STRAIGHT_FLUSH = 8;

const HAND_NAMES = [
  "High Card", "Pair", "Two Pair", "Three of a Kind",
  "Straight", "Flush", "Full House", "Four of a Kind",
  "Straight Flush",
];

const RANK_NAMES = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];

export function evaluateHand(allCards: number[]): number {
  const valid = allCards.filter(c => c >= 0 && c < 52);
  if (valid.length < 5) return 0;

  let best = 0;
  for (const hand of combinations5(valid)) {
    const val = evaluate5(hand);
    if (val > best) best = val;
  }
  return best;
}

function combinations5(arr: number[]): number[][] {
  const results: number[][] = [];
  const n = arr.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++)
            results.push([arr[a], arr[b], arr[c], arr[d], arr[e]]);
  return results;
}

function evaluate5(cards: number[]): number {
  const ranks = cards.map(c => c % 13).sort((a, b) => a - b);
  const suits = cards.map(c => Math.floor(c / 13));

  const isFlush = suits[0] === suits[1] && suits[1] === suits[2]
    && suits[2] === suits[3] && suits[3] === suits[4];

  let isStraight = false;
  let straightHigh = 0;
  const unique = new Set(ranks);
  if (unique.size === 5) {
    if (ranks[4] - ranks[0] === 4) {
      isStraight = true;
      straightHigh = ranks[4];
    }
    // Ace-low straight: A-2-3-4-5 → sorted [0,1,2,3,12]
    if (ranks[0] === 0 && ranks[1] === 1 && ranks[2] === 2
      && ranks[3] === 3 && ranks[4] === 12) {
      isStraight = true;
      straightHigh = 3;
    }
  }

  const freq = new Map<number, number>();
  for (const r of ranks) freq.set(r, (freq.get(r) || 0) + 1);
  const groups = Array.from(freq.entries())
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  let handType: number;
  let kickers: number[];

  if (isFlush && isStraight) {
    handType = HAND_STRAIGHT_FLUSH;
    kickers = [straightHigh];
  } else if (groups[0].count === 4) {
    handType = HAND_QUADS;
    kickers = [groups[0].rank, groups[1].rank];
  } else if (groups[0].count === 3 && groups[1].count === 2) {
    handType = HAND_FULL_HOUSE;
    kickers = [groups[0].rank, groups[1].rank];
  } else if (isFlush) {
    handType = HAND_FLUSH;
    kickers = [...ranks].reverse();
  } else if (isStraight) {
    handType = HAND_STRAIGHT;
    kickers = [straightHigh];
  } else if (groups[0].count === 3) {
    handType = HAND_TRIPS;
    kickers = [groups[0].rank, ...groups.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a)];
  } else if (groups[0].count === 2 && groups[1].count === 2) {
    handType = HAND_TWO_PAIR;
    const pairs = [groups[0].rank, groups[1].rank].sort((a, b) => b - a);
    const kicker = groups.find(g => g.count === 1)!.rank;
    kickers = [...pairs, kicker];
  } else if (groups[0].count === 2) {
    handType = HAND_PAIR;
    kickers = [groups[0].rank, ...groups.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a)];
  } else {
    handType = HAND_HIGH_CARD;
    kickers = [...ranks].reverse();
  }

  let value = handType;
  for (let i = 0; i < 5; i++) {
    value = value * 15 + (kickers[i] ?? 0);
  }
  return value;
}

/**
 * Determine the winner(s) among surviving players.
 * Returns array of winner indices (multiple for split pots).
 */
export function determineWinners(
  holeCards: [number, number][],
  communityCards: number[],
  activePlayers: boolean[],
  folded: boolean[],
): number[] {
  const validCommunity = communityCards.filter(c => c !== 255 && c >= 0 && c < 52);
  let bestStrength = -1;
  let winners: number[] = [];

  for (let i = 0; i < holeCards.length; i++) {
    if (!activePlayers[i] || folded[i]) continue;

    const allCards = [...holeCards[i], ...validCommunity];
    if (allCards.length < 5) continue;

    const strength = evaluateHand(allCards);
    if (strength > bestStrength) {
      bestStrength = strength;
      winners = [i];
    } else if (strength === bestStrength) {
      winners.push(i);
    }
  }

  return winners;
}

export function describeHand(allCards: number[]): string {
  const valid = allCards.filter(c => c >= 0 && c < 52);
  if (valid.length < 5) return "Unknown";

  let bestType = 0;
  let bestKickers: number[] = [];
  let bestValue = 0;

  for (const hand of combinations5(valid)) {
    const ranks = hand.map(c => c % 13).sort((a, b) => a - b);
    const suits = hand.map(c => Math.floor(c / 13));

    const isFlush = suits[0] === suits[1] && suits[1] === suits[2]
      && suits[2] === suits[3] && suits[3] === suits[4];
    let isStraight = false;
    let straightHigh = 0;
    if (new Set(ranks).size === 5) {
      if (ranks[4] - ranks[0] === 4) { isStraight = true; straightHigh = ranks[4]; }
      if (ranks[0] === 0 && ranks[1] === 1 && ranks[2] === 2
        && ranks[3] === 3 && ranks[4] === 12) { isStraight = true; straightHigh = 3; }
    }

    const freq = new Map<number, number>();
    for (const r of ranks) freq.set(r, (freq.get(r) || 0) + 1);
    const groups = Array.from(freq.entries())
      .map(([rank, count]) => ({ rank, count }))
      .sort((a, b) => b.count - a.count || b.rank - a.rank);

    let ht: number;
    let k: number[];
    if (isFlush && isStraight) { ht = HAND_STRAIGHT_FLUSH; k = [straightHigh]; }
    else if (groups[0].count === 4) { ht = HAND_QUADS; k = [groups[0].rank, groups[1].rank]; }
    else if (groups[0].count === 3 && groups[1].count === 2) { ht = HAND_FULL_HOUSE; k = [groups[0].rank, groups[1].rank]; }
    else if (isFlush) { ht = HAND_FLUSH; k = [...ranks].reverse(); }
    else if (isStraight) { ht = HAND_STRAIGHT; k = [straightHigh]; }
    else if (groups[0].count === 3) { ht = HAND_TRIPS; k = [groups[0].rank]; }
    else if (groups[0].count === 2 && groups[1].count === 2) { ht = HAND_TWO_PAIR; k = [groups[0].rank, groups[1].rank].sort((a,b) => b-a); }
    else if (groups[0].count === 2) { ht = HAND_PAIR; k = [groups[0].rank]; }
    else { ht = HAND_HIGH_CARD; k = [...ranks].reverse(); }

    let val = ht;
    for (let i = 0; i < 5; i++) val = val * 15 + (k[i] ?? 0);

    if (val > bestValue) {
      bestValue = val;
      bestType = ht;
      bestKickers = k;
    }
  }

  const name = HAND_NAMES[bestType];
  const topRank = RANK_NAMES[bestKickers[0]] ?? "";

  switch (bestType) {
    case HAND_STRAIGHT_FLUSH:
      return bestKickers[0] === 12 ? "Royal Flush" : `Straight Flush (${topRank}-high)`;
    case HAND_QUADS: return `Four ${topRank}s`;
    case HAND_FULL_HOUSE: return `Full House (${topRank}s full of ${RANK_NAMES[bestKickers[1]]})`;
    case HAND_FLUSH: return `Flush (${topRank}-high)`;
    case HAND_STRAIGHT: return `Straight (${topRank}-high)`;
    case HAND_TRIPS: return `Three ${topRank}s`;
    case HAND_TWO_PAIR: return `Two Pair (${topRank}s and ${RANK_NAMES[bestKickers[1]]}s)`;
    case HAND_PAIR: return `Pair of ${topRank}s`;
    default: return `${topRank}-high`;
  }
}
