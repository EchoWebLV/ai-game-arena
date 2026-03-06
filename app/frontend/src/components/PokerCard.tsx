"use client";

import { cardToDisplay } from "@/lib/constants";
import clsx from "clsx";

interface PokerCardProps {
  cardIdx: number;
  faceDown?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  delay?: number;
}

const SIZE_MAP = {
  xs: { card: "w-8 h-11", rankText: "text-[9px]", suitText: "text-[10px]", centerSuit: "text-sm" },
  sm: { card: "w-11 h-[62px]", rankText: "text-[11px]", suitText: "text-[11px]", centerSuit: "text-lg" },
  md: { card: "w-[58px] h-[82px]", rankText: "text-sm", suitText: "text-sm", centerSuit: "text-2xl" },
  lg: { card: "w-[76px] h-[106px]", rankText: "text-lg", suitText: "text-base", centerSuit: "text-3xl" },
};

export default function PokerCard({ cardIdx, faceDown = false, size = "md", delay = 0 }: PokerCardProps) {
  const s = SIZE_MAP[size];

  if (faceDown) {
    return (
      <div
        className={clsx(s.card, "poker-card-back rounded-md flex items-center justify-center select-none animate-deal")}
        style={{ animationDelay: `${delay}ms` }}
      >
        <div className="w-[70%] h-[75%] rounded-sm border border-blue-400/30 flex items-center justify-center">
          <span className="text-blue-300/30 font-bold text-xs">AI</span>
        </div>
      </div>
    );
  }

  const { rank, suit, suitColor } = cardToDisplay(cardIdx);

  if (rank === "?") {
    return (
      <div className={clsx(s.card, "rounded-md border border-white/5 bg-white/[0.03]")} />
    );
  }

  return (
    <div
      className={clsx(s.card, "poker-card-face rounded-md flex flex-col relative select-none animate-deal overflow-hidden")}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Top-left rank/suit */}
      <div className="absolute top-[3px] left-[4px] leading-none flex flex-col items-center">
        <span className={clsx(s.rankText, "font-bold leading-tight")} style={{ color: suitColor }}>
          {rank}
        </span>
        <span className={clsx(s.suitText, "leading-tight -mt-[1px]")} style={{ color: suitColor }}>
          {suit}
        </span>
      </div>

      {/* Center suit */}
      <div className="flex-1 flex items-center justify-center">
        <span className={s.centerSuit} style={{ color: suitColor }}>
          {suit}
        </span>
      </div>

      {/* Bottom-right rank/suit (inverted) */}
      <div className="absolute bottom-[3px] right-[4px] leading-none flex flex-col items-center rotate-180">
        <span className={clsx(s.rankText, "font-bold leading-tight")} style={{ color: suitColor }}>
          {rank}
        </span>
        <span className={clsx(s.suitText, "leading-tight -mt-[1px]")} style={{ color: suitColor }}>
          {suit}
        </span>
      </div>
    </div>
  );
}
