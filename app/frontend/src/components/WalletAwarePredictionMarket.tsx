"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import PredictionMarket from "./PredictionMarket";

interface Props {
  market: any;
  onPlaceBet: (aiIdx: number, amount: number) => void;
  userBets: { aiIdx: number; amount: number }[];
  chipStandings: { idx: number; chips: number; active: boolean }[];
  tournamentId: number;
}

export default function WalletAwarePredictionMarket(props: Props) {
  const wallet = useWallet();

  return (
    <PredictionMarket
      {...props}
      walletConnected={wallet.connected}
      walletPublicKey={wallet.publicKey}
      walletSignTransaction={wallet.signTransaction ?? null}
    />
  );
}
