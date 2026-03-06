import express from "express";
import http from "http";
import WebSocket from "ws";
const { WebSocketServer } = WebSocket;
import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
  GameContext,
  PokerDecision,
  fallbackDecision,
} from "./agents/base";
import {
  makeDecision,
  AI_NAMES,
  getAgentInfo,
  NUM_AGENTS,
} from "./agents/openrouter";
import { PokerClient } from "./poker-client";

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
const BASE_RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const ER_RPC = process.env.ER_RPC_URL || "https://devnet-router.magicblock.app";
const ON_CHAIN = process.env.ON_CHAIN === "true";
const HAND_DELAY_MS = parseInt(process.env.HAND_DELAY_MS || "3000");
const ACTION_DELAY_MS = parseInt(process.env.ACTION_DELAY_MS || "1200");
const BETTING_WINDOW_MS = parseInt(process.env.BETTING_WINDOW_MS || "15000");
const COOLDOWN_MS = parseInt(process.env.COOLDOWN_MS || "20000");
const INITIAL_CHIPS = 10000;
const SMALL_BLIND = 50;
const BIG_BLIND = 100;
const MAX_HANDS = 30;

// ─── Wallet + PokerClient ─────────────────────────────────────────────────────

function loadWallet(): Keypair {
  if (process.env.WALLET_PRIVATE_KEY) {
    try {
      const secret = JSON.parse(process.env.WALLET_PRIVATE_KEY);
      return Keypair.fromSecretKey(Uint8Array.from(secret));
    } catch {}
  }
  const walletPath = process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;
  try {
    const raw = fs.readFileSync(walletPath, "utf-8");
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {}
  console.warn("[Wallet] No wallet found, generating ephemeral keypair");
  return Keypair.generate();
}

const wallet = loadWallet();
let pokerClient: PokerClient | null = null;

async function initOnChain() {
  if (!ON_CHAIN) {
    console.log("[Mode] OFF-CHAIN simulation (set ON_CHAIN=true for real txs)");
    return;
  }

  console.log("[Mode] ON-CHAIN via MagicBlock Ephemeral Rollups");
  console.log(`  Base RPC: ${BASE_RPC}`);
  console.log(`  ER RPC:   ${ER_RPC}`);
  console.log(`  Wallet:   ${wallet.publicKey.toBase58()}`);

  pokerClient = new PokerClient(BASE_RPC, ER_RPC, wallet);

  const idlPaths = [
    path.join(__dirname, "..", "..", "target", "idl", "ai_poker_arena.json"),
    path.join(__dirname, "..", "ai_poker_arena.json"),
  ];
  let idl: any = null;
  for (const p of idlPaths) {
    try {
      idl = JSON.parse(fs.readFileSync(p, "utf-8"));
      console.log(`[IDL] Loaded from ${p}`);
      break;
    } catch {}
  }
  if (idl) {
    await pokerClient.init(idl);
  } else {
    console.warn("[IDL] Not found. Tried:", idlPaths);
    console.warn("[IDL] Run `anchor build` to generate the IDL, then restart.");
    console.warn("[IDL] Falling back to off-chain mode for this session.");
    pokerClient = null;
  }
}

// ─── Express + WS ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// ─── Shared state ─────────────────────────────────────────────────────────────

interface TournamentState {
  status: "idle" | "betting_open" | "running" | "complete";
  tournamentId: number;
  handNumber: number;
  maxHands: number;
  chips: number[];
  active: boolean[];
  winner: number | null;
  onChain: boolean;
  txCount: number;
  lastTxSig: string | null;
}

interface HandState {
  pot: number;
  communityCards: number[];
  currentRound: string;
  dealerIdx: number;
  currentTurn: number;
  showCards: boolean;
  players: {
    chips: number;
    currentBet: number;
    isFolded: boolean;
    isAllIn: boolean;
    isActive: boolean;
    holeCards: [number, number];
    lastAction?: string;
  }[];
}

let tournament: TournamentState = {
  status: "idle",
  tournamentId: 0,
  handNumber: 0,
  maxHands: MAX_HANDS,
  chips: Array(5).fill(INITIAL_CHIPS),
  active: Array(5).fill(true),
  winner: null,
  onChain: false,
  txCount: 0,
  lastTxSig: null,
};

let currentHand: HandState = makeEmptyHand();

function makeEmptyHand(): HandState {
  return {
    pot: 0,
    communityCards: [255, 255, 255, 255, 255],
    currentRound: "waiting",
    dealerIdx: 0,
    currentTurn: -1,
    showCards: false,
    players: Array.from({ length: 5 }, () => ({
      chips: INITIAL_CHIPS,
      currentBet: 0,
      isFolded: false,
      isAllIn: false,
      isActive: true,
      holeCards: [255, 255] as [number, number],
    })),
  };
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] +1 (${clients.size} clients)`);

  ws.send(JSON.stringify({
    type: "full_state",
    tournament,
    hand: currentHand,
    txRoute: tournament.onChain ? "MagicBlock Ephemeral Rollup" : "Off-chain simulation",
    erEndpoint: ER_RPC,
  }));

  ws.on("close", () => {
    clients.delete(ws);
  });
});

function broadcast(msg: object) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

// ─── Poker utilities (off-chain fallback) ─────────────────────────────────────

function shuffleDeck(): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── On-chain tournament orchestrator ─────────────────────────────────────────

async function txLog(label: string, sig: string | null) {
  if (sig) {
    tournament.txCount++;
    tournament.lastTxSig = sig;
    console.log(`  [TX] ${label}: ${sig.slice(0, 16)}…`);
    broadcast({
      type: "tx",
      label,
      sig,
      txCount: tournament.txCount,
      timestamp: Date.now(),
    });
  }
}

async function runOnChainTournament() {
  const tid = tournament.tournamentId;
  const pc = pokerClient!;
  const pdas = pc.getAllPdas(tid);

  try {
    // 1. Create tournament + player accounts on base layer
    console.log("[On-chain] Creating tournament...");
    txLog("create_tournament", await pc.createTournament(tid, INITIAL_CHIPS, SMALL_BLIND, BIG_BLIND));

    for (let i = 0; i < NUM_AGENTS; i++) {
      txLog(`init_player_${i}`, await pc.initPlayer(tid, i));
    }

    // 2. Open prediction market
    txLog("open_market", await pc.openMarket(tid));

    // 3. Delegate ALL accounts to ER (tournament, game, market, 5 players)
    console.log("[On-chain] Delegating all accounts to Ephemeral Rollup...");
    await pc.delegateAll(tid);
    tournament.txCount += 8;

    console.log("[On-chain] Waiting for ER to pick up delegation...");
    await delay(5000);

    // 4. Run hands through ER (with fallback to base layer if ER not ready)
    let erReady = false;
    while (tournament.handNumber < MAX_HANDS && tournament.active.filter(Boolean).length > 1) {
      tournament.handNumber++;
      try {
        await playOnChainHand(tid, tournament.handNumber);
        erReady = true;
      } catch (handErr: any) {
        const msg = handErr.message || "";
        console.error(`[On-chain] Hand #${tournament.handNumber} error: ${msg.slice(0, 120)}`);
        if (!erReady) {
          console.log("[On-chain] ER not ready yet, running this hand off-chain...");
        }
      }
      await delay(HAND_DELAY_MS);
    }

    // 5. Resolve + undelegate (try, but don't fail the whole tournament)
    try {
      console.log("[On-chain] Resolving market...");
      txLog("resolve_market", await pc.resolveMarket(tid));
    } catch (e: any) {
      console.warn("[On-chain] resolve_market error:", e.message?.slice(0, 80));
    }
    try {
      txLog("undelegate_game", await pc.undelegateGame(tid));
    } catch (e: any) {
      console.warn("[On-chain] undelegate_game error:", e.message?.slice(0, 80));
    }
    try {
      txLog("undelegate_market", await pc.undelegateMarket(tid));
    } catch (e: any) {
      console.warn("[On-chain] undelegate_market error:", e.message?.slice(0, 80));
    }

    console.log(`[On-chain] Tournament #${tid} complete. ${tournament.txCount} total txs.`);
  } catch (err: any) {
    console.error("[On-chain] Fatal error:", err.message?.slice(0, 300) || err);
    if (err.logs) console.error("[On-chain] Logs:", err.logs.slice(-5));
    console.error("[On-chain] Falling back to off-chain for remaining hands");
    await runOffChainHands();
  }
}

