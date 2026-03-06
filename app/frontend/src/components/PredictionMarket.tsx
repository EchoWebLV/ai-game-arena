"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { AI_PLAYERS } from "@/lib/constants";
import {
  placePredictionViaER,
  fetchMarketState,
  subscribeMarketState,
  TxResult,
} from "@/lib/market-client";
import clsx from "clsx";
import {
  TrendingUp,
  CheckCircle2,
  Trophy,
  ChevronDown,
  Zap,
  ExternalLink,
  Clock,
  Loader2,
} from "lucide-react";
import type { PublicKey, Transaction } from "@solana/web3.js";

const DynWalletButton = dynamic(() => import("./WalletButton"), { ssr: false });

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
  tournamentId?: number;
  walletConnected?: boolean;
  walletPublicKey?: PublicKey | null;
  walletSignTransaction?: ((tx: Transaction) => Promise<Transaction>) | null;
}

export default function PredictionMarket({
  market,
  onPlaceBet,
  userBets,
  chipStandings,
  tournamentId = 1,
  walletConnected = false,
  walletPublicKey = null,
  walletSignTransaction = null,
}: PredictionMarketProps) {
  const [selectedAi, setSelectedAi] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [showDetails, setShowDetails] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastTx, setLastTx] = useState<TxResult | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [onChainMarket, setOnChainMarket] = useState<MarketData | null>(null);

  const activeMarket = onChainMarket || market;

  useEffect(() => {
    let unsub: (() => void) | undefined;

    if (walletConnected) {
      fetchMarketState(tournamentId).then((state) => {
        if (state) {
          setOnChainMarket({
            totalPool: state.totalPool,
            betsPerAi: state.betsPerAi,
            isOpen: state.isOpen,
            isResolved: state.isResolved,
            winningAi: state.winningAi,
          });
        }
      });

      unsub = subscribeMarketState(tournamentId, (state) => {
        setOnChainMarket({
          totalPool: state.totalPool,
          betsPerAi: state.betsPerAi,
          isOpen: state.isOpen,
          isResolved: state.isResolved,
          winningAi: state.winningAi,
        });
      });
    }

    return () => unsub?.();
  }, [walletConnected, tournamentId]);

  const handleBet = useCallback(async () => {
    if (selectedAi === null || !betAmount) return;
    const amount = parseFloat(betAmount);
    if (isNaN(amount) || amount <= 0) return;

    setIsSubmitting(true);
    setTxError(null);
    setLastTx(null);

    if (walletConnected && walletPublicKey && walletSignTransaction) {
      try {
        const result = await placePredictionViaER(
          { publicKey: walletPublicKey, signTransaction: walletSignTransaction },
          tournamentId,
          selectedAi,
          amount
        );
        setLastTx(result);
        onPlaceBet(selectedAi, amount);
      } catch (err: any) {
        console.warn("On-chain tx failed, recording locally:", err.message);
        setTxError(err.message);
        onPlaceBet(selectedAi, amount);
      }
    } else {
      onPlaceBet(selectedAi, amount);
    }

    setBetAmount("");
    setSelectedAi(null);
    setIsSubmitting(false);
  }, [selectedAi, betAmount, walletConnected, walletPublicKey, walletSignTransaction, tournamentId, onPlaceBet]);

  const totalBets = activeMarket.betsPerAi.reduce((a, b) => a + b, 0);
  const maxChips = Math.max(...chipStandings.map((s) => s.chips), 1);

  const getImpliedProb = (idx: number) => {
    if (totalBets === 0) return 20;
    return (activeMarket.betsPerAi[idx] / totalBets) * 100;
  };

  const getPayout = (idx: number) => {
    if (activeMarket.betsPerAi[idx] === 0) return 0;
    return activeMarket.totalPool / activeMarket.betsPerAi[idx];
  };

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--crimson)] to-[var(--crimson-dark)] flex items-center justify-center">
            <TrendingUp size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              Prediction Market
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
              <span>Who will win?</span>
              <span className="text-white/10">|</span>
              <Zap size={9} className="text-[var(--gold)]" />
              <span className="text-[var(--gold)]">Powered by MagicBlock ER</span>
            </div>
          </div>
        </div>
        <div
          className={clsx(
            "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full",
            activeMarket.isOpen
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : activeMarket.isResolved
                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
          )}
        >
          <div
            className={clsx(
              "w-1.5 h-1.5 rounded-full",
              activeMarket.isOpen ? "bg-green-400" : activeMarket.isResolved ? "bg-blue-400" : "bg-red-400"
            )}
          />
          {activeMarket.isOpen ? "Open" : activeMarket.isResolved ? "Settled" : "Closed"}
        </div>
      </div>

      {/* ER latency badge */}
      <div className="flex items-center justify-center gap-2 mb-4 py-2 rounded-lg bg-[var(--gold)]/[0.04] border border-[var(--gold)]/10">
        <Zap size={11} className="text-[var(--gold)]" />
        <span className="text-[10px] text-[var(--gold-light)] font-medium">
          ~50ms confirmation via Ephemeral Rollup
        </span>
        {lastTx && (
          <>
            <span className="text-white/10">|</span>
            <Clock size={9} className="text-green-400" />
            <span className="text-[10px] text-green-400 font-mono">{lastTx.latencyMs}ms</span>
            {lastTx.viaER && (
              <span className="text-[9px] text-[var(--gold)]/60 bg-[var(--gold)]/10 px-1.5 py-0.5 rounded">ER</span>
            )}
          </>
        )}
      </div>

      {/* Pool display */}
      <div className="text-center mb-4 py-4 rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.04]">
        <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Total Prize Pool</div>
        <div className="text-3xl font-bold font-mono shimmer-gold">
          {(activeMarket.totalPool / 1e9).toFixed(2)} SOL
        </div>
        <div className="text-[11px] text-[var(--text-muted)] mt-1">
          {userBets.length > 0 ? `${userBets.length} prediction${userBets.length !== 1 ? "s" : ""} placed` : "No predictions yet"}
        </div>
      </div>

      {/* AI Runners */}
      <div className="space-y-2 mb-4">
        {AI_PLAYERS.map((ai) => {
          const prob = getImpliedProb(ai.idx);
          const payout = getPayout(ai.idx);
          const chipData = chipStandings.find((s) => s.idx === ai.idx);
          const chipPct = chipData ? (chipData.chips / maxChips) * 100 : 0;
          const isWinner = activeMarket.isResolved && activeMarket.winningAi === ai.idx;
          const isSelected = selectedAi === ai.idx;
          const userBet = userBets.find((b) => b.aiIdx === ai.idx);
          const isExpanded = showDetails === ai.idx;

          return (
            <div key={ai.idx}>
              <button
                onClick={() => {
                  if (activeMarket.isOpen) setSelectedAi(isSelected ? null : ai.idx);
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
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${ai.color}18`, border: `1px solid ${ai.color}30` }}
                  >
                    {ai.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold" style={{ color: ai.color }}>{ai.name}</span>
                      {isWinner && <Trophy size={13} className="text-[var(--gold)]" />}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">{ai.style}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold font-mono text-[var(--text-primary)]">{prob.toFixed(1)}%</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{payout > 0 ? `${payout.toFixed(1)}x` : "—"}</div>
                  </div>
                  {userBet && (
                    <div className="shrink-0 text-[10px] bg-[var(--gold)]/10 text-[var(--gold)] px-2 py-0.5 rounded-md font-medium border border-[var(--gold)]/20">
                      {userBet.amount} SOL
                    </div>
                  )}
                  <ChevronDown size={14} className={clsx("text-[var(--text-muted)] transition-transform shrink-0", isExpanded && "rotate-180")} />
                </div>

                <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full odds-bar" style={{ width: `${prob}%`, background: ai.color }} />
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-2.5 border-t border-white/[0.05] grid grid-cols-2 gap-3 text-[11px] animate-slide-up">
                    <div>
                      <div className="text-[var(--text-muted)] mb-0.5">Chip Stack</div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${chipPct}%`, background: ai.color }} />
                        </div>
                        <span className="font-mono text-[var(--text-primary)]">{chipData?.chips.toLocaleString() ?? "0"}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-muted)] mb-0.5">Bet Volume</div>
                      <div className="font-mono text-[var(--text-primary)]">{(activeMarket.betsPerAi[ai.idx] / 1e9).toFixed(2)} SOL</div>
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
      {activeMarket.isOpen && (
        <div className="space-y-2.5 animate-fade-in">
          {!walletConnected ? (
            <div className="flex flex-col items-center gap-2 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[11px] text-[var(--text-muted)]">Connect wallet to place on-chain predictions via MagicBlock ER</div>
              <DynWalletButton
                style={{
                  height: 36,
                  fontSize: 12,
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #c41e3a, #8b1528)",
                }}
              />
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  placeholder="Amount in SOL"
                  step="0.1"
                  min="0.01"
                  disabled={isSubmitting}
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--crimson)] focus:border-[var(--crimson)]/50 transition-all font-mono disabled:opacity-50"
                />
                <button
                  onClick={handleBet}
                  disabled={selectedAi === null || !betAmount || isSubmitting}
                  className={clsx(
                    "px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5",
                    selectedAi !== null && betAmount && !isSubmitting
                      ? "bg-gradient-to-r from-[var(--crimson)] to-[var(--crimson-dark)] text-white hover:brightness-110 shadow-lg shadow-[var(--crimson)]/20"
                      : "bg-white/[0.04] text-[var(--text-muted)] cursor-not-allowed"
                  )}
                >
                  {isSubmitting ? (
                    <><Loader2 size={13} className="animate-spin" /> Sending...</>
                  ) : selectedAi !== null ? (
                    `Bet on ${AI_PLAYERS[selectedAi].shortName}`
                  ) : (
                    "Select AI"
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1 text-[var(--text-muted)]">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  {walletPublicKey?.toBase58().slice(0, 4)}...{walletPublicKey?.toBase58().slice(-4)}
                </div>
                <div className="flex items-center gap-1 text-[var(--gold)]/70">
                  <Zap size={8} />
                  <span>Txs routed via MagicBlock ER (~50ms)</span>
                </div>
              </div>
            </>
          )}

          {lastTx && (
            <div className="flex items-center gap-2 text-[10px] p-2 rounded-lg bg-green-500/[0.06] border border-green-500/10 animate-slide-up">
              <CheckCircle2 size={12} className="text-green-400 shrink-0" />
              <span className="text-green-400">
                Confirmed in {lastTx.latencyMs}ms {lastTx.viaER ? "via Ephemeral Rollup" : "via base layer"}
              </span>
              <a
                href={`https://explorer.solana.com/tx/${lastTx.signature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-green-400/60 hover:text-green-400 transition-colors"
              >
                <ExternalLink size={10} />
              </a>
            </div>
          )}

          {txError && (
            <div className="text-[10px] p-2 rounded-lg bg-yellow-500/[0.06] border border-yellow-500/10 text-yellow-400 animate-slide-up">
              On-chain tx pending — recorded locally. {txError.slice(0, 60)}...
            </div>
          )}
        </div>
      )}

      {activeMarket.isResolved && activeMarket.winningAi !== null && (
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-b from-[var(--gold)]/10 to-transparent border border-[var(--gold)]/20 text-center animate-slide-up">
          <CheckCircle2 size={20} className="text-[var(--gold)] mx-auto mb-1.5" />
          <div className="text-sm font-bold text-[var(--gold-light)]">{AI_PLAYERS[activeMarket.winningAi].name} Wins!</div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Market settled on-chain. Winning bettors can claim payouts.</div>
        </div>
      )}
    </div>
  );
}
