"use client";

import { useState } from "react";
import { AI_PLAYERS } from "@/lib/constants";
import AIAvatar from "./AIAvatar";
import clsx from "clsx";
import { TrendingUp, Trophy, ThumbsUp, ThumbsDown, Zap } from "lucide-react";

interface MarketData {
  totalPool: number;
  yesBets: number[];
  noBets: number[];
  isOpen: boolean;
  isResolved: boolean;
  winningAi: number | null;
}

interface PredictionMarketProps {
  market: MarketData;
  onPlaceBet: (aiIdx: number, isYes: boolean, amount: number) => void;
  chipStandings: { idx: number; chips: number; active: boolean }[];
  tournamentId?: number;
  walletConnected?: boolean;
  txPending?: boolean;
}

const QUICK_AMOUNTS = [0.05, 0.1, 0.5];

export default function PredictionMarket({
  market,
  onPlaceBet,
  chipStandings,
  walletConnected,
  txPending,
}: PredictionMarketProps) {
  const [pendingBet, setPendingBet] = useState<{ aiIdx: number; isYes: boolean } | null>(null);
  const [customAmount, setCustomAmount] = useState("");

  const N = AI_PLAYERS.length;

  // Effective backing: YES bets on AI i + NO bets on every OTHER AI (split evenly)
  // YES on GPT  → GPT backing goes up → all others' % drops
  // NO  on GPT  → other 4 AIs' backing goes up → GPT's % drops
  const backing = AI_PLAYERS.map((_, i) => {
    let b = market.yesBets[i];
    for (let j = 0; j < N; j++) {
      if (j !== i) b += market.noBets[j] / (N - 1);
    }
    return b;
  });
  const totalBacking = backing.reduce((a, b) => a + b, 0);

  const getProb = (idx: number) => {
    if (totalBacking === 0) return 100 / N;
    return (backing[idx] / totalBacking) * 100;
  };

  const getYesPayout = (idx: number) => {
    const prob = getProb(idx);
    if (prob === 0) return 0;
    return 100 / prob;
  };

  const getNoPayout = (idx: number) => {
    const prob = getProb(idx);
    if (prob >= 100) return 0;
    return 100 / (100 - prob);
  };

  const canBet = market.isOpen && walletConnected && !txPending;

  const placeBet = (amount: number) => {
    if (!pendingBet || amount <= 0 || !canBet) return;
    onPlaceBet(pendingBet.aiIdx, pendingBet.isYes, amount);
    setPendingBet(null);
    setCustomAmount("");
  };

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--crimson)] to-[var(--crimson-dark)] flex items-center justify-center">
            <TrendingUp size={14} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">Prediction Market</h2>
            <div className="flex items-center gap-1 text-[9px] text-[var(--text-muted)]">
              <Zap size={8} className="text-[var(--gold)]" />
              <span className="text-[var(--gold)]">On-chain · Solana</span>
            </div>
          </div>
        </div>
        <div
          className={clsx(
            "flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full",
            market.isOpen
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : market.isResolved
                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
          )}
        >
          <div className={clsx("w-1.5 h-1.5 rounded-full", market.isOpen ? "bg-green-400 animate-pulse" : market.isResolved ? "bg-blue-400" : "bg-red-400")} />
          {market.isOpen ? "Open" : market.isResolved ? "Settled" : "Closed"}
        </div>
      </div>

      {/* Pool */}
      <div className="text-center mb-3 py-3 rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.04]">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-0.5">Total Pool</div>
        <div className="text-2xl font-bold font-mono shimmer-gold">
          {(market.totalPool / 1e9).toFixed(2)} SOL
        </div>
      </div>

      {/* AI cards with YES/NO */}
      <div className="space-y-1.5 mb-3">
        {AI_PLAYERS.map((ai) => {
          const yesProb = getProb(ai.idx);
          const noProb = 100 - yesProb;
          const yesPayout = getYesPayout(ai.idx);
          const noPayout = getNoPayout(ai.idx);
          const isWinner = market.isResolved && market.winningAi === ai.idx;
          const isLoser = market.isResolved && market.winningAi !== null && market.winningAi !== ai.idx;
          const chipData = chipStandings.find((s) => s.idx === ai.idx);
          const isPendingYes = pendingBet?.aiIdx === ai.idx && pendingBet?.isYes;
          const isPendingNo = pendingBet?.aiIdx === ai.idx && !pendingBet?.isYes;

          return (
            <div
              key={ai.idx}
              className={clsx(
                "rounded-xl p-2.5 transition-all",
                isWinner && "ring-1 ring-[var(--gold)] bg-[var(--gold)]/[0.06]",
                isLoser && "opacity-40",
                !isWinner && !isLoser && "bg-white/[0.02] border border-white/[0.04]"
              )}
            >
              {/* AI info row */}
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: `${ai.color}15`, border: `1px solid ${ai.color}25` }}
                >
                  <AIAvatar src={ai.avatar} name={ai.shortName} size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold" style={{ color: ai.color }}>{ai.shortName}</span>
                    {isWinner && <Trophy size={11} className="text-[var(--gold)]" />}
                  </div>
                  <div className="text-[9px] text-[var(--text-muted)]">
                    {chipData ? `${chipData.chips.toLocaleString()} chips` : "—"}
                  </div>
                </div>
              </div>

              {/* YES / NO bar */}
              <div className="flex gap-1.5 mb-1.5">
                <div className="h-1.5 rounded-full bg-white/[0.06] flex-1 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${yesProb}%`, background: "linear-gradient(90deg, #22c55e, #16a34a)" }}
                  />
                </div>
              </div>

              {/* YES / NO buttons */}
              <div className="flex gap-1.5">
                <button
                  onClick={() => canBet && setPendingBet(isPendingYes ? null : { aiIdx: ai.idx, isYes: true })}
                  disabled={!canBet}
                  className={clsx(
                    "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                    isPendingYes
                      ? "bg-green-500/20 text-green-400 ring-1 ring-green-500/40"
                      : canBet
                        ? "bg-green-500/[0.06] text-green-400/80 hover:bg-green-500/10 border border-green-500/10"
                        : "bg-white/[0.02] text-[var(--text-muted)] cursor-default border border-white/[0.03]"
                  )}
                >
                  <ThumbsUp size={10} />
                  <span>YES {yesProb.toFixed(0)}%</span>
                  {yesPayout > 0 && <span className="text-[8px] opacity-60">{yesPayout.toFixed(1)}x</span>}
                </button>
                <button
                  onClick={() => canBet && setPendingBet(isPendingNo ? null : { aiIdx: ai.idx, isYes: false })}
                  disabled={!canBet}
                  className={clsx(
                    "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                    isPendingNo
                      ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/40"
                      : canBet
                        ? "bg-red-500/[0.06] text-red-400/80 hover:bg-red-500/10 border border-red-500/10"
                        : "bg-white/[0.02] text-[var(--text-muted)] cursor-default border border-white/[0.03]"
                  )}
                >
                  <ThumbsDown size={10} />
                  <span>NO {noProb.toFixed(0)}%</span>
                  {noPayout > 0 && <span className="text-[8px] opacity-60">{noPayout.toFixed(1)}x</span>}
                </button>
              </div>

              {/* Tx pending indicator */}
              {txPending && pendingBet?.aiIdx === ai.idx && (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-[var(--gold)] animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--gold)]" />
                  Confirming on-chain...
                </div>
              )}

              {/* Amount picker when this AI is selected */}
              {pendingBet?.aiIdx === ai.idx && canBet && (
                <div className="mt-2 space-y-1.5 animate-fade-in">
                  <div className="flex gap-1.5">
                    {QUICK_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => placeBet(amt)}
                        className={clsx(
                          "flex-1 py-1.5 rounded-lg text-[10px] font-bold font-mono transition-all",
                          pendingBet.isYes
                            ? "bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20"
                            : "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                        )}
                      >
                        {amt} SOL
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Custom SOL"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = parseFloat(customAmount);
                          if (val > 0) placeBet(val);
                        }
                      }}
                      className={clsx(
                        "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-mono bg-white/[0.04] border outline-none placeholder:text-[var(--text-muted)]/50",
                        pendingBet.isYes
                          ? "border-green-500/20 text-green-400 focus:border-green-500/40"
                          : "border-red-500/20 text-red-400 focus:border-red-500/40"
                      )}
                    />
                    <button
                      onClick={() => {
                        const val = parseFloat(customAmount);
                        if (val > 0) placeBet(val);
                      }}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                        pendingBet.isYes
                          ? "bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30"
                          : "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                      )}
                    >
                      Bet
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Winner banner */}
      {market.isResolved && market.winningAi !== null && (
        <div className="p-3 rounded-xl bg-gradient-to-b from-[var(--gold)]/10 to-transparent border border-[var(--gold)]/20 text-center animate-slide-up">
          <Trophy size={18} className="text-[var(--gold)] mx-auto mb-1" />
          <div className="text-sm font-bold text-[var(--gold-light)]">{AI_PLAYERS[market.winningAi].name} Wins!</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Market settled on-chain</div>
        </div>
      )}
    </div>
  );
}