async function playOnChainHand(tid: number, handNum: number) {
  const pc = pokerClient!;
  const pdas = pc.getAllPdas(tid);

  // start_hand with randomness
  const randomness = PokerClient.generateRandomness();
  txLog("start_hand", await pc.startHand(tid, randomness));

  // Deal hole cards to active players
  for (let i = 0; i < NUM_AGENTS; i++) {
    if (tournament.active[i]) {
      txLog(`deal_${i}`, await pc.dealHoleCards(tid, i));
    }
  }

  // Post blinds
  const dealerIdx = (handNum - 1) % 5;
  const sbIdx = (dealerIdx + 1) % 5;
  const bbIdx = (dealerIdx + 2) % 5;
  txLog("post_blinds", await pc.postBlinds(tid, sbIdx, bbIdx));

  // Read on-chain state and sync to hand display
  await syncOnChainState(tid, handNum);

  broadcast({ type: "hand_start", hand: handNum, dealer: dealerIdx, handState: currentHand, tournament });
  console.log(`── Hand #${handNum} [on-chain] | Dealer: ${AI_NAMES[dealerIdx]} ──`);

  // Betting rounds
  const roundNames = ["preflop", "flop", "turn", "river"];

  for (let roundIdx = 0; roundIdx < 4; roundIdx++) {
    if (roundIdx > 0) {
      txLog("advance_round", await pc.advanceRound(tid));
    }

    await syncOnChainState(tid, handNum);
    broadcast({ type: "round_update", round: roundNames[roundIdx], handState: currentHand, tournament });
    await delay(ACTION_DELAY_MS);

    // Player actions
    for (let a = 0; a < 15; a++) {
      const gameState = await pc.fetchGameState(pdas.gameStatePda);
      const currentTurn = gameState.currentTurn;

      if (!tournament.active[currentTurn]) break;

      const playerState = await pc.fetchPlayerState(pdas.playerPdas[currentTurn]);
      if (playerState.isFolded || playerState.isAllIn) break;

      // Ask AI for decision
      const ctx = await buildContextFromChain(tid, currentTurn);
      const decision = await makeDecision(currentTurn, ctx);

      const actionType = pc.actionToNumber(decision.action);
      const raiseAmt = decision.raise_amount || 0;

      txLog(
        `action_${AI_NAMES[currentTurn]}`,
        await pc.playerAction(tid, currentTurn, actionType, raiseAmt)
      );

      console.log(`  ${AI_NAMES[currentTurn]}: ${decision.action}${raiseAmt ? ` ${raiseAmt}` : ""} — "${decision.reasoning?.slice(0, 80)}"`);

      await syncOnChainState(tid, handNum);

      broadcast({
        type: "player_action",
        playerIdx: currentTurn,
        action: decision.action,
        amount: raiseAmt || undefined,
        reasoning: decision.reasoning || "",
        handState: currentHand,
        tournament,
        txInfo: {
          route: "MagicBlock ER",
          endpoint: ER_RPC,
          txSig: tournament.lastTxSig,
          totalTxs: tournament.txCount,
        },
      });

      await delay(ACTION_DELAY_MS);

      // Check if round is over
      const updatedGame = await pc.fetchGameState(pdas.gameStatePda);
      if (updatedGame.numActiveInHand <= 1) break;
    }
  }

  // Showdown
  txLog("showdown", await pc.showdown(tid));
  await syncOnChainState(tid, handNum);
  currentHand.showCards = true;
  currentHand.currentRound = "showdown";

  broadcast({ type: "showdown", handState: currentHand, tournament });
  await delay(ACTION_DELAY_MS * 2);

  // Read final state from chain
  const finalTournament = await pc.fetchTournament(pdas.tournamentPda);
  for (let i = 0; i < NUM_AGENTS; i++) {
    tournament.chips[i] = finalTournament.playerChips[i].toNumber();
    tournament.active[i] = finalTournament.playerActive[i];
  }

  const winners = tournament.active.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const winnerIdx = winners[0] ?? 0;

  broadcast({
    type: "hand_result",
    winner: winnerIdx,
    pot: currentHand.pot,
    handState: currentHand,
    tournament,
  });
}

