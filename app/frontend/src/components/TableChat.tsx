"use client";

import { AI_PLAYERS } from "@/lib/constants";
import AIAvatar from "./AIAvatar";
import { useRef, useEffect } from "react";
import clsx from "clsx";
import type { LogEntry } from "./TournamentLog";

const ACTION_STYLES: Record<string, string> = {
  fold: "text-gray-500",
  check: "text-gray-400",
  call: "text-blue-400",
  raise: "text-[var(--gold)]",
  all_in: "text-[var(--crimson-light)]",
};

interface TableChatProps {
  logs: LogEntry[];
}

export default function TableChat({ logs }: TableChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  const recent = logs.slice(-12);

  return (
    <div
      ref={scrollRef}
      className="overflow-y-auto space-y-1 pr-1 scrollbar-thin"
      style={{ maxHeight: "100%" }}
    >
      {recent.map((log, i) => {
        const player = AI_PLAYERS[log.playerIdx];
        if (!player) return null;
        const isWin = log.action.startsWith("WINS");
        const isElim = log.action === "ELIMINATED";
        const hasThought =
          !!log.reasoning &&
          log.reasoning.length > 2 &&
          !isWin &&
          !isElim &&
          !log.reasoning.startsWith("fallback");
        const actionStyle = isWin
          ? "text-[var(--gold)] font-semibold"
          : isElim
            ? "text-red-500 font-semibold"
            : ACTION_STYLES[log.action] || "text-[var(--text-secondary)]";

        return (
          <div
            key={i}
            className={clsx(
              "rounded-lg px-2.5 py-1.5 backdrop-blur-sm",
              "bg-black/40 border border-white/[0.06]",
              i === recent.length - 1 && "animate-slide-up"
            )}
          >
            <div className="flex items-center gap-1.5 text-[11px]">
              <AIAvatar src={player.avatar} name={player.shortName} size={16} className="shrink-0" />
              <span className="font-semibold" style={{ color: player.color }}>
                {player.shortName}
              </span>
              <span className={clsx("font-medium", actionStyle)}>
                {log.action}
                {log.amount && !isWin ? ` ${log.amount.toLocaleString()}` : ""}
              </span>
            </div>
            {hasThought && (
              <p className="text-[10px] leading-[1.4] text-white/50 italic mt-0.5 ml-[26px] line-clamp-2">
                &ldquo;{log.reasoning}&rdquo;
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
