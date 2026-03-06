"use client";

import PokerCard from "./PokerCard";
import clsx from "clsx";

interface AIPlayerSeatProps {
  name: string;
  shortName: string;
  avatar: string;
  color: string;
  chips: number;
  currentBet: number;
  isFolded: boolean;
  isAllIn: boolean;
  isDealer: boolean;
  isCurrentTurn: boolean;
  isEliminated: boolean;
  holeCards: [number, number];
  showCards: boolean;
  lastAction?: string;
  position: { top: string; left: string };
}

export default function AIPlayerSeat({
  name,
  shortName,
  avatar,
  color,
  chips,
  currentBet,
  isFolded,
  isAllIn,
  isDealer,
  isCurrentTurn,
  isEliminated,
  holeCards,
  showCards,
  lastAction,
  position,
}: AIPlayerSeatProps) {
  const dimmed = isEliminated || isFolded;

  return (
    <div
      className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
      style={{ top: position.top, left: position.left }}
    >
      {/* Bet chip (shown between player and pot) */}
      {currentBet > 0 && !isEliminated && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 animate-chip z-10">
          <div className="bg-[#1a1a2e] border border-[var(--gold)]/50 rounded-full px-2 py-0.5 text-[10px] font-mono text-[var(--gold-light)] whitespace-nowrap shadow-lg">
            {currentBet.toLocaleString()}
          </div>
        </div>
      )}

      <div
        className={clsx(
          "relative rounded-xl p-2.5 min-w-[120px] text-center transition-all duration-300",
          dimmed && "opacity-35 grayscale",
          isCurrentTurn && "animate-pulse-ring"
        )}
        style={{
          background: isCurrentTurn
            ? `linear-gradient(145deg, rgba(201,168,76,0.15), rgba(201,168,76,0.05))`
            : `linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))`,
          border: isCurrentTurn
            ? "1.5px solid rgba(201,168,76,0.6)"
            : "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(8px)",
        }}
      >
        {/* Dealer button */}
        {isDealer && (
          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white text-black text-[10px] font-black flex items-center justify-center shadow-md border border-gray-300 z-10">
            D
          </div>
        )}

        {/* Avatar + name */}
        <div className="flex items-center gap-1.5 mb-1.5 justify-center">
          <span className="text-lg">{avatar}</span>
          <div className="text-left">
            <div className="text-[11px] font-semibold leading-tight" style={{ color }}>
              {shortName}
            </div>
          </div>
        </div>

        {/* Hole cards */}
        <div className="flex gap-0.5 justify-center mb-1.5 min-h-[44px] items-center">
          {isEliminated ? (
            <span className="text-[10px] text-red-400/80 font-medium tracking-wide uppercase">Out</span>
          ) : isFolded ? (
            <span className="text-[10px] text-gray-500 font-medium tracking-wide uppercase">Fold</span>
          ) : (
            <>
              <PokerCard cardIdx={holeCards[0]} faceDown={!showCards} size="xs" delay={0} />
              <PokerCard cardIdx={holeCards[1]} faceDown={!showCards} size="xs" delay={80} />
            </>
          )}
        </div>

        {/* Chips */}
        <div className="text-xs font-mono font-bold text-[var(--gold-light)]">
          {chips.toLocaleString()}
        </div>

        {/* All-in badge */}
        {isAllIn && !isEliminated && (
          <div className="mt-0.5 text-[9px] font-bold text-[var(--crimson-light)] uppercase tracking-wider">
            All In
          </div>
        )}

        {/* Last action tooltip */}
        {lastAction && !dimmed && (
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 animate-slide-up z-10">
            <div className="text-[9px] px-2 py-0.5 rounded-full bg-black/80 text-[var(--gold-light)] whitespace-nowrap border border-[var(--gold)]/20">
              {lastAction}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
