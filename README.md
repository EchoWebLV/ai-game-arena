# AI Poker Arena

**5 AI Models. Texas Hold'em. On-chain via Solana + MagicBlock.**

Watch GPT-4, Claude, Gemini, Llama, and Mistral battle it out in real-time poker tournaments — fully on Solana with MagicBlock's Ephemeral Rollups. Place predictions on which AI will win through an on-chain prediction market.

> Built for [Solana Blitz Hackathon v1](https://hackathon.magicblock.app/) by MagicBlock (March 6-8, 2026)

---

## MagicBlock Integration

This project integrates **6 MagicBlock products**:

| Product | Usage |
|---------|-------|
| **Ephemeral Rollups (ER)** | Real-time, zero-fee poker gameplay. Game state is delegated to ER for sub-second block times during hands. |
| **Private Ephemeral Rollups (PER)** | AI hole cards are kept private via Trusted Execution Environment (TEE). No one can peek until showdown. |
| **VRF (Verifiable Randomness)** | Provably fair card shuffling and dealing using `ephemeral_vrf_sdk`. |
| **BOLT ECS Framework** | Game state modeled as Entity-Component-System: `GameState` component, `PlayerState` component, `GameAction` system. |
| **Session Keys** | AI agents play seamlessly without repeated wallet signing. |
| **Magic Actions** | On commit from ER, automatically update leaderboard and prediction market on base layer. |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Next.js Frontend                          │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────┐   │
│  │  Poker Table  │  │ Prediction Mkt  │  │  Live Feed    │   │
│  └──────────────┘  └─────────────────┘  └───────────────┘   │
└──────────────────────┬───────────────────────────────────────┘
                       │ WebSocket / RPC
┌──────────────────────┴───────────────────────────────────────┐
│              MagicBlock Magic Router                          │
│         (auto-routes to ER or base layer)                    │
└──────────────────────┬───────────────────────────────────────┘
                       │
  ┌────────────────────┼────────────────────┐
  │                    │                    │
  ▼                    ▼                    ▼
┌──────────┐  ┌──────────────┐  ┌──────────────────┐
│ Solana   │  │ Ephemeral    │  │ Private ER (TEE) │
│ Base     │  │ Rollup       │  │ Hole Cards       │
│ Layer    │  │ (Gameplay)   │  │ Hidden State     │
│          │  │ Zero-fee     │  │                  │
│ - Tourn. │  │ Sub-second   │  │ VRF Dealing      │
│ - Market │  │ Real-time    │  │                  │
└──────────┘  └──────────────┘  └──────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    AI Backend (Express)                       │
│  ┌─────────┐ ┌────────┐ ┌────────┐ ┌───────┐ ┌──────────┐  │
│  │ GPT-4   │ │ Claude │ │ Gemini │ │ Llama │ │ Mistral  │  │
│  │ Shark   │ │ Strat. │ │ Wild.  │ │ Grind │ │ Bluffer  │  │
│  └─────────┘ └────────┘ └────────┘ └───────┘ └──────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## AI Players

| # | Name | Model | Personality |
|---|------|-------|-------------|
| 0 | GPT-4 Shark | GPT-4o | Aggressive, GTO-based, mathematical |
| 1 | Claude Strategist | Claude Sonnet | Balanced, adaptive, calculated risks |
| 2 | Gemini Wildcard | Gemini 2.0 Flash | Unpredictable, creative, mixed styles |
| 3 | Llama Grinder | Llama 3.1 70B | Tight-aggressive, patient, value-focused |
| 4 | Mistral Bluffer | Mistral Large | Loose-aggressive, frequent bluffs |

## Project Structure

```
ai-game-areana/
├── programs/
│   └── ai-poker-arena/          # Main Anchor program
│       └── src/
│           ├── lib.rs            # Instructions: tournament, hands, betting, ER delegation
│           ├── state.rs          # Account structs: Tournament, Game, Player, Market
│           ├── poker.rs          # Hand evaluation (5-card from 7-card)
│           ├── errors.rs         # Custom error codes
│           └── constants.rs      # Seeds, action types, round constants
├── programs-ecs/
│   ├── components/
│   │   ├── game-state/           # BOLT ECS: table state component
│   │   └── player-state/         # BOLT ECS: player state component
│   └── systems/
│       └── game-action/          # BOLT ECS: game action system
├── app/frontend/                 # Next.js frontend
│   └── src/
│       ├── app/page.tsx          # Main game page
│       ├── components/
│       │   ├── PokerTable.tsx    # Poker table with felt design
│       │   ├── AIPlayerSeat.tsx  # Individual AI player seat
│       │   ├── PokerCard.tsx     # Card rendering
│       │   ├── PredictionMarket.tsx  # Betting interface
│       │   └── TournamentLog.tsx # Live action feed
│       └── lib/constants.ts      # AI player configs
├── ai-backend/                   # AI decision engine
│   └── src/
│       ├── index.ts              # Express server + tournament orchestrator
│       ├── poker-client.ts       # Solana program client
│       └── agents/
│           ├── base.ts           # Base agent + poker prompt builder
│           ├── gpt4.ts           # OpenAI GPT-4 agent
│           ├── claude.ts         # Anthropic Claude agent
│           ├── gemini.ts         # Google Gemini agent
│           ├── llama.ts          # Meta Llama agent (via OpenRouter)
│           └── mistral.ts        # Mistral agent (via OpenRouter)
├── tests/                        # Integration tests
├── Anchor.toml                   # Anchor workspace config
└── Cargo.toml                    # Rust workspace
```

## Quick Start

### Prerequisites

- Solana CLI >= 2.2
- Anchor CLI >= 0.30
- Rust >= 1.85
- Node.js >= 20
- BOLT CLI (`npm install -g @magicblock-labs/bolt-cli`)

### 1. Build Programs

```bash
# Build all Solana programs
anchor build

# Or using BOLT CLI
bolt build
```

### 2. Run AI Backend

```bash
cd ai-backend
cp .env.example .env
# Edit .env with your API keys

npm install
npm run dev
```

### 3. Run Frontend

```bash
cd app/frontend
npm install
npm run dev
```

### 4. Deploy to Devnet

```bash
# Set cluster to devnet
solana config set --url https://devnet-router.magicblock.app

# Deploy
anchor deploy

# Run tests
anchor test --skip-build --skip-deploy --skip-local-validator
```

## Game Flow

1. **Create Tournament** — Initialize on Solana base layer
2. **Open Prediction Market** — Users bet on which AI wins
3. **Delegate to ER** — Game state moves to Ephemeral Rollup for speed
4. **Play Hands** — Each hand:
   - VRF shuffles deck (provably fair)
   - Hole cards dealt via Private ER (hidden in TEE)
   - AI agents make decisions via API calls
   - Betting runs on ER (zero fees, sub-second)
   - Showdown reveals cards, awards pot
   - Magic Action commits results to base layer
5. **Tournament Ends** — Winner declared, state undelegated
6. **Resolve Market** — Prediction payouts distributed

## On-Chain Programs

### Main Instructions

| Instruction | Description |
|------------|-------------|
| `create_tournament` | Initialize tournament with 5 AI players |
| `init_player` | Set up each AI player state |
| `open_market` | Open prediction market for bets |
| `place_prediction` | User bets SOL on AI winner |
| `start_hand` | Begin hand with VRF randomness |
| `deal_hole_cards` | Deal 2 cards to player (private via PER) |
| `post_blinds` | Post small/big blinds |
| `player_action` | AI submits fold/check/call/raise/all-in |
| `advance_round` | Deal flop/turn/river |
| `showdown` | Evaluate hands, distribute pot |
| `resolve_market` | Resolve prediction market |
| `claim_winnings` | Users claim prediction payouts |
| `delegate_game` | Delegate game state to ER |
| `undelegate_game` | Commit and undelegate from ER |

## Tech Stack

- **Smart Contracts**: Rust + Anchor + BOLT ECS + `ephemeral-rollups-sdk` + `ephemeral_vrf_sdk`
- **Frontend**: Next.js 15 + React + Tailwind CSS
- **AI Backend**: Express + TypeScript + OpenAI/Anthropic/Google AI SDKs
- **Connection**: MagicBlock Magic Router for automatic ER/base-layer routing
- **State**: WebSocket subscriptions for real-time game updates

## License

MIT
