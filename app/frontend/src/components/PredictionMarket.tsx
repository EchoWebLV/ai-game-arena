"use client";

import { useState } from "react";
import { AI_PLAYERS } from "@/lib/constants";
import clsx from "clsx";
import { TrendingUp, Lock, CheckCircle2, Trophy, ChevronDown } from "lucide-react";

interface MarketData {
  totalPool: number;
  betsPerAi: number[];
  isOpen: boolean;
  isResolved: boolean;
  winningAi: number | null;
}

interface PredictionMarketProps {
  market: MarketData;
  onPlaceBet: (aiIdx: number, amount: number) => void;
  userBets: { aiIdx: number; amount: number }[];
  chipStandings: { idx: number; chips: number; active: boolean }[];
}

export default function PredictionMarket({
  market,
  onPlaceBet,
  userBets,
  chipStandings,
}: PredictionMarketProps) {
  const [selectedAi, setSelectedAi] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [showDetails, setShowDetails] = useState<number | null>(null);

  const handleBet = () => {
    if (selectedAi !== null && betAmount) {
      onPlaceBet(selectedAi, parseFloat(betAmount));
      setBetAmount("");
      setSelectedAi(null);
    }
  };

  const totalBets = market.betsPerAi.reduce((a, b) => a + b, 0);
  const maxChips = Math.max(...chipStandings.map((s) => s.chips), 1);

  const getImpliedProb = (idx: number) => {
    if (totalBets === 0) return 20;
    return (market.betsPerAi[idx] / totalBets) * 100;
  };

  const getPayout = (idx: number) => {
    if (market.betsPerAi[idx] === 0) return 0;
    return market.totalPool / market.betsPerAi[idx];
  };

  return (
    <div className="relative">
      {/* Header section */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--crimson)] to-[var(--crimson-dark)] flex items-center justify-center">
            <TrendingUp size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Prediction Market
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              Who will win the tournament?
            </p>
          </div>
        </div>
        <div className={clsx(
          "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full",
          market.isOpen
            ? "bg-green-500/10 text-green-400 border border-green-500/20"
            : market.isResolved
              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
        )}>
          <div className={clsx(
            "w-1.5 h-1.5 rounded-full",
            market.isOpen ? "bg-green-400" : market.isResolved ? "bg-blue-400" : "bg-red-400"
          )} />
          {market.isOpen ? "Open" : market.isResolved ? "Settled" : "Closed"}
        </div>
      </div>

      {/* Pool display */}
      <div className="text-center mb-5 py-4 rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.04]">
        <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">
          Total Prize Pool
        </div>
        <div className="text-3xl font-bold font-mono shimmer-gold">
          {(market.totalPool / 1e9).toFixed(2)} SOL
        </div>
        <div className="text-[11px] text-[var(--text-muted)] mt-1">
          {totalBets > 0
            ? `${userBets.length} prediction${userBets.length !== 1 ? "s" : ""} placed`
            : "No predictions yet"}
        </div>
      </div>

      {/* AI Runners */}
      <div className="space-y-2 mb-4">
        {AI_PLAYERS.map((ai) => {
          const prob = getImpliedProb(ai.idx);
          const payout = getPayout(ai.idx);
          const chipData = chipStandings.find((s) => s.idx === ai.idx);
          const chipPct = chipData ? (chipData.chips / maxChips) * 100 : 0;
          const isWinner = market.isResolved && market.winningAi === ai.idx;
          const isSelected = selectedAi === ai.idx;
          const userBet = userBets.find((b) => b.aiIdx === ai.idx);
          const isExpanded = showDetails === ai.idx;

          return (
            <div key={ai.idx} className="group">
              <button
                onClick={() => {
                  if (market.isOpen) setSelectedAi(isSelected ? null : ai.idx);
                  setShowDetails(isExpanded ? null : ai.idx);
                }}
                className={clsx(
                  "w-full rounded-xl p-3 text-left transition-all duration-200",
                  isWinner && "ring-1 ring-[var(--gold)] bg-[var(--gold)]/[0.08]",
                  isSelected && !isWinner && "ring-1 ring-[var(--crimson)] bg-[var(--crimson)]/[0.06]",
                  !isSelected && !isWinner && "bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04]",
                  !chipData?.active && "opacity-40"
                )}
              >
                {/* Top row: avatar, name, odds */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${ai.color}18`, border: `1px solid ${ai.color}30` }}
                  >
                    {ai.avatar}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold" style={{ color: ai.color }}>
                        {ai.name}
                      </span>
                      {isWinner && <Trophy size={13} className="text-[var(--gold)]" />}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">{ai.style}</div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold font-mono text-[var(--text-primary)]">
                      {prob.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      {payout > 0 ? `${payout.toFixed(1)}x` : "—"}
                    </div>
                  </div>

                  {userBet && (
                    <div className="shrink-0 text-[10px] bg-[var(--gold)]/10 text-[var(--gold)] px-2 py-0.5 rounded-md font-medium border border-[var(--gold)]/20">
                      {userBet.amount} SOL
                    </div>
                  )}

                  <ChevronDown
                    size={14}
                    className={clsx(
                      "text-[var(--text-muted)] transition-transform shrink-0",
                      isExpanded && "rotate-180"
                    )}
                  />
                </div>

                {/* Odds bar */}
                <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full odds-bar"
                    style={{ width: `${prob}%`, background: ai.color }}
                  />
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-3 pt-2.5 border-t border-white/[0.05] grid grid-cols-2 gap-3 text-[11px] animate-slide-up">
                    <div>
                      <div className="text-[var(--text-muted)] mb-0.5">Chip Stack</div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${chipPct}%`, background: ai.color }}
                          />
                        </div>
                        <span className="font-mono text-[var(--text-primary)]">
                          {chipData?.chips.toLocaleString() ?? "0"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)] mb-0.5">Bet Volume</div>
                      <div className="font-mono text-[var(--text-primary)]">
                        {(market.betsPerAi[ai.idx] / 1e9).toFixed(2)} SOL
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[var(--text-muted)]">{ai.description}</div>
                    </div>
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Bet input */}
      {market.isOpen && (
        <div className="flex gap-2 animate-fade-in">
          <div className="flex-1 relative">
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder="Amount in SOL"
              step="0.1"
              min="0.01"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--crimson)] focus:border-[var(--crimson)]/50 transition-all font-mono"
            />
          </div>
          <button
            onClick={handleBet}
            disabled={selectedAi === null || !betAmount}
            className={clsx(
              "px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
              selectedAi !== null && betAmount
                ? "bg-gradient-to-r from-[var(--crimson)] to-[var(--crimson-dark)] text-white hover:brightness-110 shadow-lg shadow-[var(--crimson)]/20"
                : "bg-white/[0.04] text-[var(--text-muted)] cursor-not-allowed"
            )}
          >
            {selectedAi !== null
              ? `Bet on ${AI_PLAYERS[selectedAi].shortName}`
              : "Select AI"}
          </button>
        </div>
      )}

      {market.isResolved && market.winningAi !== null && (
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-b from-[var(--gold)]/10 to-transparent border border-[var(--gold)]/20 text-center animate-slide-up">
          <CheckCircle2 size={20} className="text-[var(--gold)] mx-auto mb-1.5" />
          <div className="text-sm font-bold text-[var(--gold-light)]">
            {AI_PLAYERS[market.winningAi].name} Wins!
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Market settled. Winning bettors can claim payouts.
          </div>
        </div>
      )}
    </div>
  );
}
