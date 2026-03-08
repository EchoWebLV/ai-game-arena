import * as anchor from "@coral-xyz/anchor";
import { Program, web3, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

const TOURNAMENT_SEED = Buffer.from("tournament");
const GAME_STATE_SEED = Buffer.from("game_state");
const PLAYER_STATE_SEED = Buffer.from("player_state");
const MARKET_SEED = Buffer.from("market");
const USER_BET_SEED = Buffer.from("user_bet");

describe("AI Poker Arena", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AiPokerArena;
  const tournamentId = new BN(Date.now());
  const startingChips = new BN(10000);
  const smallBlind = new BN(50);
  const bigBlind = new BN(100);
  const aiModels = [0, 1, 2, 3, 4]; // GPT-4, Claude, Gemini, Llama, Mistral

  let tournamentPda: PublicKey;
  let gameStatePda: PublicKey;
  let playerPdas: PublicKey[] = [];
  let marketPda: PublicKey;

  it("Creates a tournament", async () => {
    [tournamentPda] = PublicKey.findProgramAddressSync(
      [TOURNAMENT_SEED, tournamentId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [gameStatePda] = PublicKey.findProgramAddressSync(
      [GAME_STATE_SEED, tournamentPda.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .createTournament(
        tournamentId,
        startingChips,
        smallBlind,
        bigBlind,
        Buffer.from(aiModels)
      )
      .accounts({
        authority: provider.wallet.publicKey,
        tournament: tournamentPda,
        gameState: gameStatePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Tournament created:", tx);

    const tournament = await program.account.tournamentState.fetch(
      tournamentPda
    );
    expect(tournament.id.toNumber()).to.equal(tournamentId.toNumber());
    expect(tournament.remainingPlayers).to.equal(5);
    expect(tournament.startingChips.toNumber()).to.equal(10000);
  });

  it("Initializes all 5 AI players", async () => {
    for (let i = 0; i < 5; i++) {
      const [playerPda] = PublicKey.findProgramAddressSync(
        [PLAYER_STATE_SEED, gameStatePda.toBuffer(), Buffer.from([i])],
        program.programId
      );
      playerPdas.push(playerPda);

      const tx = await program.methods
        .initPlayer(i, aiModels[i])
        .accounts({
          authority: provider.wallet.publicKey,
          tournament: tournamentPda,
          gameState: gameStatePda,
          playerState: playerPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`Player ${i} initialized:`, tx);
    }

    const player0 = await program.account.playerState.fetch(playerPdas[0]);
    expect(player0.playerIdx).to.equal(0);
    expect(player0.chips.toNumber()).to.equal(10000);
    expect(player0.isActive).to.be.true;
  });

  it("Opens prediction market", async () => {
    [marketPda] = PublicKey.findProgramAddressSync(
      [MARKET_SEED, tournamentPda.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .openMarket(tournamentId)
      .accounts({
        authority: provider.wallet.publicKey,
        tournament: tournamentPda,
        market: marketPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Market opened:", tx);

    const market = await program.account.marketState.fetch(marketPda);
    expect(market.isOpen).to.be.true;
    expect(market.totalPool.toNumber()).to.equal(0);
  });

  it("Starts a hand with randomness", async () => {
    const randomness = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      randomness[i] = Math.floor(Math.random() * 256);
    }

    const tx = await program.methods
      .startHand(Array.from(randomness))
      .accounts({
        authority: provider.wallet.publicKey,
        tournament: tournamentPda,
        gameState: gameStatePda,
      })
      .rpc();

    console.log("Hand started:", tx);

    const game = await program.account.gameState.fetch(gameStatePda);
    expect(game.handNumber.toNumber()).to.equal(1);
    expect(game.status).to.equal(1); // STATUS_ACTIVE
  });

  it("Deals hole cards to all players", async () => {
    for (let i = 0; i < 5; i++) {
      const tx = await program.methods
        .dealHoleCards(i)
        .accounts({
          authority: provider.wallet.publicKey,
          gameState: gameStatePda,
          tournament: tournamentPda,
          playerState: playerPdas[i],
        })
        .rpc();

      console.log(`Dealt cards to player ${i}:`, tx);
    }

    const player0 = await program.account.playerState.fetch(playerPdas[0]);
    expect(player0.holeCard1).to.not.equal(255);
    expect(player0.holeCard2).to.not.equal(255);
  });

  it("Posts blinds", async () => {
    const sbIdx = 1; // dealer(0) + 1
    const bbIdx = 2; // dealer(0) + 2

    const tx = await program.methods
      .postBlinds()
      .accounts({
        authority: provider.wallet.publicKey,
        tournament: tournamentPda,
        gameState: gameStatePda,
        smallBlindPlayer: playerPdas[sbIdx],
        bigBlindPlayer: playerPdas[bbIdx],
      })
      .rpc();

    console.log("Blinds posted:", tx);

    const game = await program.account.gameState.fetch(gameStatePda);
    expect(game.pot.toNumber()).to.equal(150); // 50 + 100
  });

  it("Player actions: fold, call, raise", async () => {
    const game = await program.account.gameState.fetch(gameStatePda);

    // Player 3 calls
    const tx1 = await program.methods
      .playerAction(2, new BN(0)) // ACTION_CALL
      .accounts({
        authority: provider.wallet.publicKey,
        tournament: tournamentPda,
        gameState: gameStatePda,
        playerState: playerPdas[3],
      })
      .rpc();
    console.log("Player 3 calls:", tx1);

    // Player 4 folds
    const tx2 = await program.methods
      .playerAction(0, new BN(0)) // ACTION_FOLD
      .accounts({
        authority: provider.wallet.publicKey,
        tournament: tournamentPda,
        gameState: gameStatePda,
        playerState: playerPdas[4],
      })
      .rpc();
    console.log("Player 4 folds:", tx2);

    const player4 = await program.account.playerState.fetch(playerPdas[4]);
    expect(player4.isFolded).to.be.true;
  });
});