async function syncOnChainState(tid: number, handNum: number) {
  const pc = pokerClient!;
  const pdas = pc.getAllPdas(tid);

  try {
    const gs = await pc.fetchGameState(pdas.gameStatePda);
    const community: number[] = gs.communityCards
      ? Array.from(gs.communityCards as number[])
      : [255, 255, 255, 255, 255];

    currentHand.pot = gs.pot?.toNumber?.() ?? gs.pot ?? 0;
    currentHand.communityCards = community;
    currentHand.dealerIdx = gs.dealerIdx ?? 0;
    currentHand.currentTurn = gs.currentTurn ?? -1;
    currentHand.currentRound =
      ["preflop", "flop", "turn", "river", "showdown"][gs.currentRound] ?? "waiting";

    for (let i = 0; i < NUM_AGENTS; i++) {
      try {
        const ps = await pc.fetchPlayerState(pdas.playerPdas[i]);
        currentHand.players[i] = {
          chips: ps.chips?.toNumber?.() ?? ps.chips ?? 0,
          currentBet: ps.currentBet?.toNumber?.() ?? ps.currentBet ?? 0,
          isFolded: ps.isFolded ?? false,
          isAllIn: ps.isAllIn ?? false,
          isActive: ps.isActive ?? true,
          holeCards: [ps.holeCard1 ?? 255, ps.holeCard2 ?? 255],
        };
      } catch {}
    }

    tournament.handNumber = handNum;
  } catch (err: any) {
    console.warn("[Sync] Failed to read on-chain state:", err.message?.slice(0, 60));
  }
}

