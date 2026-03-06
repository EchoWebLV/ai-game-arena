import express from "express";
import { Keypair } from "@solana/web3.js";
import * as dotenv from "dotenv";
import { GPT4Agent } from "./agents/gpt4";
import { ClaudeAgent } from "./agents/claude";
import { GeminiAgent } from "./agents/gemini";
import { LlamaAgent } from "./agents/llama";
import { MistralAgent } from "./agents/mistral";
import { BaseAgent, PokerDecision, GameContext } from "./agents/base";
import { PokerClient } from "./poker-client";

dotenv.config();

const app = express();
app.use(express.json());

const agents: BaseAgent[] = [
  new GPT4Agent(),
  new ClaudeAgent(),
  new GeminiAgent(),
  new LlamaAgent(),
  new MistralAgent(),
];

const PORT = process.env.PORT || 3001;
const RPC_URL =
  process.env.SOLANA_RPC_URL || "https://devnet-router.magicblock.app";

let pokerClient: PokerClient;

function getWallet(): Keypair {
  if (process.env.WALLET_PRIVATE_KEY) {
    const secret = JSON.parse(process.env.WALLET_PRIVATE_KEY);
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }
  return Keypair.generate();
}

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agents: agents.map((a) => ({ name: a.name, model: a.modelId })),
  });
});

// Get all agents info
app.get("/agents", (_req, res) => {
  res.json(
    agents.map((a, idx) => ({
      idx,
      name: a.name,
      model: a.modelId,
    }))
  );
});

