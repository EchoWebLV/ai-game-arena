import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as crypto from "crypto";

const PROGRAM_ID = new PublicKey("BJSCnCFb475uHPTi6Lee2E5SU2GToyRQEgqHJUbsN5ob");
const TOURNAMENT_SEED = Buffer.from("tournament");
const GAME_STATE_SEED = Buffer.from("game_state");
const PLAYER_STATE_SEED = Buffer.from("player_state");
const MARKET_SEED = Buffer.from("market");
const MAX_PLAYERS = 5;

const ER_VALIDATOR = new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd");

const VRF_ORACLE_QUEUE = new PublicKey("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");
const VRF_PROGRAM = new PublicKey("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");

export class PokerClient {
  connection: Connection;
  erConnection: Connection;
  wallet: Keypair;
  provider: anchor.AnchorProvider;
  erProvider: anchor.AnchorProvider;
  program: any;
  erProgram: any;

  constructor(baseRpcUrl: string, erRpcUrl: string, wallet: Keypair) {
    this.connection = new Connection(baseRpcUrl, "confirmed");
    this.erConnection = new Connection(erRpcUrl, "confirmed");
    this.wallet = wallet;

    this.provider = new anchor.AnchorProvider(
      this.connection,
      new anchor.Wallet(wallet),
      { commitment: "confirmed", skipPreflight: true }
    );
    this.erProvider = new anchor.AnchorProvider(
      this.erConnection,
      new anchor.Wallet(wallet),
      { commitment: "confirmed", skipPreflight: true }
    );
  }

  async init(idl: any) {
    const idlWithAddress = { ...idl, address: PROGRAM_ID.toBase58() };
    this.program = new (anchor.Program as any)(idlWithAddress, this.provider);
    this.erProgram = new (anchor.Program as any)(idlWithAddress, this.erProvider);
  }

  // ── PDA derivation ──────────────────────────────────────────────────────