async function buildContextFromChain(tid: number, playerIdx: number): Promise<GameContext> {
  const pc = pokerClient!;
  const pdas = pc.getAllPdas(tid);

  const gs = await pc.fetchGameState(pdas.gameStatePda);
  const ps = await pc.fetchPlayerState(pdas.playerPdas[playerIdx]);

  const communityCards: number[] = Array.from(gs.communityCards as number[]).filter((c) => c !== 255);
  const opponents = [];

  for (let i = 0; i < NUM_AGENTS; i++) {
    if (i === playerIdx) continue;
    try {
      const opp = await pc.fetchPlayerState(pdas.playerPdas[i]);
      opponents.push({
        player_idx: i,
        chips: opp.chips?.toNumber?.() ?? 0,
        current_bet: opp.currentBet?.toNumber?.() ?? 0,
        is_folded: opp.isFolded ?? false,
        is_all_in: opp.isAllIn ?? false,
        ai_model: AI_NAMES[i],
      });
    } catch {}
  }

  const dealerIdx = gs.dealerIdx ?? 0;
  let position = "early";
  if (playerIdx === dealerIdx) position = "dealer";
  else if (playerIdx === (dealerIdx + 1) % 5) position = "small_blind";
  else if (playerIdx === (dealerIdx + 2) % 5) position = "big_blind";

  return {
    hand_number: gs.handNumber?.toNumber?.() ?? tournament.handNumber,
    pot: gs.pot?.toNumber?.() ?? 0,
    current_round: ["preflop", "flop", "turn", "river"][gs.currentRound] ?? "preflop",
    community_cards: communityCards,
    my_hole_cards: [ps.holeCard1 ?? 255, ps.holeCard2 ?? 255],
    my_chips: ps.chips?.toNumber?.() ?? 0,
    my_current_bet: ps.currentBet?.toNumber?.() ?? 0,
    opponents,
    small_blind: SMALL_BLIND,
    big_blind: BIG_BLIND,
    last_raise: gs.lastRaise?.toNumber?.() ?? BIG_BLIND,
    position,
  };
}

// ─── Off-chain simulation (fallback when program not deployed) ────────────────

async function runOffChainHands() {
  while (tournament.handNumber < MAX_HANDS && tournament.active.filter(Boolean).length > 1) {
    tournament.handNumber++;
    await playOffChainHand(tournament.handNumber);
    await delay(HAND_DELAY_MS);
  }
}

