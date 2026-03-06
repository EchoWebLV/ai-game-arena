import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { BN, BorshCoder, Idl } from "@coral-xyz/anchor";

const PROGRAM_ID = new PublicKey("PoKRx1DqBQA1cMYzSy1W4y1Q7D5M5GCBia1mVnFqJVw");

const TOURNAMENT_SEED = Buffer.from("tournament");
const GAME_STATE_SEED = Buffer.from("game_state");
const MARKET_SEED = Buffer.from("market");
const USER_BET_SEED = Buffer.from("user_bet");

const MAGICBLOCK_ER_RPC = "https://devnet-router.magicblock.app";
const BASE_RPC = "https://api.devnet.solana.com";

export interface MarketStateOnChain {
  tournament: PublicKey;
  authority: PublicKey;
  totalPool: number;
  betsPerAi: number[];
  isOpen: boolean;
  isResolved: boolean;
  winningAi: number | null;
}

export interface TxResult {
  signature: string;
  latencyMs: number;
  viaER: boolean;
}

export function getTournamentPda(tournamentId: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [TOURNAMENT_SEED, new BN(tournamentId).toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
  return pda;
}

export function getMarketPda(tournamentPda: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [MARKET_SEED, tournamentPda.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function getUserBetPda(
  marketPda: PublicKey,
  userPubkey: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [USER_BET_SEED, marketPda.toBuffer(), userPubkey.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function getERConnection(): Connection {
  return new Connection(MAGICBLOCK_ER_RPC, {
    commitment: "confirmed",
    wsEndpoint: MAGICBLOCK_ER_RPC.replace("https", "wss"),
  });
}

export function getBaseConnection(): Connection {
  return new Connection(BASE_RPC, "confirmed");
}

/**
 * Build a place_prediction instruction to be sent through MagicBlock ER.
 * Discriminator is the first 8 bytes of sha256("global:place_prediction").
 */
function buildPlacePredictionIx(
  user: PublicKey,
  marketPda: PublicKey,
  userBetPda: PublicKey,
  aiModelIdx: number,
  amountLamports: bigint
): TransactionInstruction {
  const discriminator = Buffer.from([
    0x8b, 0x0f, 0xaf, 0x19, 0xef, 0x8c, 0x45, 0x5c,
  ]);

  const data = Buffer.alloc(8 + 1 + 8);
  discriminator.copy(data, 0);
  data.writeUInt8(aiModelIdx, 8);
  data.writeBigUInt64LE(amountLamports, 9);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: marketPda, isSigner: false, isWritable: true },
      { pubkey: userBetPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Place a prediction bet through MagicBlock's Ephemeral Rollup (~50ms).
 * Falls back to base layer if ER is unavailable.
 */
export async function placePredictionViaER(
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
  },
  tournamentId: number,
  aiModelIdx: number,
  amountSol: number
): Promise<TxResult> {
  const tournamentPda = getTournamentPda(tournamentId);
  const marketPda = getMarketPda(tournamentPda);
  const userBetPda = getUserBetPda(marketPda, wallet.publicKey);
  const amountLamports = BigInt(Math.round(amountSol * LAMPORTS_PER_SOL));

  const ix = buildPlacePredictionIx(
    wallet.publicKey,
    marketPda,
    userBetPda,
    aiModelIdx,
    amountLamports
  );

  const erConn = getERConnection();
  const baseConn = getBaseConnection();

  let connection = erConn;
  let viaER = true;

  const start = performance.now();

  try {
    const { blockhash, lastValidBlockHeight } =
      await erConn.getLatestBlockhash("confirmed");

    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: wallet.publicKey,
    }).add(ix);

    const signed = await wallet.signTransaction(tx);
    const rawTx = signed.serialize();

    const signature = await erConn.sendRawTransaction(rawTx, {
      skipPreflight: true,
      maxRetries: 2,
    });

    await erConn.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );

    const latencyMs = Math.round(performance.now() - start);
    return { signature, latencyMs, viaER: true };
  } catch (erError) {
    console.warn("ER unavailable, falling back to base layer:", erError);
    viaER = false;

    try {
      const { blockhash, lastValidBlockHeight } =
        await baseConn.getLatestBlockhash("confirmed");

      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: wallet.publicKey,
      }).add(ix);

      const signed = await wallet.signTransaction(tx);
      const rawTx = signed.serialize();

      const signature = await baseConn.sendRawTransaction(rawTx, {
        skipPreflight: true,
      });

      await baseConn.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      const latencyMs = Math.round(performance.now() - start);
      return { signature, latencyMs, viaER: false };
    } catch (baseError) {
      throw new Error(
        `Transaction failed on both ER and base layer: ${baseError}`
      );
    }
  }
}

/**
 * Fetch the market state from ER first, fallback to base layer.
 */
export async function fetchMarketState(
  tournamentId: number
): Promise<MarketStateOnChain | null> {
  const tournamentPda = getTournamentPda(tournamentId);
  const marketPda = getMarketPda(tournamentPda);

  const connections = [getERConnection(), getBaseConnection()];

  for (const conn of connections) {
    try {
      const accountInfo = await conn.getAccountInfo(marketPda);
      if (!accountInfo || !accountInfo.data) continue;

      const data = accountInfo.data;
      if (data.length < 8) continue;

      const offset = 8;
      const tournament = new PublicKey(data.subarray(offset, offset + 32));
      const authority = new PublicKey(
        data.subarray(offset + 32, offset + 64)
      );
      const totalPool = Number(data.readBigUInt64LE(offset + 64));

      const betsPerAi: number[] = [];
      for (let i = 0; i < 5; i++) {
        betsPerAi.push(
          Number(data.readBigUInt64LE(offset + 72 + i * 8))
        );
      }

      const isOpen = data[offset + 112] === 1;
      const isResolved = data[offset + 113] === 1;
      const hasWinner = data[offset + 114] === 1;
      const winningAi = hasWinner ? data[offset + 115] : null;

      return {
        tournament,
        authority,
        totalPool,
        betsPerAi,
        isOpen,
        isResolved,
        winningAi,
      };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Subscribe to market state changes via ER WebSocket.
 */
export function subscribeMarketState(
  tournamentId: number,
  onUpdate: (market: MarketStateOnChain) => void
): () => void {
  const tournamentPda = getTournamentPda(tournamentId);
  const marketPda = getMarketPda(tournamentPda);

  const erConn = getERConnection();

  const subId = erConn.onAccountChange(
    marketPda,
    (accountInfo) => {
      const data = accountInfo.data;
      if (data.length < 8) return;

      const offset = 8;
      const tournament = new PublicKey(data.subarray(offset, offset + 32));
      const authority = new PublicKey(
        data.subarray(offset + 32, offset + 64)
      );
      const totalPool = Number(data.readBigUInt64LE(offset + 64));

      const betsPerAi: number[] = [];
      for (let i = 0; i < 5; i++) {
        betsPerAi.push(
          Number(data.readBigUInt64LE(offset + 72 + i * 8))
        );
      }

      const isOpen = data[offset + 112] === 1;
      const isResolved = data[offset + 113] === 1;
      const hasWinner = data[offset + 114] === 1;
      const winningAi = hasWinner ? data[offset + 115] : null;

      onUpdate({
        tournament,
        authority,
        totalPool,
        betsPerAi,
        isOpen,
        isResolved,
        winningAi,
      });
    },
    "confirmed"
  );

  return () => {
    erConn.removeAccountChangeListener(subId);
  };
}