  getTournamentPda(tid: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [TOURNAMENT_SEED, new anchor.BN(tid).toArrayLike(Buffer, "le", 8)],
      PROGRAM_ID
    );
  }

  getGameStatePda(tournamentPda: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [GAME_STATE_SEED, tournamentPda.toBuffer()],
      PROGRAM_ID
    );
  }

  getPlayerStatePda(gameStatePda: PublicKey, idx: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [PLAYER_STATE_SEED, gameStatePda.toBuffer(), Buffer.from([idx])],
      PROGRAM_ID
    );
  }

  getMarketPda(tournamentPda: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [MARKET_SEED, tournamentPda.toBuffer()],
      PROGRAM_ID
    );
  }

  getAllPdas(tid: number) {
    const [tournamentPda] = this.getTournamentPda(tid);
    const [gameStatePda] = this.getGameStatePda(tournamentPda);
    const [marketPda] = this.getMarketPda(tournamentPda);
    const playerPdas = Array.from({ length: MAX_PLAYERS }, (_, i) =>
      this.getPlayerStatePda(gameStatePda, i)[0]
    );
    return { tournamentPda, gameStatePda, marketPda, playerPdas };
  }

  // ── Fetch (try ER first, fallback to base layer) ────────────────────────

  async fetchGameState(pda: PublicKey): Promise<any> {
    try {
      return await this.erProgram.account.gameState.fetch(pda);
    } catch {
      return await this.program.account.gameState.fetch(pda);
    }
  }

  async fetchPlayerState(pda: PublicKey): Promise<any> {
    try {
      return await this.erProgram.account.playerState.fetch(pda);
    } catch {
      return await this.program.account.playerState.fetch(pda);
    }
  }

  async fetchTournament(pda: PublicKey): Promise<any> {
    try {
      return await this.erProgram.account.tournamentState.fetch(pda);
    } catch {
      return await this.program.account.tournamentState.fetch(pda);
    }
  }

  // ── Base-layer instructions (init + delegation) ─────────────────────────

  async createTournament(tid: number, chips: number, sb: number, bb: number): Promise<string> {
    const { tournamentPda, gameStatePda } = this.getAllPdas(tid);
    return await this.program.methods
      .createTournament(new anchor.BN(tid), new anchor.BN(chips), new anchor.BN(sb), new anchor.BN(bb), [0, 1, 2, 3, 4])
      .accounts({
        authority: this.wallet.publicKey,
        tournament: tournamentPda,
        gameState: gameStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  async initPlayer(tid: number, idx: number): Promise<string> {
    const { tournamentPda, gameStatePda, playerPdas } = this.getAllPdas(tid);
    return await this.program.methods
      .initPlayer(idx, idx)
      .accounts({
        authority: this.wallet.publicKey,
        tournament: tournamentPda,
        gameState: gameStatePda,
        playerState: playerPdas[idx],
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  async openMarket(tid: number): Promise<string> {
    const { tournamentPda, marketPda } = this.getAllPdas(tid);
    return await this.program.methods
      .openMarket(new anchor.BN(tid))
      .accounts({
        authority: this.wallet.publicKey,
        tournament: tournamentPda,
        market: marketPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  async delegateTournament(tid: number): Promise<string> {
    const { tournamentPda } = this.getAllPdas(tid);
    return await this.program.methods
      .delegateTournament(new anchor.BN(tid))
      .accounts({ payer: this.wallet.publicKey, pda: tournamentPda })
      .remainingAccounts([{ pubkey: ER_VALIDATOR, isSigner: false, isWritable: false }])
      .rpc();
  }

  async delegatePlayer(tid: number, idx: number): Promise<string> {
    const { gameStatePda, playerPdas } = this.getAllPdas(tid);
    return await this.program.methods
      .delegatePlayer(idx)
      .accounts({ payer: this.wallet.publicKey, gameState: gameStatePda, pda: playerPdas[idx] })
      .remainingAccounts([{ pubkey: ER_VALIDATOR, isSigner: false, isWritable: false }])
      .rpc();
  }

  async delegateGame(tid: number): Promise<string> {
    const { tournamentPda, gameStatePda } = this.getAllPdas(tid);
    return await this.program.methods
      .delegateGame()
      .accounts({ payer: this.wallet.publicKey, tournament: tournamentPda, pda: gameStatePda })
      .remainingAccounts([{ pubkey: ER_VALIDATOR, isSigner: false, isWritable: false }])
      .rpc();
  }

  async delegateMarket(tid: number): Promise<string> {
    const { tournamentPda, marketPda } = this.getAllPdas(tid);
    return await this.program.methods
      .delegateMarket()
      .accounts({ payer: this.wallet.publicKey, tournament: tournamentPda, pda: marketPda })
      .remainingAccounts([{ pubkey: ER_VALIDATOR, isSigner: false, isWritable: false }])
      .rpc();
  }

  async delegateAll(tid: number): Promise<void> {
    for (let i = 0; i < MAX_PLAYERS; i++) {
      console.log(`[Delegate] Player ${i}...`);
      await this.delegatePlayer(tid, i);
    }
    console.log("[Delegate] Game state...");
    await this.delegateGame(tid);
    console.log("[Delegate] Market...");
    await this.delegateMarket(tid);
    console.log("[Delegate] Tournament...");
    await this.delegateTournament(tid);
    console.log("[Delegate] All 8 accounts delegated to ER");
  }

  // ── ER instructions (fast game loop) ────────────────────────────────────

  async startHand(tid: number, randomness: number[]): Promise<string> {
    const { tournamentPda, gameStatePda } = this.getAllPdas(tid);
    try {
      const sig = await this.erProgram.methods
        .startHand(randomness)
        .accounts({ authority: this.wallet.publicKey, tournament: tournamentPda, gameState: gameStatePda })
        .rpc();
      console.log("[ER] startHand SUCCESS:", sig.slice(0, 20));
      return sig;
    } catch (erErr: any) {
      console.warn("[ER] startHand ER error:", JSON.stringify({
        message: erErr.message?.slice(0, 200),
        code: erErr.code,
        logs: erErr.logs?.slice(-3),
      }));
      console.warn("[ER] Trying base layer fallback...");
      return await this.program.methods
        .startHand(randomness)
        .accounts({ authority: this.wallet.publicKey, tournament: tournamentPda, gameState: gameStatePda })
        .rpc();
    }
  }

  private async erWithFallback(label: string, erCall: () => Promise<string>, baseCall: () => Promise<string>): Promise<string> {
    try {
      return await erCall();
    } catch (erErr: any) {
      console.warn(`[ER] ${label} failed, trying base layer:`, erErr.message?.slice(0, 80));
      return await baseCall();
    }
  }

  async dealHoleCards(tid: number, idx: number): Promise<string> {
    const { tournamentPda, gameStatePda, playerPdas } = this.getAllPdas(tid);
    const accs = { authority: this.wallet.publicKey, gameState: gameStatePda, tournament: tournamentPda, playerState: playerPdas[idx] };
    return this.erWithFallback("dealHoleCards",
      () => this.erProgram.methods.dealHoleCards(idx).accounts(accs).rpc(),
      () => this.program.methods.dealHoleCards(idx).accounts(accs).rpc()
    );
  }

  async postBlinds(tid: number, sbIdx: number, bbIdx: number): Promise<string> {
    const { gameStatePda, playerPdas } = this.getAllPdas(tid);
    const accs = { authority: this.wallet.publicKey, gameState: gameStatePda, smallBlindPlayer: playerPdas[sbIdx], bigBlindPlayer: playerPdas[bbIdx] };
    return this.erWithFallback("postBlinds",
      () => this.erProgram.methods.postBlinds().accounts(accs).rpc(),
      () => this.program.methods.postBlinds().accounts(accs).rpc()
    );
  }

  async playerAction(tid: number, idx: number, actionType: number, raiseAmt: number): Promise<string> {
    const { gameStatePda, playerPdas } = this.getAllPdas(tid);
    const accs = { authority: this.wallet.publicKey, gameState: gameStatePda, playerState: playerPdas[idx] };
    return this.erWithFallback("playerAction",
      () => this.erProgram.methods.playerAction(actionType, new anchor.BN(raiseAmt)).accounts(accs).rpc(),
      () => this.program.methods.playerAction(actionType, new anchor.BN(raiseAmt)).accounts(accs).rpc()
    );
  }

  async advanceRound(tid: number): Promise<string> {
    const { gameStatePda } = this.getAllPdas(tid);
    const accs = { authority: this.wallet.publicKey, gameState: gameStatePda };
    return this.erWithFallback("advanceRound",
      () => this.erProgram.methods.advanceRound().accounts(accs).rpc(),
      () => this.program.methods.advanceRound().accounts(accs).rpc()
    );
  }

  async showdown(tid: number): Promise<string> {
    const { tournamentPda, gameStatePda, playerPdas } = this.getAllPdas(tid);
    const accs = {
      authority: this.wallet.publicKey, gameState: gameStatePda, tournament: tournamentPda,
      player0: playerPdas[0], player1: playerPdas[1], player2: playerPdas[2],
      player3: playerPdas[3], player4: playerPdas[4],
    };
    return this.erWithFallback("showdown",
      () => this.erProgram.methods.showdown().accounts(accs).rpc(),
      () => this.program.methods.showdown().accounts(accs).rpc()
    );
  }

  async resolveMarket(tid: number): Promise<string> {
    const { tournamentPda, marketPda } = this.getAllPdas(tid);
    return await this.erProgram.methods
      .resolveMarket()
      .accounts({ authority: this.wallet.publicKey, tournament: tournamentPda, market: marketPda })
      .rpc();
  }

  async undelegateGame(tid: number): Promise<string> {
    const { gameStatePda } = this.getAllPdas(tid);
    return await this.erProgram.methods
      .undelegateGame()
      .accounts({ payer: this.wallet.publicKey, gameState: gameStatePda })
      .rpc();
  }

  async undelegateMarket(tid: number): Promise<string> {
    const { marketPda } = this.getAllPdas(tid);
    return await this.erProgram.methods
      .undelegateMarket()
      .accounts({ payer: this.wallet.publicKey, market: marketPda })
      .rpc();
  }

  // ── VRF-based hand start ────────────────────────────────────────────────

  getVrfResultPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vrf_result"), this.wallet.publicKey.toBuffer()],
      PROGRAM_ID
    );
    return pda;
  }

  async requestStartHandVrf(clientSeed: number): Promise<string> {
    const [programIdentity] = PublicKey.findProgramAddressSync(
      [Buffer.from("identity")],
      PROGRAM_ID
    );
    const vrfResultPda = this.getVrfResultPda();

    const accs = {
      authority: this.wallet.publicKey,
      vrfResult: vrfResultPda,
      oracleQueue: VRF_ORACLE_QUEUE,
      programIdentity,
      vrfProgram: VRF_PROGRAM,
      slotHashes: new PublicKey("SysvarS1otHashes111111111111111111111111111"),
      systemProgram: anchor.web3.SystemProgram.programId,
    };

    // VRF request goes to BASE layer where the oracle queue lives.
    // Callback writes randomness to vrfResult PDA (also on base layer).
    const sig = await this.program.methods
      .requestStartHand(clientSeed)
      .accounts(accs)
      .rpc();
    console.log("[VRF] Request sent on base layer:", sig.slice(0, 20));
    return sig;
  }

  async waitForVrfRandomness(timeoutMs = 15000): Promise<number[]> {
    const vrfResultPda = this.getVrfResultPda();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const result = await this.program.account.vrfResult.fetch(vrfResultPda);
        if ((result as any).fulfilled) {
          const randomness = Array.from((result as any).randomness as Uint8Array);
          console.log("[VRF] Randomness received from oracle:", randomness.slice(0, 4).join(",") + "...");
          return randomness;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 800));
    }
    throw new Error(`VRF callback timeout after ${timeoutMs}ms`);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  actionToNumber(action: string): number {
    return ({ fold: 0, check: 1, call: 2, raise: 3, all_in: 4 } as Record<string, number>)[action] ?? 2;
  }

  static generateRandomness(): number[] {
    return Array.from(crypto.randomBytes(32));
  }
}