// Get a decision from a specific AI agent given a game context
app.post("/decide/:agentIdx", async (req, res) => {
  try {
    const idx = parseInt(req.params.agentIdx);
    if (idx < 0 || idx >= agents.length) {
      return res.status(400).json({ error: "Invalid agent index" });
    }

    const ctx: GameContext = req.body;
    const agent = agents[idx];
    const decision = await agent.makeDecision(ctx);

    console.log(
      `[${agent.name}] Hand #${ctx.hand_number} ${ctx.current_round}: ${decision.action}${decision.raise_amount ? ` (${decision.raise_amount})` : ""} - ${decision.reasoning}`
    );

    res.json({
      agent: agent.name,
      decision,
    });
  } catch (error: any) {
    console.error("Decision error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Run a full tournament game loop (orchestrator)
app.post("/tournament/run", async (req, res) => {
  try {
    const { tournamentId, maxHands = 50 } = req.body;
    const results: any[] = [];

    let chips = [10000, 10000, 10000, 10000, 10000];
    let active = [true, true, true, true, true];
    let handNum = 0;
    const smallBlind = 50;
    const bigBlind = 100;

    console.log("\n=== AI POKER TOURNAMENT START ===");
    console.log(
      `Players: ${agents.map((a) => a.name).join(" vs ")}`
    );

    while (
      handNum < maxHands &&
      active.filter(Boolean).length > 1
    ) {
      handNum++;
      const dealerIdx = (handNum - 1) % 5;

      // Generate pseudo-random deck
      const randomness = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        randomness[i] = Math.floor(Math.random() * 256);
      }
      const deck = shuffleDeck(randomness);

      // Deal hole cards
      let deckIdx = 0;
      const holeCards: [number, number][] = [];
      for (let i = 0; i < 5; i++) {
        holeCards.push([deck[deckIdx], deck[deckIdx + 1]]);
        deckIdx += 2;
      }

      // Community cards
      deckIdx++; // burn
      const communityCards = [
        deck[deckIdx],
        deck[deckIdx + 1],
        deck[deckIdx + 2],
      ];
      deckIdx += 3;
      deckIdx++; // burn
      communityCards.push(deck[deckIdx]);
      deckIdx++;
      deckIdx++; // burn
      communityCards.push(deck[deckIdx]);

      // Post blinds
      const sbIdx = (dealerIdx + 1) % 5;
      const bbIdx = (dealerIdx + 2) % 5;
      let pot = 0;
      const bets = [0, 0, 0, 0, 0];
      const folded = [false, false, false, false, false];

      if (active[sbIdx]) {
        const sb = Math.min(smallBlind, chips[sbIdx]);
        chips[sbIdx] -= sb;
        bets[sbIdx] = sb;
        pot += sb;
      }
      if (active[bbIdx]) {
        const bb = Math.min(bigBlind, chips[bbIdx]);
        chips[bbIdx] -= bb;
        bets[bbIdx] = bb;
        pot += bb;
      }

      let lastRaise = bigBlind;

      console.log(`\n--- Hand #${handNum} (Dealer: ${agents[dealerIdx].name}) ---`);

      // Betting rounds
      const rounds = ["preflop", "flop", "turn", "river"];
      for (let roundIdx = 0; roundIdx < 4; roundIdx++) {
        const round = rounds[roundIdx];
        const visibleCommunity =
          round === "preflop"
            ? []
            : round === "flop"
              ? communityCards.slice(0, 3)
              : round === "turn"
                ? communityCards.slice(0, 4)
                : communityCards;

        // Reset round bets
        for (let i = 0; i < 5; i++) bets[i] = 0;
        lastRaise = round === "preflop" ? bigBlind : 0;

        const startIdx = round === "preflop" ? (bbIdx + 1) % 5 : (dealerIdx + 1) % 5;

        let actionsThisRound = 0;
        const maxActions = 5 * 3; // prevent infinite loops

        for (let a = 0; a < maxActions; a++) {
          const pIdx = (startIdx + a) % 5;

          if (!active[pIdx] || folded[pIdx] || chips[pIdx] === 0) continue;

          const activePlayers = active.filter((v, i) => v && !folded[i]);
          if (activePlayers.length <= 1) break;

          const opponents: any[] = [];
          for (let j = 0; j < 5; j++) {
            if (j === pIdx) continue;
            opponents.push({
              player_idx: j,
              chips: chips[j],
              current_bet: bets[j],
              is_folded: folded[j] || !active[j],
              is_all_in: chips[j] === 0 && active[j],
              ai_model: agents[j].name,
            });
          }

          const ctx: GameContext = {
            hand_number: handNum,
            pot,
            current_round: round,
            community_cards: visibleCommunity,
            my_hole_cards: holeCards[pIdx],
            my_chips: chips[pIdx],
            my_current_bet: bets[pIdx],
            opponents,
            small_blind: smallBlind,
            big_blind: bigBlind,
            last_raise: lastRaise,
            position:
              pIdx === dealerIdx
                ? "dealer"
                : pIdx === sbIdx
                  ? "small_blind"
                  : pIdx === bbIdx
                    ? "big_blind"
                    : "early",
          };

          let decision: PokerDecision;
          try {
            decision = await agents[pIdx].makeDecision(ctx);
          } catch {
            decision = { action: "call", reasoning: "fallback" };
          }

          // Apply action
          const callAmount = Math.max(0, lastRaise - bets[pIdx]);
          switch (decision.action) {
            case "fold":
              folded[pIdx] = true;
              break;
            case "check":
              break;
            case "call": {
              const amt = Math.min(callAmount, chips[pIdx]);
              chips[pIdx] -= amt;
              bets[pIdx] += amt;
              pot += amt;
              break;
            }
            case "raise": {
              const raiseAmt = Math.min(
                decision.raise_amount ?? lastRaise * 2,
                chips[pIdx]
              );
              chips[pIdx] -= raiseAmt;
              bets[pIdx] += raiseAmt;
              pot += raiseAmt;
              lastRaise = bets[pIdx];
              break;
            }
            case "all_in": {
              const allAmt = chips[pIdx];
              pot += allAmt;
              bets[pIdx] += allAmt;
              chips[pIdx] = 0;
              if (bets[pIdx] > lastRaise) lastRaise = bets[pIdx];
              break;
            }
          }

          actionsThisRound++;
          console.log(
            `  ${agents[pIdx].name}: ${decision.action}${decision.raise_amount ? ` ${decision.raise_amount}` : ""} (pot: ${pot}, chips: ${chips[pIdx]})`
          );

          // Check if round is complete
          if (actionsThisRound >= active.filter((v, i) => v && !folded[i] && chips[i] > 0).length) {
            break;
          }
        }
      }

      // Simple showdown: find winner among non-folded
      const activePlayers = active
        .map((v, i) => (v && !folded[i] ? i : -1))
        .filter((i) => i >= 0);

      let winnerIdx = activePlayers[0];
      if (activePlayers.length > 1) {
        // Random winner for now (in real version, uses on-chain hand evaluation)
        winnerIdx = activePlayers[Math.floor(Math.random() * activePlayers.length)];
      }

      chips[winnerIdx] += pot;

      console.log(
        `  Winner: ${agents[winnerIdx].name} wins pot of ${pot} (chips: ${chips.join(", ")})`
      );

      // Check eliminations
      for (let i = 0; i < 5; i++) {
        if (active[i] && chips[i] === 0) {
          active[i] = false;
          console.log(`  ${agents[i].name} ELIMINATED!`);
        }
      }

      results.push({
        hand: handNum,
        winner: agents[winnerIdx].name,
        pot,
        chips: [...chips],
        active: [...active],
      });
    }

    const finalWinner = active.findIndex(Boolean);
    console.log(
      `\n=== TOURNAMENT WINNER: ${agents[finalWinner >= 0 ? finalWinner : 0].name} ===\n`
    );

    res.json({
      hands_played: handNum,
      winner: agents[finalWinner >= 0 ? finalWinner : 0].name,
      winner_idx: finalWinner >= 0 ? finalWinner : 0,
      final_chips: chips,
      history: results,
    });
  } catch (error: any) {
    console.error("Tournament error:", error);
    res.status(500).json({ error: error.message });
  }
});

function shuffleDeck(randomness: Uint8Array): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  let rngIdx = 0;
  for (let i = 51; i > 0; i--) {
    const j = randomness[rngIdx % 32] % (i + 1);
    rngIdx++;
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

app.listen(PORT, () => {
  console.log(`AI Poker Backend running on port ${PORT}`);
  console.log(`Agents: ${agents.map((a) => a.name).join(", ")}`);
  console.log(`RPC: ${RPC_URL}`);
});
