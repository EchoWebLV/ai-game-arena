"use client";

import { useState, useCallback } from "react";
import PokerTable from "@/components/PokerTable";
import PredictionMarket from "@/components/PredictionMarket";
import TournamentLog, { LogEntry } from "@/components/TournamentLog";
import { AI_PLAYERS, BACKEND_URL } from "@/lib/constants";
import { Play, RotateCcw, Zap, Shield, Dice5, Layers } from "lucide-react";
import clsx from "clsx";

interface PlayerData {
  chips: number;
  currentBet: number;
  isFolded: boolean;
  isAllIn: boolean;
  isActive: boolean;
  holeCards: [number, number];
  lastAction?: string;
}

interface TableData {
  pot: number;
  communityCards: number[];
  currentRound: string;
  dealerIdx: number;
  currentTurn: number;
  handNumber: number;
  showCards: boolean;
}

const INITIAL_CHIPS = 10000;
const SMALL_BLIND = 50;
const BIG_BLIND = 100;

function shuffleDeck(): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export default function Home() {
  const [players, setPlayers] = useState<PlayerData[]>(
    AI_PLAYERS.map(() => ({
      chips: INITIAL_CHIPS,
      currentBet: 0,
      isFolded: false,
      isAllIn: false,
      isActive: true,
      holeCards: [255, 255] as [number, number],
    }))
  );

  const [table, setTable] = useState<TableData>({
    pot: 0,
    communityCards: [255, 255, 255, 255, 255],
    currentRound: "waiting",
    dealerIdx: 0,
    currentTurn: 0,
    handNumber: 0,
    showCards: false,
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [tournamentResult, setTournamentResult] = useState<any>(null);
  const [speed, setSpeed] = useState(1200);

  const [market, setMarket] = useState({
    totalPool: 0,
    betsPerAi: [0, 0, 0, 0, 0],
    isOpen: true,
    isResolved: false,
    winningAi: null as number | null,
  });
  const [userBets, setUserBets] = useState<{ aiIdx: number; amount: number }[]>([]);

  const addLog = useCallback(
    (hand: number, round: string, playerIdx: number, action: string, amount: number | undefined, pot: number) => {
      setLogs((prev) => [...prev, { hand, round, playerIdx, action, amount, pot, timestamp: Date.now() }]);
    },
    []
  );

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const resetTournament = () => {
    setPlayers(AI_PLAYERS.map(() => ({
      chips: INITIAL_CHIPS, currentBet: 0, isFolded: false, isAllIn: false,
      isActive: true, holeCards: [255, 255] as [number, number],
    })));
    setTable({ pot: 0, communityCards: [255,255,255,255,255], currentRound: "waiting", dealerIdx: 0, currentTurn: 0, handNumber: 0, showCards: false });
    setLogs([]);
    setTournamentResult(null);
    setMarket({ totalPool: 0, betsPerAi: [0,0,0,0,0], isOpen: true, isResolved: false, winningAi: null });
    setUserBets([]);
  };

  const runTournament = useCallback(async () => {
    setIsRunning(true);
    setLogs([]);
    setTournamentResult(null);
    setMarket((m) => ({ ...m, isOpen: false }));

    const chipState = Array(5).fill(INITIAL_CHIPS);
    const activeState = Array(5).fill(true);
    let handNum = 0;
    const maxHands = 30;

    while (handNum < maxHands && activeState.filter(Boolean).length > 1) {
      handNum++;
      const dealerIdx = (handNum - 1) % 5;
      const deck = shuffleDeck();
      let deckIdx = 0;

      const holeCards: [number, number][] = [];
      for (let i = 0; i < 5; i++) {
        holeCards.push(activeState[i] ? [deck[deckIdx], deck[deckIdx + 1]] : [255, 255]);
        deckIdx += 2;
      }

      deckIdx++;
      const flop = [deck[deckIdx], deck[deckIdx + 1], deck[deckIdx + 2]];
      deckIdx += 3; deckIdx++;
      const turn = deck[deckIdx]; deckIdx++; deckIdx++;
      const river = deck[deckIdx];

      const sbIdx = (dealerIdx + 1) % 5;
      const bbIdx = (dealerIdx + 2) % 5;
      let pot = 0;
      const bets = [0, 0, 0, 0, 0];
      const folded = activeState.map((a: boolean) => !a);
      const allIn = [false, false, false, false, false];

      if (activeState[sbIdx]) { const sb = Math.min(SMALL_BLIND, chipState[sbIdx]); chipState[sbIdx] -= sb; bets[sbIdx] = sb; pot += sb; }
      if (activeState[bbIdx]) { const bb = Math.min(BIG_BLIND, chipState[bbIdx]); chipState[bbIdx] -= bb; bets[bbIdx] = bb; pot += bb; }

      setTable({ pot, communityCards: [255,255,255,255,255], currentRound: "preflop", dealerIdx, currentTurn: (bbIdx + 1) % 5, handNumber: handNum, showCards: false });
      setPlayers(AI_PLAYERS.map((_, i) => ({ chips: chipState[i], currentBet: bets[i], isFolded: folded[i], isAllIn: false, isActive: activeState[i], holeCards: holeCards[i], lastAction: undefined })));
      await delay(speed * 0.6);

      const rounds = [
        { name: "preflop", cards: [] as number[] },
        { name: "flop", cards: flop },
        { name: "turn", cards: [...flop, turn] },
        { name: "river", cards: [...flop, turn, river] },
      ];

      for (const round of rounds) {
        let lastRaise = round.name === "preflop" ? BIG_BLIND : 0;
        for (let i = 0; i < 5; i++) bets[i] = 0;
        const visibleCards = [...round.cards, ...Array(5 - round.cards.length).fill(255)];
        setTable((t) => ({ ...t, communityCards: visibleCards, currentRound: round.name, pot }));
        await delay(speed * 0.4);

        const startIdx = round.name === "preflop" ? (bbIdx + 1) % 5 : (dealerIdx + 1) % 5;
        for (let a = 0; a < 15; a++) {
          const pIdx = (startIdx + a) % 5;
          if (!activeState[pIdx] || folded[pIdx] || allIn[pIdx]) continue;
          if (activeState.filter((v: boolean, i: number) => v && !folded[i]).length <= 1) break;

          setTable((t) => ({ ...t, currentTurn: pIdx }));
          await delay(speed * 0.5);

          let action = "call";
          let raiseAmt = 0;
          const callCost = Math.max(0, lastRaise - bets[pIdx]);

          try {
            const resp = await fetch(`${BACKEND_URL}/decide/${pIdx}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                hand_number: handNum, pot, current_round: round.name,
                community_cards: round.cards, my_hole_cards: holeCards[pIdx],
                my_chips: chipState[pIdx], my_current_bet: bets[pIdx],
                opponents: AI_PLAYERS.filter((_, i) => i !== pIdx).map((_, i) => {
                  const idx = i >= pIdx ? i + 1 : i;
                  return { player_idx: idx, chips: chipState[idx], current_bet: bets[idx], is_folded: folded[idx], is_all_in: allIn[idx], ai_model: AI_PLAYERS[idx].name };
                }),
                small_blind: SMALL_BLIND, big_blind: BIG_BLIND, last_raise: lastRaise,
                position: pIdx === dealerIdx ? "dealer" : pIdx === sbIdx ? "small_blind" : "big_blind",
              }),
            });
            const data = await resp.json();
            action = data.decision?.action || "call";
            raiseAmt = data.decision?.raise_amount || 0;
          } catch {
            const r = Math.random();
            if (r < 0.12) action = "fold";
            else if (r < 0.45 && callCost === 0) action = "check";
            else if (r < 0.78) action = "call";
            else { action = "raise"; raiseAmt = lastRaise * 2; }
          }

          switch (action) {
            case "fold": folded[pIdx] = true; break;
            case "check": break;
            case "call": { const amt = Math.min(callCost, chipState[pIdx]); chipState[pIdx] -= amt; bets[pIdx] += amt; pot += amt; if (chipState[pIdx] === 0) allIn[pIdx] = true; break; }
            case "raise": { const amt = Math.min(raiseAmt || lastRaise * 2, chipState[pIdx]); chipState[pIdx] -= amt; bets[pIdx] += amt; pot += amt; lastRaise = bets[pIdx]; if (chipState[pIdx] === 0) allIn[pIdx] = true; break; }
            case "all_in": { const amt = chipState[pIdx]; pot += amt; bets[pIdx] += amt; chipState[pIdx] = 0; allIn[pIdx] = true; if (bets[pIdx] > lastRaise) lastRaise = bets[pIdx]; break; }
          }

          addLog(handNum, round.name, pIdx, action, bets[pIdx] || undefined, pot);
          setPlayers(AI_PLAYERS.map((_, i) => ({ chips: chipState[i], currentBet: bets[i], isFolded: folded[i], isAllIn: allIn[i], isActive: activeState[i], holeCards: holeCards[i], lastAction: i === pIdx ? action : undefined })));
          setTable((t) => ({ ...t, pot }));

          if (activeState.filter((v: boolean, i: number) => v && !folded[i] && !allIn[i]).length <= 1) break;
          if (a >= activeState.filter((v: boolean, i: number) => v && !folded[i]).length - 1) break;
        }
      }

      setTable((t) => ({ ...t, showCards: true, currentRound: "showdown" }));
      await delay(speed * 0.8);

      const survivors = activeState.map((v: boolean, i: number) => (v && !folded[i] ? i : -1)).filter((i: number) => i >= 0);
      const winnerIdx = survivors[Math.floor(Math.random() * survivors.length)];
      chipState[winnerIdx] += pot;
      addLog(handNum, "showdown", winnerIdx, `WINS ${pot.toLocaleString()}`, pot, 0);

      for (let i = 0; i < 5; i++) {
        if (activeState[i] && chipState[i] <= 0) {
          activeState[i] = false; chipState[i] = 0;
          addLog(handNum, "showdown", i, "ELIMINATED", undefined, 0);
        }
      }

      setPlayers(AI_PLAYERS.map((_, i) => ({ chips: chipState[i], currentBet: 0, isFolded: false, isAllIn: false, isActive: activeState[i], holeCards: holeCards[i], lastAction: i === winnerIdx ? `Won ${pot.toLocaleString()}` : undefined })));
      await delay(speed * 1.2);
    }

    const winnerIdx = activeState.findIndex(Boolean);
    const winner = winnerIdx >= 0 ? AI_PLAYERS[winnerIdx] : AI_PLAYERS[0];
    setTournamentResult({ winner: winner.name, winnerIdx: winnerIdx >= 0 ? winnerIdx : 0, hands: handNum, chips: [...chipState] });
    setMarket((m) => ({ ...m, isResolved: true, winningAi: winnerIdx >= 0 ? winnerIdx : 0 }));
    setIsRunning(false);
  }, [speed, addLog]);

  const handlePlaceBet = (aiIdx: number, amount: number) => {
    setUserBets((prev) => [...prev, { aiIdx, amount }]);
    setMarket((m) => ({
      ...m,
      totalPool: m.totalPool + amount * 1e9,
      betsPerAi: m.betsPerAi.map((b, i) => (i === aiIdx ? b + amount * 1e9 : b)),
    }));
  };

  const chipStandings = AI_PLAYERS.map((ai) => ({
    idx: ai.idx,
    chips: players[ai.idx].chips,
    active: players[ai.idx].isActive,
  })).sort((a, b) => b.chips - a.chips);

  return (
    <main className="min-h-screen">
      {/* Top navigation bar */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[var(--bg-primary)]/90 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🂡</span>
            <span className="text-base font-bold tracking-tight text-[var(--text-primary)]">
              AI Poker Arena
            </span>
            <span className="hidden sm:inline text-[10px] text-[var(--text-muted)] border border-white/[0.08] rounded px-1.5 py-0.5">
              DEVNET
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <Zap size={10} className="text-[var(--gold)]" />
              <span>Ephemeral Rollups</span>
              <span className="mx-1 text-white/10">|</span>
              <Shield size={10} className="text-blue-400" />
              <span>Private ER</span>
              <span className="mx-1 text-white/10">|</span>
              <Dice5 size={10} className="text-green-400" />
              <span>VRF</span>
              <span className="mx-1 text-white/10">|</span>
              <Layers size={10} className="text-purple-400" />
              <span>BOLT ECS</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-6">
        {/* Hero: Tournament Winner Banner */}
        {tournamentResult && (
          <div className="mb-6 p-5 rounded-2xl bg-gradient-to-r from-[var(--gold)]/[0.08] via-[var(--gold)]/[0.04] to-transparent border border-[var(--gold)]/20 flex items-center gap-4 animate-slide-up">
            <div className="text-4xl">{AI_PLAYERS[tournamentResult.winnerIdx].avatar}</div>
            <div>
              <div className="text-sm text-[var(--gold)] font-medium">Tournament Champion</div>
              <div className="text-xl font-bold text-[var(--text-primary)]">{tournamentResult.winner}</div>
              <div className="text-xs text-[var(--text-muted)]">{tournamentResult.hands} hands played</div>
            </div>
            <button
              onClick={resetTournament}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-white/[0.08] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-all"
            >
              <RotateCcw size={14} />
              New Tournament
            </button>
          </div>
        )}

        {/* Main 3-column layout: Prediction Market (center), Table + Log (sides) */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px_1fr] gap-5">
          {/* Left: Poker Table */}
          <div className="space-y-4 order-2 xl:order-1">
            <div className="bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] p-4 overflow-hidden">
              <PokerTable players={players} table={table} />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={isRunning ? undefined : tournamentResult ? resetTournament : runTournament}
                disabled={isRunning}
                className={clsx(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all",
                  isRunning
                    ? "bg-white/[0.04] text-[var(--text-muted)] cursor-wait"
                    : "bg-gradient-to-r from-[var(--crimson)] to-[var(--crimson-dark)] text-white hover:brightness-110 shadow-lg shadow-[var(--crimson)]/20"
                )}
              >
                {isRunning ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Running...
                  </>
                ) : tournamentResult ? (
                  <>
                    <RotateCcw size={15} />
                    New Tournament
                  </>
                ) : (
                  <>
                    <Play size={15} />
                    Start Tournament
                  </>
                )}
              </button>
              <div className="flex items-center gap-2 bg-[var(--bg-card)] rounded-xl border border-white/[0.04] px-3 py-2">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Speed</span>
                <input
                  type="range"
                  min={200}
                  max={2500}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-20 accent-[var(--crimson)]"
                />
                <span className="text-[11px] font-mono text-[var(--text-secondary)] w-8">
                  {(speed / 1000).toFixed(1)}s
                </span>
              </div>
            </div>
          </div>

          {/* Center: Prediction Market (THE CENTERPIECE) */}
          <div className="order-1 xl:order-2">
            <div className="bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] p-5 xl:sticky xl:top-20">
              <PredictionMarket
                market={market}
                onPlaceBet={handlePlaceBet}
                userBets={userBets}
                chipStandings={chipStandings}
              />
            </div>
          </div>

          {/* Right: Live Feed + Standings */}
          <div className="space-y-4 order-3">
            {/* Live feed */}
            <div className="bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] p-4 h-[340px]">
              <TournamentLog logs={logs} currentHand={table.handNumber} />
            </div>

            {/* Chip standings */}
            <div className="bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                Chip Standings
              </h3>
              <div className="space-y-2.5">
                {chipStandings.map((s, rank) => {
                  const ai = AI_PLAYERS[s.idx];
                  const pct = (s.chips / (INITIAL_CHIPS * 5)) * 100;
                  return (
                    <div key={s.idx} className={clsx("flex items-center gap-2.5", !s.active && "opacity-25")}>
                      <span className="text-[11px] font-mono text-[var(--text-muted)] w-3 text-right">
                        {rank + 1}
                      </span>
                      <span className="text-base">{ai.avatar}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium mb-0.5" style={{ color: ai.color }}>
                          {ai.shortName}
                        </div>
                        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${Math.min(100, pct)}%`, background: ai.color }}
                          />
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-[var(--text-secondary)] tabular-nums w-14 text-right">
                        {s.chips.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* MagicBlock badges */}
            <div className="bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] p-4">
              <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-2">
                Powered By
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Ephemeral Rollups", icon: <Zap size={9} /> , color: "var(--gold)" },
                  { label: "Private ER (TEE)", icon: <Shield size={9} />, color: "#60a5fa" },
                  { label: "VRF Randomness", icon: <Dice5 size={9} />, color: "#34d399" },
                  { label: "BOLT ECS", icon: <Layers size={9} />, color: "#c084fc" },
                ].map((b) => (
                  <div
                    key={b.label}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border"
                    style={{ color: b.color, borderColor: `${b.color}30`, background: `${b.color}08` }}
                  >
                    {b.icon}
                    {b.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] mt-8 py-4">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
          <span>AI Poker Arena &mdash; Solana Blitz Hackathon v1</span>
          <span>Built with Solana + MagicBlock</span>
        </div>
      </footer>
    </main>
  );
}
