# AI Poker Arena

5 AI models play Texas Hold'em poker on Solana, powered by MagicBlock's Ephemeral Rollups. Watch GPT-5.4, Claude Sonnet 4.6, Gemini 3.1 Pro, Llama 4 Scout, and Grok 3 battle it out in real-time tournaments while you bet on the winner through an on-chain prediction market.

> Built for the [Solana Blitz Hackathon v1](https://hackathon.magicblock.app/) by MagicBlock (March 6-8, 2026)

**Live at:** [frontend-production-e2e6.up.railway.app](https://frontend-production-e2e6.up.railway.app)

https://github.com/user-attachments/assets/demo-placeholder

## What it does

Tournaments run continuously. Five AI models sit at a virtual poker table, each one calling a different LLM through OpenRouter to decide whether to fold, call, raise, or go all-in. Every action, every card dealt, every chip moved is a real Solana transaction running on MagicBlock's Ephemeral Rollups for sub-second speed and zero fees.

Between tournaments, there's a betting window where anyone with a Solana wallet can place predictions on which AI will win the next one. When the tournament ends, the prediction market resolves and payouts go out on-chain.

The frontend streams everything live over WebSockets: the poker table with animated cards, AI reasoning for each decision (with optional text-to-speech via ElevenLabs), chip standings, and a real-time feed of every on-chain transaction.

## How MagicBlock is used

| Product | What we do with it |
|---------|-------------------|
| **Ephemeral Rollups** | All gameplay runs on ER. Game state is delegated at the start of each tournament and undelegated back to base layer when it ends. This gives us sub-second block times and zero transaction fees for the ~100+ transactions per tournament. |
| **VRF (Verifiable Randomness)** | Every hand starts with a VRF request to get provably fair randomness for shuffling and dealing. The 32 bytes of randomness go through a Fisher-Yates shuffle. |
| **Delegation / Undelegation** | Tournament state, game state, and all 5 player accounts are delegated to ER at the start and committed + undelegated at the end. That's 7 accounts round-tripped between base layer and ER per tournament. |

## Architecture

```
Frontend (Next.js)                    AI Backend (Express + WebSocket)
  |                                      |
  | WebSocket (game state, AI decisions) |
  |<------------------------------------>|
  |                                      |
  | Solana wallet (predictions)          | OpenRouter (5 LLMs)
  |----> Base Layer                      |----> GPT-5.4, Claude 4.6,
  |      - create tournament             |      Gemini 3.1, Llama 4,
  |      - open/resolve market           |      Grok 3
  |      - place predictions             |
  |      - claim winnings                | Solana Program (Anchor)
  |                                      |----> Base Layer (setup, delegation)
  |                                      |----> Ephemeral Rollup (gameplay)
  |                                      |      - start hand (VRF)
  |                                      |      - deal cards
  |                                      |      - post blinds
  |                                      |      - player actions
  |                                      |      - advance rounds
  |                                      |      - showdown
```

## AI Players

| Name | Model | Via |
|------|-------|-----|
| GPT-5.4 | `openai/gpt-5.4` | OpenRouter |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4.6` | OpenRouter |
| Gemini 3.1 Pro | `google/gemini-3.1-pro-preview` | OpenRouter |
| Llama 4 Scout | `meta-llama/llama-4-scout` | OpenRouter |
| Grok 3 | `x-ai/grok-3` | OpenRouter |

Each AI gets the full game context (their hole cards, community cards, pot size, opponent chip counts, betting history) and responds with a JSON decision. They don't know they're playing against other AIs. Each one genuinely tries to win.

## Project Structure

```
ai-game-areana/
├── programs/ai-poker-arena/src/    Anchor program (Rust)
│   ├── lib.rs                      All instructions (tournament, hands, ER delegation, market)
│   ├── state.rs                    Account structs (Tournament, Game, Player, Market)
│   ├── poker.rs                    Hand evaluation, deck shuffling
│   ├── errors.rs                   Custom error codes
│   └── constants.rs                Seeds, limits, round/action types
├── ai-backend/src/                 Tournament orchestrator (TypeScript)
│   ├── index.ts                    Express + WS server, game loop
│   ├── poker-client.ts             Solana program client (base + ER)
│   ├── hand-eval.ts                Server-side hand evaluation
│   └── agents/
│       ├── base.ts                 Prompt builder, decision parser
│       └── openrouter.ts           OpenRouter client for all 5 models
├── app/frontend/src/               Next.js frontend
│   ├── app/page.tsx                Main page
│   ├── components/
│   │   ├── PokerTable.tsx          Poker table with felt, cards, chips
│   │   ├── AIPlayerSeat.tsx        Player seats with avatars and actions
│   │   ├── PokerCard.tsx           SVG card rendering
│   │   ├── PredictionMarket.tsx    Betting UI
│   │   ├── TableChat.tsx           AI reasoning chat
│   │   ├── TournamentLog.tsx       Live action feed
│   │   └── TransactionFeed.tsx     On-chain TX explorer
│   ├── hooks/useAIVoice.ts         ElevenLabs TTS integration
│   └── lib/
│       ├── constants.ts            AI player configs, card utils
│       └── market-tx.ts            Prediction market transactions
├── tests/                          Anchor integration tests
├── Anchor.toml                     Anchor config (devnet)
└── Cargo.toml                      Rust workspace
```

## Getting Started

### Prerequisites

- Solana CLI (v2.2+)
- Anchor CLI (v0.30+)
- Rust (1.85+)
- Node.js (20+)

### 1. Build the Solana program

```bash
anchor build
```

### 2. Deploy to devnet

```bash
solana config set --url devnet
solana airdrop 2
anchor deploy --provider.cluster devnet
```

### 3. Start the AI backend

```bash
cd ai-backend
cp .env.example .env
# Fill in your API keys (see below)
npm install
npm run dev
```

### 4. Start the frontend

```bash
cd app/frontend
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000) and you should see the poker table.

### Environment Variables

The backend needs these in `ai-backend/.env`:

```env
# Required: single key for all 5 AI models
OPENROUTER_API_KEY=sk-or-v1-...

# Solana RPCs
SOLANA_RPC_URL=https://api.devnet.solana.com
ER_RPC_URL=https://devnet-us.magicblock.app

# Set to true once program is deployed
ON_CHAIN=true

# Wallet (pick one)
WALLET_PRIVATE_KEY=[1,2,3,...]    # JSON array of bytes
# WALLET_PATH=~/.config/solana/id.json

# Optional: AI voice narration
# ELEVENLABS_API_KEY=sk_...

# Server
PORT=3001
HAND_DELAY_MS=5000
ACTION_DELAY_MS=3000
BETTING_WINDOW_MS=15000
COOLDOWN_MS=30000
```

The frontend optionally takes:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
```

## How a Tournament Works

1. Backend creates a tournament and 5 player accounts on Solana base layer
2. A prediction market opens and users have a window to place bets
3. All 7 accounts (tournament, game, 5 players) get delegated to an Ephemeral Rollup
4. For each hand:
   - VRF request gets provably fair randomness from MagicBlock's oracle
   - Deck is shuffled using Fisher-Yates with the VRF bytes
   - Hole cards are dealt to each player
   - Blinds are posted
   - Each AI gets the game state, calls its LLM, and submits an action (all as ER transactions)
   - Rounds advance through preflop, flop, turn, river
   - Showdown evaluates the best 5-card hand from 7 cards and distributes the pot
5. After 30 hands (or when only 1 player has chips), the tournament ends
6. All accounts get undelegated back to base layer
7. Prediction market resolves and winners can claim payouts

## On-Chain Instructions

| Instruction | Layer | What it does |
|------------|-------|-------------|
| `create_tournament` | Base | Initialize tournament + game state PDAs |
| `init_player` | Base | Create player state PDA for each AI |
| `open_market` | Base | Open prediction market for betting |
| `place_prediction` | Base | User bets SOL on an AI to win |
| `delegate_game` / `delegate_player` / `delegate_tournament` | Base | Move accounts to Ephemeral Rollup |
| `start_hand` | ER | Request VRF, shuffle deck, begin hand |
| `deal_hole_cards` | ER | Deal 2 cards to a player |
| `post_blinds` | ER | Post small and big blinds |
| `player_action` | ER | AI submits fold/check/call/raise/all-in |
| `advance_round` | ER | Deal community cards (flop/turn/river) |
| `showdown` | ER | Evaluate hands, distribute pot |
| `undelegate_tournament` / `undelegate_player` | Base | Commit state and return accounts to base layer |
| `resolve_market` | Base | Determine winner, calculate payouts |
| `claim_winnings` | Base | Users withdraw prediction winnings |
| `close_market` | Base | Close market and reclaim rent |

## Deployment

Both services are deployed on Railway:

```bash
# Backend
cd ai-backend
railway up --detach

# Frontend
cd app/frontend
railway up --detach
```

## Tech Stack

- **Solana Program**: Rust, Anchor, `ephemeral-rollups-sdk`, `ephemeral-vrf-sdk`
- **Backend**: TypeScript, Express, WebSocket, OpenRouter API
- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, Framer Motion
- **AI**: GPT-5.4, Claude Sonnet 4.6, Gemini 3.1 Pro, Llama 4 Scout, Grok 3 (all via OpenRouter)
- **Voice**: ElevenLabs TTS (optional)
- **Infra**: Railway (backend + frontend), Solana Devnet, MagicBlock Ephemeral Rollups

## License

MIT
