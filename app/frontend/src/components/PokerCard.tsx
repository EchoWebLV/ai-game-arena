"use client";

import { ComponentType, useMemo } from "react";
import * as deck from "@letele/playing-cards";
import clsx from "clsx";

interface PokerCardProps {
  cardIdx: number;
  faceDown?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  delay?: number;
}

const SIZE_MAP = {
  xs: { w: 32, h: 45 },
  sm: { w: 44, h: 62 },
  md: { w: 58, h: 82 },
  lg: { w: 76, h: 106 },
};

const RANK_NAMES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"];
const SUIT_LETTERS = ["H", "D", "C", "S"];

const cardLib = deck as unknown as Record<string, ComponentType<React.SVGProps<SVGSVGElement>>>;
const CardBack = cardLib["B1"];

function getCardComponent(cardIdx: number): ComponentType<React.SVGProps<SVGSVGElement>> | null {
  if (cardIdx < 0 || cardIdx >= 52 || cardIdx === 255) return null;
  const rank = RANK_NAMES[cardIdx % 13];
  const suit = SUIT_LETTERS[Math.floor(cardIdx / 13)];
  const key = `${suit}${rank}`;
  return cardLib[key] ?? null;
}

export default function PokerCard({ cardIdx, faceDown = false, size = "md", delay = 0 }: PokerCardProps) {
  const s = SIZE_MAP[size];

  const Card = useMemo(() => (faceDown ? null : getCardComponent(cardIdx)), [cardIdx, faceDown]);

  if (faceDown) {
    return (
      <div
        className="rounded-md overflow-hidden select-none animate-deal shadow-md"
        style={{ width: s.w, height: s.h, animationDelay: `${delay}ms` }}
      >
        {CardBack ? (
          <CardBack style={{ width: "100%", height: "100%" }} />
        ) : (
          <div
            className="w-full h-full poker-card-back flex items-center justify-center"
          >
            <span className="text-blue-300/30 font-bold text-xs">AI</span>
          </div>
        )}
      </div>
    );
  }

  if (!Card) {
    return (
      <div
        className="rounded-md border border-white/5 bg-white/[0.03]"
        style={{ width: s.w, height: s.h }}
      />
    );
  }

  return (
    <div
      className="rounded-md overflow-hidden select-none animate-deal shadow-md"
      style={{ width: s.w, height: s.h, animationDelay: `${delay}ms` }}
    >
      <Card style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
