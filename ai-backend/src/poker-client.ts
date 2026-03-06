import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  GameContext,
  OpponentInfo,
  roundName,
} from "./agents/base";

const PROGRAM_ID = new PublicKey(
  "PoKRx1DqBQA1cMYzSy1W4y1Q7D5M5GCBia1mVnFqJVw"
);
const TOURNAMENT_SEED = Buffer.from("tournament");
const GAME_STATE_SEED = Buffer.from("game_state");
const PLAYER_STATE_SEED = Buffer.from("player_state");
const MARKET_SEED = Buffer.from("market");

const AI_MODELS = ["GPT-4", "Claude", "Gemini", "Llama", "Mistral"];

export class PokerClient {
  connection: Connection;
  wallet: Keypair;
  program: anchor.Program;

  constructor(rpcUrl: string, wallet: Keypair) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.wallet = wallet;

    const provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(wallet),
      { commitment: "confirmed", skipPreflight: true }
    );
    anchor.setProvider(provider);

    // Load IDL at runtime
    this.program = null as any;
  }

  async init(idl: any) {
    const provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(this.wallet),
      { commitment: "confirmed", skipPreflight: true }
    );
    this.program = new anchor.Program(idl, PROGRAM_ID, provider);
  }

  getTournamentPda(tournamentId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [TOURNAMENT_SEED, new anchor.BN(tournamentId).toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID
    );
  }

  getGameStatePda(tournamentPda: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [GAME_STATE_SEED, tournamentPda.toBuffer()],
      PROGRAM_ID
    );
  }

  getPlayerStatePda(
    gameStatePda: PublicKey,
    playerIdx: number
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [PLAYER_STATE_SEED, gameStatePda.toBuffer(), Buffer.from([playerIdx])],
      PROGRAM_ID
    );
  }

  getMarketPda(tournamentPda: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [MARKET_SEED, tournamentPda.toBuffer()],
      PROGRAM_ID
    );
  }

  async fetchGameState(gameStatePda: PublicKey): Promise<any> {
    return this.program.account.gameState.fetch(gameStatePda);
  }

  async fetchPlayerState(playerStatePda: PublicKey): Promise<any> {
    return this.program.account.playerState.fetch(playerStatePda);
  }

  async fetchTournament(tournamentPda: PublicKey): Promise<any> {
    return this.program.account.tournamentState.fetch(tournamentPda);
  }

  async buildGameContext(
    tournamentId: number,
    playerIdx: number
  ): Promise<GameContext> {
    const [tournamentPda] = this.getTournamentPda(tournamentId);
    const [gameStatePda] = this.getGameStatePda(tournamentPda);
    const [playerPda] = this.getPlayerStatePda(gameStatePda, playerIdx);

    const gameState = await this.fetchGameState(gameStatePda);
    const playerState = await this.fetchPlayerState(playerPda);
    const tournament = await this.fetchTournament(tournamentPda);

    const opponents: OpponentInfo[] = [];
    for (let i = 0; i < 5; i++) {
      if (i === playerIdx) continue;
      const [oppPda] = this.getPlayerStatePda(gameStatePda, i);
      try {
        const opp = await this.fetchPlayerState(oppPda);
        opponents.push({
          player_idx: i,
          chips: opp.chips.toNumber(),
          current_bet: opp.currentBet.toNumber(),
          is_folded: opp.isFolded,
          is_all_in: opp.isAllIn,
          ai_model: AI_MODELS[opp.aiModelId] || "Unknown",
        });
      } catch {
        // Player not initialized yet
      }
    }

    const communityCards = gameState.communityCards.filter(
      (c: number) => c !== 255
    );

    let position = "early";
    if (playerIdx === gameState.dealerIdx) position = "dealer";
    else if (playerIdx === (gameState.dealerIdx + 1) % 5) position = "small_blind";
    else if (playerIdx === (gameState.dealerIdx + 2) % 5) position = "big_blind";
    else if (playerIdx === (gameState.dealerIdx + 3) % 5) position = "early";
    else position = "late";

    return {
      hand_number: gameState.handNumber.toNumber(),
      pot: gameState.pot.toNumber(),
      current_round: roundName(gameState.currentRound),
      community_cards: communityCards,
      my_hole_cards: [playerState.holeCard1, playerState.holeCard2],
      my_chips: playerState.chips.toNumber(),
      my_current_bet: playerState.currentBet.toNumber(),
      opponents,
      small_blind: gameState.smallBlind.toNumber(),
      big_blind: gameState.bigBlind.toNumber(),
      last_raise: gameState.lastRaise.toNumber(),
      position,
    };
  }

  actionToNumber(action: string): number {
    const map: Record<string, number> = {
      fold: 0,
      check: 1,
      call: 2,
      raise: 3,
      all_in: 4,
    };
    return map[action] ?? 2;
  }

  async submitPlayerAction(
    tournamentId: number,
    playerIdx: number,
    actionType: number,
    raiseAmount: number
  ): Promise<string> {
    const [tournamentPda] = this.getTournamentPda(tournamentId);
    const [gameStatePda] = this.getGameStatePda(tournamentPda);
    const [playerPda] = this.getPlayerStatePda(gameStatePda, playerIdx);

    const tx = await this.program.methods
      .playerAction(actionType, new anchor.BN(raiseAmount))
      .accounts({
        authority: this.wallet.publicKey,
        gameState: gameStatePda,
        playerState: playerPda,
      })
      .rpc();

    return tx;
  }
}