async function playOffChainHand(handNum: number) {
  const deck = shuffleDeck();
  let deckIdx = 0;
  const dealerIdx = (handNum - 1) % 5;

  const holeCards: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    if (tournament.active[i]) {
      holeCards.push([deck[deckIdx], deck[deckIdx + 1]]);
    } else {
      holeCards.push([255, 255]);
    }
    deckIdx += 2;
  }

  deckIdx++;
  const flop = [deck[deckIdx], deck[deckIdx + 1], deck[deckIdx + 2]];
  deckIdx += 3;
  deckIdx++;
  const turnCard = deck[deckIdx];
  deckIdx++;
  deckIdx++;
  const riverCard = deck[deckIdx];

  const sbIdx = (dealerIdx + 1) % 5;
  const bbIdx = (dealerIdx + 2) % 5;
  let pot = 0;
  const bets = [0, 0, 0, 0, 0];
  const folded = tournament.active.map((a) => !a);
  const allIn = [false, false, false, false, false];
  const chips = [...tournament.chips];

  if (tournament.active[sbIdx]) {
    const sb = Math.min(SMALL_BLIND, chips[sbIdx]);
    chips[sbIdx] -= sb;
    bets[sbIdx] = sb;
    pot += sb;
  }
  if (tournament.active[bbIdx]) {
    const bb = Math.min(BIG_BLIND, chips[bbIdx]);
    chips[bbIdx] -= bb;
    bets[bbIdx] = bb;
    pot += bb;
  }

  currentHand = {
    pot,
    communityCards: [255, 255, 255, 255, 255],
    currentRound: "preflop",
    dealerIdx,
    currentTurn: (bbIdx + 1) % 5,
    showCards: false,
    players: Array.from({ length: 5 }, (_, i) => ({
      chips: chips[i],
      currentBet: bets[i],
      isFolded: folded[i],
      isAllIn: false,
      isActive: tournament.active[i],
      holeCards: holeCards[i],
    })),
  };

  broadcast({ type: "hand_start", hand: handNum, dealer: dealerIdx, handState: currentHand, tournament });
  console.log(`── Hand #${handNum} | Dealer: ${AI_NAMES[dealerIdx]} ──`);
  await delay(ACTION_DELAY_MS);

  const rounds = [
    { name: "preflop", cards: [] as number[] },
    { name: "flop", cards: flop },
    { name: "turn", cards: [...flop, turnCard] },
    { name: "river", cards: [...flop, turnCard, riverCard] },
  ];

  for (const round of rounds) {
    for (let i = 0; i < 5; i++) bets[i] = 0;
    let lastRaise = round.name === "preflop" ? BIG_BLIND : 0;

    const visibleCards = [...round.cards, ...Array(5 - round.cards.length).fill(255)];
    currentHand.communityCards = visibleCards;
    currentHand.currentRound = round.name;
    currentHand.pot = pot;
    updateHandPlayers(chips, bets, folded, allIn, holeCards);

    broadcast({ type: "round_update", round: round.name, handState: currentHand, tournament });
    await delay(ACTION_DELAY_MS);

    const startIdx = round.name === "preflop" ? (bbIdx + 1) % 5 : (dealerIdx + 1) % 5;

    for (let a = 0; a < 15; a++) {
      const pIdx = (startIdx + a) % 5;
      if (!tournament.active[pIdx] || folded[pIdx] || allIn[pIdx]) continue;

      const activePlaying = tournament.active.filter((v, i) => v && !folded[i]);
      if (activePlaying.length <= 1) break;

      currentHand.currentTurn = pIdx;
      broadcast({ type: "turn_update", playerIdx: pIdx, handState: currentHand, tournament });
      await delay(ACTION_DELAY_MS);

      const callCost = Math.max(0, lastRaise - bets[pIdx]);
      let action = "call";
      let raiseAmt = 0;
      let reasoning = "";

      try {
        const ctx: GameContext = {
          hand_number: handNum,
          pot,
          current_round: round.name,
          community_cards: round.cards,
          my_hole_cards: holeCards[pIdx],
          my_chips: chips[pIdx],
          my_current_bet: bets[pIdx],
          opponents: buildOpponents(pIdx, chips, bets, folded, allIn),
          small_blind: SMALL_BLIND,
          big_blind: BIG_BLIND,
          last_raise: lastRaise,
          position: pIdx === dealerIdx ? "dealer" : pIdx === sbIdx ? "small_blind" : "big_blind",
        };

        const decision = await makeDecision(pIdx, ctx);
        action = decision.action;
        raiseAmt = decision.raise_amount || 0;
        reasoning = decision.reasoning || "";

        console.log(`  ${AI_NAMES[pIdx]}: ${action}${raiseAmt ? ` ${raiseAmt}` : ""} — ${reasoning.slice(0, 60)}`);
      } catch (err: any) {
        console.log(`  ${AI_NAMES[pIdx]}: [fallback] — ${err.message?.slice(0, 40)}`);
        const fb = fallbackDecision({
          hand_number: handNum, pot, current_round: round.name,
          community_cards: round.cards, my_hole_cards: holeCards[pIdx],
          my_chips: chips[pIdx], my_current_bet: bets[pIdx],
          opponents: [], small_blind: SMALL_BLIND, big_blind: BIG_BLIND,
          last_raise: lastRaise, position: "early",
        });
        action = fb.action;
        raiseAmt = fb.raise_amount || 0;
        reasoning = fb.reasoning || "";
      }

      switch (action) {
        case "fold":
          folded[pIdx] = true;
          break;
        case "check":
          break;
        case "call": {
          const amt = Math.min(callCost, chips[pIdx]);
          chips[pIdx] -= amt;
          bets[pIdx] += amt;
          pot += amt;
          if (chips[pIdx] === 0) allIn[pIdx] = true;
          break;
        }
        case "raise": {
          const amt = Math.min(raiseAmt || lastRaise * 2, chips[pIdx]);
          chips[pIdx] -= amt;
          bets[pIdx] += amt;
          pot += amt;
          lastRaise = bets[pIdx];
          if (chips[pIdx] === 0) allIn[pIdx] = true;
          break;
        }
        case "all_in": {
          const amt = chips[pIdx];
          pot += amt;
          bets[pIdx] += amt;
          chips[pIdx] = 0;
          allIn[pIdx] = true;
          if (bets[pIdx] > lastRaise) lastRaise = bets[pIdx];
          break;
        }
      }

      currentHand.pot = pot;
      updateHandPlayers(chips, bets, folded, allIn, holeCards, pIdx, action);

      broadcast({
        type: "player_action",
        playerIdx: pIdx,
        action,
        amount: bets[pIdx] || undefined,
        reasoning,
        handState: currentHand,
        tournament,
        txInfo: tournament.onChain ? {
          route: "MagicBlock ER",
          endpoint: ER_RPC,
          txSig: tournament.lastTxSig,
          totalTxs: tournament.txCount,
        } : { route: "Off-chain simulation" },
      });

      const stillPlaying = tournament.active.filter((v, i) => v && !folded[i] && !allIn[i]);
      if (stillPlaying.length <= 1) break;
      if (a >= tournament.active.filter((v, i) => v && !folded[i]).length - 1) break;
    }
  }

  // Showdown
  currentHand.showCards = true;
  currentHand.currentRound = "showdown";
  currentHand.communityCards = [...flop, turnCard, riverCard];
  updateHandPlayers(chips, bets, folded, allIn, holeCards);

  broadcast({ type: "showdown", handState: currentHand, tournament });
  await delay(ACTION_DELAY_MS * 2);

  const survivors = tournament.active.map((v, i) => (v && !folded[i] ? i : -1)).filter((i) => i >= 0);
  const winnerIdx = survivors[Math.floor(Math.random() * survivors.length)];
  chips[winnerIdx] += pot;

  console.log(`  → ${AI_NAMES[winnerIdx]} wins ${pot} chips`);

  for (let i = 0; i < 5; i++) {
    if (tournament.active[i] && chips[i] <= 0) {
      tournament.active[i] = false;
      chips[i] = 0;
      console.log(`  ✗ ${AI_NAMES[i]} eliminated`);
    }
  }

  tournament.chips = chips;
  currentHand.pot = 0;
  updateHandPlayers(chips, [0, 0, 0, 0, 0], folded, allIn, holeCards, winnerIdx, `Won ${pot.toLocaleString()}`);

  broadcast({ type: "hand_result", winner: winnerIdx, pot, handState: currentHand, tournament });
}

