"use client";

import { AI_PLAYERS } from "@/lib/constants";
import AIAvatar from "./AIAvatar";
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
        <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
          Live Action
          <Brain size={14} className="text-[var(--gold)] opacity-60" />
        </h3>
        <span className="text-xs font-mono text-[var(--text-muted)]">
          Hand #{currentHand}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-1"
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
                "px-2 py-1.5 rounded-lg",
                isWin && "bg-[var(--gold)]/[0.06]",
                isElim && "bg-red-500/[0.06]",
                hasThought && "bg-white/[0.02] border border-white/[0.04]"
              )}
            >
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-[11px] text-[var(--text-muted)] font-mono w-5 shrink-0 text-right">
                  {log.hand}
                </span>
                <AIAvatar src={player?.avatar} name={player?.shortName} size={18} className="shrink-0" />
                <span className="font-medium" style={{ color: player?.color }}>
                  {player?.shortName}
                </span>
                <span className={clsx("font-medium", actionStyle)}>
                  {log.action}
                  {log.amount && !isWin ? ` ${log.amount.toLocaleString()}` : ""}
                </span>
                {hasThought && (
                  <Brain size={11} className="shrink-0 ml-auto text-[var(--gold)]/60" />
                )}
              </div>

              {hasThought && (
                <div className="ml-[36px] mt-1 pl-2 border-l-2 border-[var(--gold)]/20">
                  <p className="text-[12px] leading-[1.5] text-[var(--text-secondary)] italic">
                    &ldquo;{log.reasoning}&rdquo;
                  </p>
                </div>
              )}
            </div>
          );
        })}
        {recentLogs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
            <div className="text-2xl mb-2 opacity-30">🂠</div>
            <div className="text-sm">Waiting for cards to fly...</div>
          </div>
        )}
      </div>
    </div>
  );
}
