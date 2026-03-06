"use client";

import { AI_PLAYERS } from "@/lib/constants";
import { useRef, useEffect } from "react";
import clsx from "clsx";
import { Brain } from "lucide-react";

export interface LogEntry {
  hand: number;
  round: string;
  playerIdx: number;
  action: string;
  amount?: number;
  pot: number;
  reasoning?: string;
  timestamp: number;
}

interface TournamentLogProps {
  logs: LogEntry[];
  currentHand: number;
}

const ACTION_STYLES: Record<string, string> = {
  fold: "text-gray-500",
  check: "text-gray-400",
  call: "text-blue-400",
  raise: "text-[var(--gold)]",
  all_in: "text-[var(--crimson-light)]",
  ELIMINATED: "text-red-500 font-bold",
};

export default function TournamentLog({ logs, currentHand }: TournamentLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  const recentLogs = logs.slice(-50);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
          Live Action
          <Brain size={12} className="text-[var(--gold)] opacity-60" />
        </h3>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">
          Hand #{currentHand}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1 min-h-0 pr-1"
      >
        {recentLogs.map((log, i) => {
          const player = AI_PLAYERS[log.playerIdx];
          const isWin = log.action.startsWith("WINS");
          const isElim = log.action === "ELIMINATED";
          const hasThought = !!log.reasoning && log.reasoning.length > 2 && !isWin && !isElim && !log.reasoning.startsWith("fallback");
          const actionStyle = isWin
            ? "text-[var(--gold)] font-semibold"
            : isElim
              ? "text-red-500 font-semibold"
              : ACTION_STYLES[log.action] || "text-[var(--text-secondary)]";

          return (
            <div
              key={i}
              className={clsx(
                "px-1.5 py-1 rounded",
                isWin && "bg-[var(--gold)]/[0.04]",
                isElim && "bg-red-500/[0.04]",
                hasThought && "bg-white/[0.015]"
              )}
            >
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-[10px] text-[var(--text-muted)] font-mono w-5 shrink-0 text-right">
                  {log.hand}
                </span>
                <span className="shrink-0">{player?.avatar}</span>
                <span className="truncate" style={{ color: player?.color }}>
                  {player?.shortName}
                </span>
                <span className={clsx("truncate", actionStyle)}>
                  {log.action}
                  {log.amount && !isWin ? ` ${log.amount.toLocaleString()}` : ""}
                </span>
                {hasThought && (
                  <Brain size={9} className="shrink-0 ml-auto text-[var(--gold)]/50" />
                )}
              </div>

              {hasThought && (
                <div className="ml-[30px] mt-0.5 flex items-start gap-1">
                  <span className="text-[9px] leading-relaxed text-[var(--text-muted)] italic line-clamp-2">
                    &ldquo;{log.reasoning}&rdquo;
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {recentLogs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
            <div className="text-2xl mb-2 opacity-30">🂠</div>
            <div className="text-xs">Waiting for cards to fly...</div>
          </div>
        )}
      </div>
    </div>
  );
}