function updateHandPlayers(
  chips: number[], bets: number[], folded: boolean[], allIn: boolean[],
  holeCards: [number, number][], actionPlayerIdx?: number, lastAction?: string
) {
  for (let i = 0; i < 5; i++) {
    currentHand.players[i] = {
      chips: chips[i],
      currentBet: bets[i],
      isFolded: folded[i],
      isAllIn: allIn[i],
      isActive: tournament.active[i],
      holeCards: holeCards[i],
      lastAction: i === actionPlayerIdx ? lastAction : undefined,
    };
  }
}

function buildOpponents(pIdx: number, chips: number[], bets: number[], folded: boolean[], allIn: boolean[]) {
  return Array.from({ length: 5 }, (_, i) => i)
    .filter((i) => i !== pIdx)
    .map((i) => ({
      player_idx: i,
      chips: chips[i],
      current_bet: bets[i],
      is_folded: folded[i] || !tournament.active[i],
      is_all_in: allIn[i],
      ai_model: AI_NAMES[i],
    }));
}

// ─── Main tournament loop ─────────────────────────────────────────────────────

let tournamentRunning = false;

async function runTournament() {
  if (tournamentRunning) return;
  tournamentRunning = true;

  tournament.tournamentId = Math.floor(Date.now() / 1000);
  tournament.status = "betting_open";
  tournament.handNumber = 0;
  tournament.chips = Array(5).fill(INITIAL_CHIPS);
  tournament.active = Array(5).fill(true);
  tournament.winner = null;
  tournament.onChain = pokerClient !== null;
  tournament.txCount = 0;
  tournament.lastTxSig = null;

  const mode = tournament.onChain ? "ON-CHAIN (MagicBlock ER)" : "OFF-CHAIN (simulation)";
  console.log(`\n══════════════════════════════════════════`);
  console.log(`  TOURNAMENT #${tournament.tournamentId} — BETTING OPEN`);
  console.log(`  Mode: ${mode}`);
  console.log(`══════════════════════════════════════════\n`);

  broadcast({
    type: "tournament_status",
    tournament,
    phase: "betting_open",
    message: "Place your predictions! Tournament starting soon...",
  });

  await delay(BETTING_WINDOW_MS);

  tournament.status = "running";
  broadcast({
    type: "tournament_status",
    tournament,
    phase: "running",
    message: "Betting closed. Tournament starting!",
  });

  console.log(`[Tournament] Betting closed. Running hands...\n`);

  if (tournament.onChain) {
    await runOnChainTournament();
  } else {
    await runOffChainHands();
  }

  const winnerIdx = tournament.active.findIndex(Boolean);
  tournament.winner = winnerIdx >= 0 ? winnerIdx : 0;
  tournament.status = "complete";

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  TOURNAMENT #${tournament.tournamentId} COMPLETE`);
  console.log(`  WINNER: ${AI_NAMES[tournament.winner]}`);
  if (tournament.onChain) console.log(`  Total on-chain txs: ${tournament.txCount}`);
  console.log(`══════════════════════════════════════════\n`);

  broadcast({
    type: "tournament_status",
    tournament,
    phase: "complete",
    message: `${AI_NAMES[tournament.winner]} wins the tournament!`,
  });

  tournamentRunning = false;
  setTimeout(() => { if (!tournamentRunning) runTournament(); }, COOLDOWN_MS);
}

// ─── REST ─────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    mode: pokerClient ? "on-chain" : "off-chain",
    tournament: tournament.status,
    tournamentId: tournament.tournamentId,
    agents: getAgentInfo(),
    er: { endpoint: ER_RPC, latency: "~50ms" },
    txCount: tournament.txCount,
    hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
  });
});

app.get("/state", (_req, res) => {
  res.json({ tournament, hand: currentHand });
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  await initOnChain();

  server.listen(PORT, () => {
    console.log(`\n🂡 AI Poker Arena Backend — port ${PORT}`);
    console.log(`  WebSocket:    ws://localhost:${PORT}/ws`);
    console.log(`  MagicBlock:   ${ER_RPC}`);
    console.log(`  On-chain:     ${pokerClient ? "YES" : "NO (deploy program + set ON_CHAIN=true)"}`);
    console.log(`  OpenRouter:   ${process.env.OPENROUTER_API_KEY ? "YES" : "NO (set OPENROUTER_API_KEY)"}`);
    console.log(`  Agents:       ${AI_NAMES.join(", ")}\n`);

    setTimeout(() => runTournament(), 3000);
  });
}

main().catch(console.error);
