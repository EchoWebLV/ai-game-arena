"use client";

import AIPlayerSeat from "./AIPlayerSeat";
import PokerCard from "./PokerCard";
import { AI_PLAYERS } from "@/lib/constants";

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
  { top: "12%", left: "50%" },    // top center
  { top: "38%", left: "90%" },    // right top
  { top: "80%", left: "78%" },    // right bottom
  { top: "80%", left: "22%" },    // left bottom
  { top: "38%", left: "10%" },    // left top
];

export default function PokerTable({ players, table }: PokerTableProps) {
  const visibleCommunity = table.communityCards.filter((c) => c !== 255);

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
              <div className="text-xl font-bold font-mono text-[var(--gold-light)] drop-shadow-lg">
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
    </div>
  );
}
