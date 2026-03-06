"use client";

import { useRef, useEffect } from "react";
import { ExternalLink, Zap, Globe } from "lucide-react";
import clsx from "clsx";

export interface TxEntry {
  label: string;
  sig: string;
  layer: "base" | "er";
  txCount: number;
  timestamp: number;
}

interface TransactionFeedProps {
  txs: TxEntry[];
}

const EXPLORER_BASE = "https://explorer.solana.com/tx";

const LABEL_COLORS: Record<string, string> = {
  create_tournament: "#f59e0b",
  open_market: "#a855f7",
  start_hand: "#3b82f6",
  post_blinds: "#6366f1",
  showdown: "#ef4444",
  resolve_market: "#f59e0b",
};

function labelColor(label: string): string {
  for (const [key, color] of Object.entries(LABEL_COLORS)) {
    if (label.includes(key)) return color;
  }
  if (label.startsWith("deal_")) return "#34d399";
  if (label.startsWith("init_player")) return "#f97316";
  if (label.startsWith("delegate_")) return "#22d3ee";
  if (label.startsWith("undelegate_")) return "#fb923c";
  if (label.startsWith("action_")) return "#60a5fa";
  if (label.includes("advance")) return "#818cf8";
  return "#94a3b8";
}

function formatLabel(label: string): string {
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

export default function TransactionFeed({ txs }: TransactionFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [txs.length]);

  const recent = txs.slice(-80);
  const baseCount = txs.filter((t) => t.layer === "base").length;
  const erCount = txs.filter((t) => t.layer === "er").length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
          On-Chain Transactions
          <span className="text-[10px] font-mono text-[var(--text-muted)] font-normal">
            ({txs.length})
          </span>
        </h3>
        <div className="flex items-center gap-2 text-[9px] font-mono">
          <span className="flex items-center gap-1 text-cyan-400/70">
            <Globe size={8} />
            {baseCount} devnet
          </span>
          <span className="flex items-center gap-1 text-[var(--gold)]/70">
            <Zap size={8} />
            {erCount} ER
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-0.5 min-h-0 pr-1"
      >
        {recent.map((tx, i) => {
          const color = labelColor(tx.label);
          const isBase = tx.layer === "base";

          return (
            <a
              key={`${tx.sig}-${i}`}
              href={`${EXPLORER_BASE}/${tx.sig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(
                "flex items-center gap-1.5 text-[10px] py-[4px] px-1.5 rounded",
                "transition-colors hover:bg-white/[0.04] group cursor-pointer"
              )}
            >
              {isBase ? (
                <Globe size={8} className="text-cyan-400 shrink-0" />
              ) : (
                <Zap size={8} className="text-[var(--gold)] shrink-0" />
              )}
              <span className="font-mono text-[var(--text-muted)] w-6 shrink-0 text-right">
                #{tx.txCount}
              </span>
              <span className="truncate font-medium" style={{ color }}>
                {formatLabel(tx.label)}
              </span>
              <span className="ml-auto flex items-center gap-1 shrink-0">
                <span className="font-mono text-[var(--text-muted)] hidden sm:inline">
                  {tx.sig.slice(0, 8)}…{tx.sig.slice(-4)}
                </span>
                <span className="font-mono text-[var(--text-muted)] sm:hidden">
                  {tx.sig.slice(0, 6)}…
                </span>
                <ExternalLink
                  size={9}
                  className={clsx(
                    "transition-colors",
                    isBase
                      ? "text-white/20 group-hover:text-cyan-400"
                      : "text-white/20 group-hover:text-[var(--gold)]"
                  )}
                />
              </span>
            </a>
          );
        })}
        {recent.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
            <div className="text-2xl mb-2 opacity-30">&#9939;</div>
            <div className="text-xs">No transactions yet...</div>
          </div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[9px] text-[var(--text-muted)]">
        <span>Click any tx to open in Solana Explorer</span>
        {txs.length > 0 && (
          <span className="font-mono">{timeAgo(txs[txs.length - 1].timestamp)}</span>
        )}
      </div>
    </div>
  );
}
