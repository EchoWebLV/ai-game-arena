import { Connection, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idlJson from "./idl.json";

const PROGRAM_ID = new PublicKey("BJSCnCFb475uHPTi6Lee2E5SU2GToyRQEgqHJUbsN5ob");
const TOURNAMENT_SEED = Buffer.from("tournament");
const MARKET_SEED = Buffer.from("market");
const USER_BET_SEED = Buffer.from("user_bet");

const SOLANA_DEVNET_RPC = "https://api.devnet.solana.com";
let _devnetConnection: Connection | null = null;

export function getDevnetConnection(): Connection {
  if (!_devnetConnection) {
    _devnetConnection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  }
  return _devnetConnection;
}

function getMarketPda(tournamentPda: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [MARKET_SEED, tournamentPda.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

function getTournamentPda(tournamentId: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [TOURNAMENT_SEED, new anchor.BN(tournamentId).toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
  return pda;
}

function getUserBetPda(marketPda: PublicKey, user: PublicKey, aiIdx: number, isYes: boolean): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [USER_BET_SEED, marketPda.toBuffer(), user.toBuffer(), Buffer.from([aiIdx]), Buffer.from([isYes ? 1 : 0])],
    PROGRAM_ID
  );
  return pda;
}

function getProgram(connection: Connection) {
  const provider = new anchor.AnchorProvider(
    connection,
    { publicKey: PublicKey.default, signTransaction: async (tx: any) => tx, signAllTransactions: async (txs: any) => txs } as any,
    { commitment: "confirmed" }
  );
  const idlWithAddress = { ...idlJson, address: PROGRAM_ID.toBase58() };
  return new (anchor.Program as any)(idlWithAddress, provider);
}

export async function buildPlacePredictionTx(
  connection: Connection,
  user: PublicKey,
  tournamentId: number,
  aiIdx: number,
  isYes: boolean,
  amountSol: number,
): Promise<Transaction> {
  const program = getProgram(connection);
  const tournamentPda = getTournamentPda(tournamentId);
  const marketPda = getMarketPda(tournamentPda);
  const userBetPda = getUserBetPda(marketPda, user, aiIdx, isYes);
  const lamports = new anchor.BN(Math.round(amountSol * 1e9));

  const ix = await program.methods
    .placePrediction(aiIdx, isYes, lamports)
    .accounts({
      user,
      market: marketPda,
      userBet: userBetPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  tx.feePayer = user;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  return tx;
}

export async function buildClaimWinningsTx(
  connection: Connection,
  user: PublicKey,
  tournamentId: number,
  aiIdx: number,
  isYes: boolean,
): Promise<Transaction> {
  const program = getProgram(connection);
  const tournamentPda = getTournamentPda(tournamentId);
  const marketPda = getMarketPda(tournamentPda);
  const userBetPda = getUserBetPda(marketPda, user, aiIdx, isYes);

  const ix = await program.methods
    .claimWinnings()
    .accounts({
      user,
      market: marketPda,
      userBet: userBetPda,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  tx.feePayer = user;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  return tx;
}

export { PROGRAM_ID, getMarketPda, getTournamentPda, getUserBetPda };
