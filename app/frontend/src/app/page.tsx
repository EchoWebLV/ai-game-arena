"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import PokerTable from "@/components/PokerTable";
import PredictionMarket from "@/components/PredictionMarket";
import TournamentLog, { LogEntry } from "@/components/TournamentLog";
import TransactionFeed, { TxEntry } from "@/components/TransactionFeed";
import { AI_PLAYERS, BACKEND_URL } from "@/lib/constants";
import { Zap, Shield, Dice5, Layers, Wifi, WifiOff, Trophy, RotateCcw } from "lucide-react";
import clsx from "clsx";

const WalletNavButton = dynamic(() => import("@/components/WalletButton"), { ssr: false });
const WalletAwarePredictionMarket = dynamic(
  () => import("@/components/WalletAwarePredictionMarket"),
  { ssr: false, loading: () => <PredictionMarket market={{ totalPool: 0, betsPerAi: [0,0,0,0,0], isOpen: true, isResolved: false, winningAi: null }} onPlaceBet={() => {}} userBets={[]} chipStandings={[]} /> }
);

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

const WS_URL = BACKEND_URL.replace(/^http/, "ws") + "/ws";

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [tournamentStatus, setTournamentStatus] = useState<string>("idle");
  const [tournamentId, setTournamentId] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Connecting to server...");

  const [players, setPlayers] = useState<PlayerData[]>(
    AI_PLAYERS.map(() => ({
      chips: INITIAL_CHIPS, currentBet: 0, isFolded: false, isAllIn: false,
      isActive: true, holeCards: [255, 255] as [number, number],
    }))
  );

  const [table, setTable] = useState<TableData>({
    pot: 0, communityCards: [255,255,255,255,255], currentRound: "waiting",
    dealerIdx: 0, currentTurn: -1, handNumber: 0, showCards: false,
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [txs, setTxs] = useState<TxEntry[]>([]);
  const [tournamentResult, setTournamentResult] = useState<{ winner: string; winnerIdx: number; hands: number } | null>(null);

  const [market, setMarket] = useState({
    totalPool: 0, betsPerAi: [0,0,0,0,0], isOpen: true, isResolved: false, winningAi: null as number | null,
  });
  const [userBets, setUserBets] = useState<{ aiIdx: number; amount: number }[]>([]);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;

      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        setStatusMessage("Connected to AI Poker Arena");
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        setStatusMessage("Reconnecting...");
        timer = setTimeout(connect, 3000);
      };

      ws.onerror = () => { if (!cancelled) ws?.close(); };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          handleMessage(JSON.parse(event.data));
        } catch {}
      };
    }

    function handleMessage(msg: any) {
      const applyHand = (hs: any, t?: any) => {
        if (!hs) return;
        setPlayers(hs.players || []);
        setTable({
          pot: hs.pot ?? 0,
          communityCards: hs.communityCards ?? [255,255,255,255,255],
          currentRound: hs.currentRound ?? "waiting",
          dealerIdx: hs.dealerIdx ?? 0,
          currentTurn: hs.currentTurn ?? -1,
          handNumber: t?.handNumber ?? 0,
          showCards: hs.showCards ?? false,
        });
      };

      const log = (hand: number, round: string, pIdx: number, action: string, amount: number | undefined, pot: number, reasoning?: string) => {
        setLogs((prev) => [...prev.slice(-200), { hand, round, playerIdx: pIdx, action, amount, pot, reasoning, timestamp: Date.now() }]);
      };

      switch (msg.type) {
        case "full_state": {
          if (msg.tournament) {
            setTournamentStatus(msg.tournament.status);
            setTournamentId(msg.tournament.tournamentId);
            if (msg.tournament.status === "betting_open") {
              setMarket((m) => ({ ...m, isOpen: true, isResolved: false }));
              setStatusMessage("Betting is open! Place your predictions.");
            } else if (msg.tournament.status === "running") {
              setMarket((m) => ({ ...m, isOpen: false }));
              setStatusMessage(`Tournament #${msg.tournament.tournamentId} in progress`);
            }
          }
          applyHand(msg.hand, msg.tournament);
          break;
        }

        case "tournament_status": {
          const t = msg.tournament;
          setTournamentStatus(t.status);
          setTournamentId(t.tournamentId);
          setStatusMessage(msg.message || "");

          if (msg.phase === "betting_open") {
            setMarket({ totalPool: 0, betsPerAi: [0,0,0,0,0], isOpen: true, isResolved: false, winningAi: null });
            setUserBets([]);
            setLogs([]);
            setTxs([]);
            setTournamentResult(null);
          } else if (msg.phase === "running") {
            setMarket((m) => ({ ...m, isOpen: false }));
          } else if (msg.phase === "complete" && t.winner !== null) {
            setTournamentResult({
              winner: AI_PLAYERS[t.winner].name,
              winnerIdx: t.winner,
              hands: t.handNumber,
            });
            setMarket((m) => ({ ...m, isResolved: true, winningAi: t.winner }));
          }
          break;
        }

        case "hand_start":
        case "round_update":
        case "turn_update":
        case "showdown": {
          applyHand(msg.handState, msg.tournament);
          break;
        }

        case "player_action": {
          applyHand(msg.handState, msg.tournament);
          if (msg.playerIdx !== undefined && msg.action) {
            log(
              msg.tournament?.handNumber ?? 0,
              msg.handState?.currentRound ?? "",
              msg.playerIdx,
              msg.action,
              msg.amount,
              msg.handState?.pot ?? 0,
              msg.reasoning
            );
          }
          break;
        }

        case "hand_result": {
          applyHand(msg.handState, msg.tournament);
          if (msg.winner !== undefined) {
            log(msg.tournament?.handNumber ?? 0, "showdown", msg.winner, `WINS ${(msg.pot ?? 0).toLocaleString()}`, msg.pot, 0);
          }
          if (msg.tournament) {
            setPlayers((prev) => {
              for (let i = 0; i < 5; i++) {
                if (!msg.tournament.active[i] && prev[i]?.isActive) {
                  log(msg.tournament.handNumber, "showdown", i, "ELIMINATED", undefined, 0);
                }
              }
              return prev;
            });
          }
          break;
        }

        case "tx": {
          setTxs((prev) => [...prev.slice(-300), {
            label: msg.label,
            sig: msg.sig,
            txCount: msg.txCount,
            timestamp: msg.timestamp ?? Date.now(),
          }]);
          break;
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, []);

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
    chips: players[ai.idx]?.chips ?? 0,
    active: players[ai.idx]?.isActive ?? true,
  })).sort((a, b) => b.chips - a.chips);

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[var(--bg-primary)]/90 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">🂡</span>
            <span className="text-base font-bold tracking-tight text-[var(--text-primary)]">AI Poker Arena</span>
            <span className="hidden sm:inline text-[10px] text-[var(--text-muted)] border border-white/[0.08] rounded px-1.5 py-0.5">DEVNET</span>
            <div className={clsx(
              "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ml-2",
              connected ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
            )}>
              {connected ? <Wifi size={9} /> : <WifiOff size={9} />}
              {connected ? "Live" : "Offline"}
            </div>
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
            <WalletNavButton style={{ height: 32, fontSize: 11, borderRadius: 8, padding: "0 12px", background: "linear-gradient(135deg, #c41e3a, #8b1528)" }} />
          </div>
        </div>
      </nav>

      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-6">
        {/* Status bar */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={clsx(
              "w-2 h-2 rounded-full",
              tournamentStatus === "running" ? "bg-green-400 animate-pulse" :
              tournamentStatus === "betting_open" ? "bg-[var(--gold)] animate-pulse" :
              tournamentStatus === "complete" ? "bg-blue-400" : "bg-[var(--text-muted)]"
            )} />
            <span className="text-sm text-[var(--text-primary)] font-medium">{statusMessage}</span>
          </div>
          {tournamentId > 0 && (
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              Tournament #{tournamentId} • Hand {table.handNumber}/{30}
            </span>
          )}
        </div>

        {/* Winner banner */}
        {tournamentResult && (
          <div className="mb-6 p-5 rounded-2xl bg-gradient-to-r from-[var(--gold)]/[0.08] via-[var(--gold)]/[0.04] to-transparent border border-[var(--gold)]/20 flex items-center gap-4 animate-slide-up">
            <div className="text-4xl">{AI_PLAYERS[tournamentResult.winnerIdx].avatar}</div>
            <div>
              <div className="text-sm text-[var(--gold)] font-medium flex items-center gap-1.5">
                <Trophy size={14} />
                Tournament Champion
              </div>
              <div className="text-xl font-bold text-[var(--text-primary)]">{tournamentResult.winner}</div>
              <div className="text-xs text-[var(--text-muted)]">{tournamentResult.hands} hands played</div>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <RotateCcw size={10} className="animate-spin" style={{ animationDuration: "3s" }} />
              Next tournament starting soon...
            </div>
          </div>
        )}

        {/* Poker Table — full width hero */}
        <div className="bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] p-5 mb-5 overflow-hidden">
          <PokerTable players={players} table={table} />
        </div>

        {/* On-chain info bar */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-white/[0.04] mb-5">
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
            <Zap size={10} className="text-[var(--gold)]" />
            <span>All actions on-chain via MagicBlock ER</span>
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[var(--text-muted)]">Latency:</span>
            <span className="text-green-400 font-mono">~50ms</span>
          </div>
        </div>

        {/* Bottom panels: 2-row layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 mb-5">
          {/* Prediction Market */}
          <div>
            <div className="bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] p-5 h-full">
              <WalletAwarePredictionMarket
                market={market}
                onPlaceBet={handlePlaceBet}
                userBets={userBets}
                chipStandings={chipStandings}
                tournamentId={tournamentId}
              />
            </div>
          </div>

          {/* Live Feed */}
          <div>
            <div className="bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] p-4 h-[420px]">
              <TournamentLog logs={logs} currentHand={table.handNumber} />
            </div>
          </div>

          {/* Chip Standings */}
          <div className="lg:col-span-2 xl:col-span-1">
            <div className="bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] p-4 h-full">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Chip Standings</h3>
              <div className="space-y-2.5">
                {chipStandings.map((s, rank) => {
                  const ai = AI_PLAYERS[s.idx];
                  const pct = (s.chips / (INITIAL_CHIPS * 5)) * 100;
                  return (
                    <div key={s.idx} className={clsx("flex items-center gap-2.5", !s.active && "opacity-25")}>
                      <span className="text-[11px] font-mono text-[var(--text-muted)] w-3 text-right">{rank + 1}</span>
                      <span className="text-base">{ai.avatar}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium mb-0.5" style={{ color: ai.color }}>{ai.shortName}</div>
                        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.min(100, pct)}%`, background: ai.color }} />
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-[var(--text-secondary)] tabular-nums w-14 text-right">{s.chips.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Transaction feed + Powered By */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5">
          <div className="bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] p-4 h-[320px]">
            <TransactionFeed txs={txs} />
          </div>

          <div className="bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] p-4 lg:w-[220px] flex flex-col justify-center">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-2">Powered By</div>
            <div className="flex flex-col gap-1.5">
              {[
                { label: "Ephemeral Rollups", icon: <Zap size={9} />, color: "var(--gold)" },
                { label: "Private ER (TEE)", icon: <Shield size={9} />, color: "#60a5fa" },
                { label: "VRF Randomness", icon: <Dice5 size={9} />, color: "#34d399" },
                { label: "BOLT ECS", icon: <Layers size={9} />, color: "#c084fc" },
              ].map((b) => (
                <div key={b.label} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border" style={{ color: b.color, borderColor: `${b.color}30`, background: `${b.color}08` }}>
                  {b.icon}{b.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-white/[0.04] mt-8 py-4">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-8 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
          <span>AI Poker Arena &mdash; Solana Blitz Hackathon v1</span>
          <span>Fully on-chain via Solana + MagicBlock</span>
        </div>
      </footer>
    </main>
  );
}
