"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

interface WalletButtonProps {
  style?: React.CSSProperties;
}

export default function WalletButton({ style }: WalletButtonProps) {
  return <WalletMultiButton style={style} />;
}

export function useWalletState() {
  const w = useWallet();
  return w;
}
