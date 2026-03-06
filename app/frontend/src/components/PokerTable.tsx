"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import AIPlayerSeat from "./AIPlayerSeat";
import PokerCard from "./PokerCard";
import { AI_PLAYERS } from "@/lib/constants";
import clsx from "clsx";

interface PlayerData {
  chips: number;
  currentBet: number;
  isFolded: boolean;
  isAllIn: boolean;
  isActive: boolean;
  holeCards: [number, number];
  lastAction?: string;
}

interface TableData {
  pot: number;
  communityCards: number[];
  currentRound: string;
  dealerIdx: number;
  currentTurn: number;
  handNumber: number;
  showCards: boolean;
}

interface PokerTableProps {
  players: PlayerData[];
  table: TableData;
}

const SEAT_POSITIONS = [
  { top: "12%", left: "50%" },
  { top: "38%", left: "90%" },
  { top: "80%", left: "78%" },
  { top: "80%", left: "22%" },
  { top: "38%", left: "10%" },
];

interface ChipAnim {
  id: number;
  seatIdx: number;
  amount: number;
}

interface DealAnim {
  id: number;
  seatIdx: number;
  slot: 0 | 1;
  delayMs: number;
}

export default function PokerTable({ players, table }: PokerTableProps) {
  const visibleCommunity = table.communityCards.filter((c) => c !== 255);

  const [chipAnims, setChipAnims] = useState<ChipAnim[]>([]);
  const [dealAnims, setDealAnims] = useState<DealAnim[]>([]);
  const [potPulse, setPotPulse] = useState(false);

  const prevBetsRef = useRef<number[]>(Array(5).fill(0));
  const prevCardsRef = useRef<[number, number][]>(
    Array.from({ length: 5 }, () => [255, 255] as [number, number])
  );
  const prevPotRef = useRef(0);
  const animIdRef = useRef(0);

  useEffect(() => {
    if (table.pot > prevPotRef.current && table.pot > 0) {
      setPotPulse(true);
      const t = setTimeout(() => setPotPulse(false), 450);
      return () => clearTimeout(t);
    }
    prevPotRef.current = table.pot;
  }, [table.pot]);

  useEffect(() => {
    const newChips: ChipAnim[] = [];
    const newDeals: DealAnim[] = [];
    let dealDelay = 0;

    for (let i = 0; i < Math.min(players.length, 5); i++) {
      const p = players[i];

      if (p.currentBet > prevBetsRef.current[i] && p.currentBet > 0) {
        newChips.push({ id: ++animIdRef.current, seatIdx: i, amount: p.currentBet });
      }
      prevBetsRef.current[i] = p.currentBet;

      const prev = prevCardsRef.current[i];
      if (prev[0] === 255 && p.holeCards[0] !== 255) {
        newDeals.push({ id: ++animIdRef.current, seatIdx: i, slot: 0, delayMs: dealDelay });
        dealDelay += 90;
        newDeals.push({ id: ++animIdRef.current, seatIdx: i, slot: 1, delayMs: dealDelay });
        dealDelay += 90;
      }
      prevCardsRef.current[i] = [p.holeCards[0], p.holeCards[1]];
    }

    if (newChips.length > 0) {
      setChipAnims((prev) => [...prev, ...newChips]);
      const ids = new Set(newChips.map((c) => c.id));
      setTimeout(() => setChipAnims((prev) => prev.filter((a) => !ids.has(a.id))), 700);
    }

    if (newDeals.length > 0) {
      setDealAnims((prev) => [...prev, ...newDeals]);
      const ids = new Set(newDeals.map((d) => d.id));
      setTimeout(() => setDealAnims((prev) => prev.filter((a) => !ids.has(a.id))), 900);
    }
  }, [players]);

  return (
    <div className="relative w-full aspect-[16/9.5] max-w-[820px] mx-auto">
      {/* Table rail (outer ring) */}
      <div className="absolute inset-0 rounded-[52%] table-rail" />

      {/* Felt surface (inner) */}
      <div className="absolute inset-[10px] rounded-[50%] felt-surface">
        {/* Center area */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {/* Pot */}
          {table.pot > 0 && (
            <div className="mb-3 animate-fade-in">
              <div className="text-[10px] uppercase tracking-[0.15em] text-green-200/50 font-medium">
                Pot
              </div>
              <div
                className={clsx(
                  "text-xl font-bold font-mono text-[var(--gold-light)] drop-shadow-lg transition-transform",
                  potPulse && "animate-pot-pulse"
                )}
              >
                {table.pot.toLocaleString()}
              </div>
            </div>
          )}

          {/* Community cards */}
          <div className="flex gap-1.5 mb-3">
            {Array.from({ length: 5 }).map((_, i) => {
              const cardIdx = table.communityCards[i];
              if (cardIdx !== undefined && cardIdx !== 255) {
                return <PokerCard key={i} cardIdx={cardIdx} size="md" delay={i * 120} />;
              }
              return (
                <div
                  key={`empty-${i}`}
                  className="w-[58px] h-[82px] rounded-md border border-white/[0.06] bg-white/[0.02]"
                />
              );
            })}
          </div>

          {/* Round indicator */}
          <div className="flex items-center gap-2">
            <div className="text-[10px] text-green-200/40 font-mono">
              Hand #{table.handNumber}
            </div>
            <div className="h-3 w-px bg-green-200/20" />
            <div className="text-[10px] font-semibold text-[var(--gold)] uppercase tracking-wider">
              {table.currentRound}
            </div>
          </div>
        </div>
      </div>

      {/* Player seats */}
      {players.map((player, idx) => (
        <AIPlayerSeat
          key={idx}
          name={AI_PLAYERS[idx].name}
          shortName={AI_PLAYERS[idx].shortName}
          avatar={AI_PLAYERS[idx].avatar}
          color={AI_PLAYERS[idx].color}
          chips={player.chips}
          currentBet={player.currentBet}
          isFolded={player.isFolded}
          isAllIn={player.isAllIn}
          isDealer={table.dealerIdx === idx}
          isCurrentTurn={table.currentTurn === idx}
          isEliminated={!player.isActive}
          holeCards={player.holeCards}
          showCards={table.showCards}
          lastAction={player.lastAction}
          position={SEAT_POSITIONS[idx]}
        />
      ))}

      {/* ── Flying chip animations ── */}
      {chipAnims.map((anim) => (
        <div
          key={anim.id}
          className="absolute z-30 pointer-events-none animate-fly-chip"
          style={
            {
              "--from-x": SEAT_POSITIONS[anim.seatIdx].left,
              "--from-y": SEAT_POSITIONS[anim.seatIdx].top,
            } as React.CSSProperties
          }
        >
          <div className="relative" style={{ width: 24, height: 28 }}>
            {Array.from({ length: Math.min(3, Math.ceil(anim.amount / 200)) }).map((_, j) => (
              <div
                key={j}
                className="absolute left-0 rounded-full"
                style={{
                  width: 22,
                  height: 22,
                  top: -j * 3,
                  background: "linear-gradient(145deg, #e2c97e 0%, #c9a84c 50%, #8a6d2b 100%)",
                  border: "2px solid #e2c97e",
                  boxShadow:
                    "0 1px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
                }}
              >
                <div
                  className="absolute rounded-full border border-dashed"
                  style={{
                    inset: 3,
                    borderColor: "rgba(255,255,255,0.35)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ── Card dealing animations ── */}
      {dealAnims.map((anim) => (
        <div
          key={anim.id}
          className="absolute z-30 pointer-events-none animate-deal-card"
          style={
            {
              "--to-x": SEAT_POSITIONS[anim.seatIdx].left,
              "--to-y": SEAT_POSITIONS[anim.seatIdx].top,
              animationDelay: `${anim.delayMs}ms`,
            } as React.CSSProperties
          }
        >
          <div className="poker-card-back rounded-md" style={{ width: 32, height: 44 }}>
            <div className="w-full h-full flex items-center justify-center">
              <div
                className="rounded-sm border"
                style={{
                  width: "70%",
                  height: "75%",
                  borderColor: "rgba(74, 122, 181, 0.3)",
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
