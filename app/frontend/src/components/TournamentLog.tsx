"use client";

import { AI_PLAYERS } from "@/lib/constants";
import { useRef, useEffect } from "react";
import clsx from "clsx";

export interface LogEntry {
  hand: number;
  round: string;
  playerIdx: number;
  action: string;
  amount?: number;
  pot: number;
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
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Live Action</h3>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">
          Hand #{currentHand}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-px min-h-0 pr-1"
      >
        {recentLogs.map((log, i) => {
          const player = AI_PLAYERS[log.playerIdx];
          const isWin = log.action.startsWith("WINS");
          const isElim = log.action === "ELIMINATED";
          const actionStyle = isWin
            ? "text-[var(--gold)] font-semibold"
            : isElim
              ? "text-red-500 font-semibold"
              : ACTION_STYLES[log.action] || "text-[var(--text-secondary)]";

          return (
            <div
              key={i}
              className={clsx(
                "flex items-center gap-1.5 text-[11px] py-[3px] px-1.5 rounded",
                isWin && "bg-[var(--gold)]/[0.04]",
                isElim && "bg-red-500/[0.04]"
              )}
            >
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
