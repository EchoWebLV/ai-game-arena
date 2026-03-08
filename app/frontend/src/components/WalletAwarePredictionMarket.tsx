"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import PredictionMarket from "./PredictionMarket";
import { buildPlacePredictionTx, getDevnetConnection } from "@/lib/market-tx";

interface Props {
  market: any;
  onPlaceBet: (aiIdx: number, isYes: boolean, amount: number) => void;
  chipStandings: { idx: number; chips: number; active: boolean }[];
  tournamentId: number;
}

export default function WalletAwarePredictionMarket({ market, chipStandings, tournamentId }: Props) {
  const { publicKey, signTransaction, connected } = useWallet();
  const [txPending, setTxPending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const handlePlaceBet = useCallback(async (aiIdx: number, isYes: boolean, amountSol: number) => {
    if (!publicKey || !signTransaction || !connected) {
      setLastError("Connect your wallet first");
      return;
    }
    if (tournamentId <= 0) {
      setLastError("No active tournament");
      return;
    }

    setTxPending(true);
    setLastError(null);

    try {
      const devnet = getDevnetConnection();
      const tx = await buildPlacePredictionTx(devnet, publicKey, tournamentId, aiIdx, isYes, amountSol);
      const signed = await signTransaction(tx);
      const sig = await devnet.sendRawTransaction(signed.serialize(), { skipPreflight: true });
      await devnet.confirmTransaction(sig, "confirmed");
      console.log("[Market] Bet placed on-chain (devnet):", sig.slice(0, 20));
    } catch (err: any) {
      const msg = err?.message || "Transaction failed";
      console.error("[Market] Bet error:", msg.slice(0, 200));
      setLastError(msg.includes("User rejected") ? "Transaction cancelled" : msg.slice(0, 80));
    } finally {
      setTxPending(false);
    }
  }, [publicKey, signTransaction, connected, tournamentId]);

  return (
    <div>
      <PredictionMarket
        market={market}
        onPlaceBet={handlePlaceBet}
        chipStandings={chipStandings}
        tournamentId={tournamentId}
        walletConnected={connected}
        txPending={txPending}
      />
      {lastError && (
        <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
          {lastError}
        </div>
      )}
      {!connected && market.isOpen && (
        <div className="mt-2 text-[10px] text-[var(--gold)] bg-[var(--gold)]/10 border border-[var(--gold)]/20 rounded-lg px-3 py-1.5 text-center">
          Connect wallet to place real SOL bets on-chain
        </div>
      )}
    </div>
  );
}
