use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::{commit_accounts, commit_and_undelegate_accounts};
use ephemeral_vrf_sdk::anchor::vrf;
use ephemeral_vrf_sdk::instructions::{create_request_randomness_ix, RequestRandomnessParams};
use ephemeral_vrf_sdk::types::SerializableAccountMeta;

pub mod constants;
pub mod errors;
pub mod poker;
pub mod state;

use constants::*;
use errors::PokerError;
use state::*;

declare_id!("BJSCnCFb475uHPTi6Lee2E5SU2GToyRQEgqHJUbsN5ob");

#[ephemeral]
#[program]
pub mod ai_poker_arena {
    use super::*;

    /// Create a new AI poker tournament with 5 AI players.
    pub fn create_tournament(
        ctx: Context<CreateTournament>,
        tournament_id: u64,
        starting_chips: u64,
        small_blind: u64,
        big_blind: u64,
        ai_models: [u8; MAX_PLAYERS],
    ) -> Result<()> {
        let tournament = &mut ctx.accounts.tournament;
        tournament.id = tournament_id;
        tournament.authority = ctx.accounts.authority.key();
        tournament.status = STATUS_WAITING;
        tournament.blind_level = 0;
        tournament.small_blind = small_blind;
        tournament.big_blind = big_blind;
        tournament.hands_played = 0;
        tournament.remaining_players = MAX_PLAYERS as u8;
        tournament.starting_chips = starting_chips;
        tournament.ai_models = ai_models;
        tournament.winner = None;
        tournament.game_state = ctx.accounts.game_state.key();
        tournament.bump = ctx.bumps.tournament;

        for i in 0..MAX_PLAYERS {
            tournament.player_chips[i] = starting_chips;
            tournament.player_active[i] = true;
        }

        let game = &mut ctx.accounts.game_state;
        game.tournament = tournament.key();
        game.hand_number = 0;
        game.deck = [0u8; DECK_SIZE];
        game.deck_index = 0;
        game.community_cards = [CARD_NOT_DEALT; COMMUNITY_CARDS];
        game.pot = 0;
        game.current_round = ROUND_PREFLOP;
        game.dealer_idx = 0;
        game.current_turn = 0;
        game.small_blind = small_blind;
        game.big_blind = big_blind;
        game.last_raise = big_blind;
        game.num_active_in_hand = MAX_PLAYERS as u8;
        game.num_acted_this_round = 0;
        game.last_raiser = MAX_PLAYERS as u8;
        game.status = STATUS_WAITING;
        game.bump = ctx.bumps.game_state;

        msg!("Tournament {} created with {} starting chips", tournament_id, starting_chips);
        Ok(())
    }

    /// Initialize a player state account for an AI player.
    pub fn init_player(
        ctx: Context<InitPlayer>,
        player_idx: u8,
        ai_model_id: u8,
    ) -> Result<()> {
        require!(
            (player_idx as usize) < MAX_PLAYERS,
            PokerError::InvalidAiModel
        );
        let player = &mut ctx.accounts.player_state;
        player.game = ctx.accounts.game_state.key();
        player.player_idx = player_idx;
        player.chips = ctx.accounts.tournament.starting_chips;
        player.current_bet = 0;
        player.total_bet_this_hand = 0;
        player.is_active = true;
        player.is_folded = false;
        player.is_all_in = false;
        player.hole_card_1 = CARD_NOT_DEALT;
        player.hole_card_2 = CARD_NOT_DEALT;
        player.ai_model_id = ai_model_id;
        player.has_acted = false;
        player.bump = ctx.bumps.player_state;

        msg!("Player {} initialized with AI model {}", player_idx, ai_model_id);
        Ok(())
    }

    /// Open prediction market for this tournament.
    pub fn open_market(ctx: Context<OpenMarket>, tournament_id: u64) -> Result<()> {
        let market = &mut ctx.accounts.market;
        market.tournament = ctx.accounts.tournament.key();
        market.authority = ctx.accounts.authority.key();
        market.total_pool = 0;
        market.yes_bets_per_ai = [0u64; MAX_PLAYERS];
        market.no_bets_per_ai = [0u64; MAX_PLAYERS];
        market.is_open = true;
        market.is_resolved = false;
        market.winning_ai = None;
        market.bump = ctx.bumps.market;

        msg!("Prediction market opened for tournament {}", tournament_id);
        Ok(())
    }

    /// Place a yes/no prediction bet on an AI. Supports multiple bets (accumulates).
    pub fn place_prediction(
        ctx: Context<PlacePrediction>,
        ai_model_idx: u8,
        is_yes: bool,
        amount: u64,
    ) -> Result<()> {
        require!(
            (ai_model_idx as usize) < MAX_PLAYERS,
            PokerError::InvalidAiModel
        );
        require!(amount > 0, PokerError::InvalidBetAmount);
        require!(ctx.accounts.market.is_open, PokerError::MarketClosed);

        let transfer_ix = anchor_lang::system_program::Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.market.to_account_info(),
        };
        let transfer_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_ix,
        );
        anchor_lang::system_program::transfer(transfer_ctx, amount)?;

        let market = &mut ctx.accounts.market;
        market.total_pool = market
            .total_pool
            .checked_add(amount)
            .ok_or(PokerError::ArithmeticOverflow)?;

        if is_yes {
            market.yes_bets_per_ai[ai_model_idx as usize] = market.yes_bets_per_ai[ai_model_idx as usize]
                .checked_add(amount)
                .ok_or(PokerError::ArithmeticOverflow)?;
        } else {
            market.no_bets_per_ai[ai_model_idx as usize] = market.no_bets_per_ai[ai_model_idx as usize]
                .checked_add(amount)
                .ok_or(PokerError::ArithmeticOverflow)?;
        }

        let user_bet = &mut ctx.accounts.user_bet;
        user_bet.user = ctx.accounts.user.key();
        user_bet.market = market.key();
        user_bet.ai_model_idx = ai_model_idx;
        user_bet.is_yes = is_yes;
        user_bet.amount = user_bet.amount.checked_add(amount).ok_or(PokerError::ArithmeticOverflow)?;
        user_bet.is_claimed = false;
        user_bet.bump = ctx.bumps.user_bet;

        msg!(
            "User {} bet {} lamports {} on AI #{} (total: {})",
            ctx.accounts.user.key(),
            amount,
            if is_yes { "YES" } else { "NO" },
            ai_model_idx,
            user_bet.amount
        );
        Ok(())
    }

    /// Start a new hand: shuffle the deck using provided randomness and deal hole cards.
    /// In production, this would be the VRF callback. For the hackathon, we accept
    /// randomness directly and also support VRF integration.
    pub fn start_hand(
        ctx: Context<StartHand>,
        randomness: [u8; 32],
    ) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        let tournament = &ctx.accounts.tournament;

        require!(
            tournament.status == STATUS_ACTIVE || tournament.status == STATUS_WAITING,
            PokerError::TournamentComplete
        );

        game.deck = poker::shuffle_deck(&randomness);
        game.deck_index = 0;
        game.community_cards = [CARD_NOT_DEALT; COMMUNITY_CARDS];
        game.pot = 0;
        game.current_round = ROUND_PREFLOP;
        game.hand_number += 1;
        game.last_raise = game.big_blind;
        game.num_acted_this_round = 0;
        game.last_raiser = MAX_PLAYERS as u8;
        game.status = STATUS_ACTIVE;

        let mut active_count = 0u8;
        for i in 0..MAX_PLAYERS {
            game.player_active[i] = tournament.player_active[i];
            game.player_folded[i] = !tournament.player_active[i];
            game.player_all_in[i] = false;
            if tournament.player_active[i] {
                active_count += 1;
            }
        }
        game.num_active_in_hand = active_count;

        game.dealer_idx = ((game.hand_number - 1) % MAX_PLAYERS as u64) as u8;

        msg!(
            "Hand #{} started. Dealer: AI #{}. {} players active.",
            game.hand_number,
            game.dealer_idx,
            active_count
        );
        Ok(())
    }

    /// Request VRF randomness. The callback writes to a base-layer VrfResult PDA
    /// so the oracle doesn't need to touch delegated ER accounts.
    pub fn request_start_hand(
        ctx: Context<RequestStartHand>,
        client_seed: u8,
    ) -> Result<()> {
        let vrf_result = &mut ctx.accounts.vrf_result;
        vrf_result.fulfilled = false;
        vrf_result.authority = ctx.accounts.authority.key();

        let ix = create_request_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.authority.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::CallbackStartHand::DISCRIMINATOR.to_vec(),
            caller_seed: [client_seed; 32],
            accounts_metas: Some(vec![
                SerializableAccountMeta {
                    pubkey: ctx.accounts.vrf_result.key(),
                    is_signer: false,
                    is_writable: true,
                },
            ]),
            ..Default::default()
        });
        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.authority.to_account_info(), &ix)?;
        msg!("VRF randomness requested for next hand");
        Ok(())
    }

    /// VRF callback: receives verified randomness and starts the hand.
    /// Only callable by the VRF oracle program (enforced by vrf_program_identity signer).
    /// VRF oracle callback — stores verified randomness on base layer.
    /// The backend reads this and passes it to start_hand on the ER.
    pub fn callback_start_hand(
        ctx: Context<CallbackStartHand>,
        randomness: [u8; 32],
    ) -> Result<()> {
        let vrf_result = &mut ctx.accounts.vrf_result;
        vrf_result.randomness = randomness;
        vrf_result.fulfilled = true;
        msg!("VRF callback: randomness stored on base layer");
        Ok(())
    }

    /// Deal hole cards to a specific player from the shuffled deck.
    pub fn deal_hole_cards(
        ctx: Context<DealHoleCards>,
        _player_idx: u8,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        let player = &mut ctx.accounts.player_state;

        require!(game.status == STATUS_ACTIVE, PokerError::HandNotActive);
        require!(player.is_active, PokerError::PlayerNotActive);

        let idx = game.deck_index as usize;
        player.hole_card_1 = game.deck[idx];
        player.hole_card_2 = game.deck[idx + 1];
        game.deck_index += 2;

        player.is_folded = false;
        player.is_all_in = false;
        player.current_bet = 0;
        player.total_bet_this_hand = 0;
        player.has_acted = false;

        msg!(
            "Dealt cards to player {} (cards hidden on-chain via PER)",
            player.player_idx
        );
        Ok(())
    }

    /// Post blinds for small blind and big blind players.
    pub fn post_blinds(ctx: Context<PostBlinds>) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        let sb_player = &mut ctx.accounts.small_blind_player;
        let bb_player = &mut ctx.accounts.big_blind_player;

        require!(game.status == STATUS_ACTIVE, PokerError::HandNotActive);

        let sb_amount = game.small_blind.min(sb_player.chips);
        sb_player.chips -= sb_amount;
        sb_player.current_bet = sb_amount;
        sb_player.total_bet_this_hand = sb_amount;
        game.pot += sb_amount;

        let bb_amount = game.big_blind.min(bb_player.chips);
        bb_player.chips -= bb_amount;
        bb_player.current_bet = bb_amount;
        bb_player.total_bet_this_hand = bb_amount;
        game.pot += bb_amount;

        if sb_player.chips == 0 {
            sb_player.is_all_in = true;
            game.player_all_in[sb_player.player_idx as usize] = true;
        }
        if bb_player.chips == 0 {
            bb_player.is_all_in = true;
            game.player_all_in[bb_player.player_idx as usize] = true;
        }

        // First to act is the first non-folded, non-all-in player after BB
        let bb_idx = bb_player.player_idx;
        game.current_turn = game.next_active_turn(bb_idx);
        game.num_acted_this_round = 0;
        game.last_raiser = bb_idx;

        msg!(
            "Blinds posted: SB={} (AI #{}), BB={} (AI #{})",
            sb_amount,
            sb_player.player_idx,
            bb_amount,
            bb_player.player_idx
        );
        Ok(())
    }

    /// AI player submits an action: fold, check, call, raise, or all-in.
    pub fn player_action(
        ctx: Context<PlayerAction>,
        action_type: u8,
        raise_amount: u64,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        let player = &mut ctx.accounts.player_state;

        require!(game.status == STATUS_ACTIVE, PokerError::HandNotActive);
        require!(!player.is_folded, PokerError::PlayerFolded);
        require!(player.is_active, PokerError::PlayerNotActive);
        require!(!player.is_all_in, PokerError::PlayerFolded);
        require!(
            game.current_turn == player.player_idx,
            PokerError::NotPlayerTurn
        );

        let call_amount = game.last_raise.saturating_sub(player.current_bet);

        let pidx = player.player_idx as usize;

        match action_type {
            ACTION_FOLD => {
                player.is_folded = true;
                game.player_folded[pidx] = true;
                game.num_active_in_hand -= 1;
                msg!("AI #{} folds", player.player_idx);
            }
            ACTION_CHECK => {
                require!(call_amount == 0, PokerError::InvalidAction);
                msg!("AI #{} checks", player.player_idx);
            }
            ACTION_CALL => {
                let amount = call_amount.min(player.chips);
                player.chips -= amount;
                player.current_bet += amount;
                player.total_bet_this_hand += amount;
                game.pot += amount;
                if player.chips == 0 {
                    player.is_all_in = true;
                    game.player_all_in[pidx] = true;
                }
                msg!("AI #{} calls {}", player.player_idx, amount);
            }
            ACTION_RAISE => {
                require!(raise_amount > call_amount, PokerError::InvalidBetAmount);
                let amount = raise_amount.min(player.chips);
                player.chips -= amount;
                player.current_bet += amount;
                player.total_bet_this_hand += amount;
                game.pot += amount;
                game.last_raise = player.current_bet;
                game.last_raiser = player.player_idx;
                game.num_acted_this_round = 0;
                if player.chips == 0 {
                    player.is_all_in = true;
                    game.player_all_in[pidx] = true;
                }
                msg!("AI #{} raises to {}", player.player_idx, player.current_bet);
            }
            ACTION_ALL_IN => {
                let amount = player.chips;
                game.pot += amount;
                player.current_bet += amount;
                player.total_bet_this_hand += amount;
                player.chips = 0;
                player.is_all_in = true;
                game.player_all_in[pidx] = true;
                if player.current_bet > game.last_raise {
                    game.last_raise = player.current_bet;
                    game.last_raiser = player.player_idx;
                    game.num_acted_this_round = 0;
                }
                msg!("AI #{} goes all-in for {}", player.player_idx, amount);
            }
            _ => return Err(PokerError::InvalidAction.into()),
        }

        player.has_acted = true;
        game.num_acted_this_round += 1;

        game.current_turn = game.next_active_turn(player.player_idx);

        msg!("Next turn: AI #{}", game.current_turn);
        Ok(())
    }

    /// Deal community cards for the next round (flop: 3 cards, turn: 1, river: 1).
    pub fn advance_round(ctx: Context<AdvanceRound>) -> Result<()> {
        let game = &mut ctx.accounts.game_state;

        require!(game.status == STATUS_ACTIVE, PokerError::HandNotActive);

        match game.current_round {
            ROUND_PREFLOP => {
                // Deal flop (3 cards), skip 1 burn card
                game.deck_index += 1; // burn
                game.community_cards[0] = game.deck[game.deck_index as usize];
                game.deck_index += 1;
                game.community_cards[1] = game.deck[game.deck_index as usize];
                game.deck_index += 1;
                game.community_cards[2] = game.deck[game.deck_index as usize];
                game.deck_index += 1;
                game.current_round = ROUND_FLOP;
                msg!(
                    "Flop: [{}, {}, {}]",
                    game.community_cards[0],
                    game.community_cards[1],
                    game.community_cards[2]
                );
            }
            ROUND_FLOP => {
                game.deck_index += 1; // burn
                game.community_cards[3] = game.deck[game.deck_index as usize];
                game.deck_index += 1;
                game.current_round = ROUND_TURN;
                msg!("Turn: [{}]", game.community_cards[3]);
            }
            ROUND_TURN => {
                game.deck_index += 1; // burn
                game.community_cards[4] = game.deck[game.deck_index as usize];
                game.deck_index += 1;
                game.current_round = ROUND_RIVER;
                msg!("River: [{}]", game.community_cards[4]);
            }
            _ => return Err(PokerError::CannotAdvancePastRiver.into()),
        }

        // Reset betting for new round
        game.num_acted_this_round = 0;
        game.last_raiser = MAX_PLAYERS as u8;

        // Set turn to first non-folded, non-all-in player after dealer
        game.current_turn = game.next_active_turn(game.dealer_idx);

        msg!("Round advanced. First to act: AI #{}", game.current_turn);
        Ok(())
    }

    /// Evaluate all hands and determine the winner. Distribute the pot.
    pub fn showdown(ctx: Context<Showdown>) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        let tournament = &mut ctx.accounts.tournament;

        require!(game.status == STATUS_ACTIVE, PokerError::HandNotActive);

        let p0 = &ctx.accounts.player_0;
        let p1 = &ctx.accounts.player_1;
        let p2 = &ctx.accounts.player_2;
        let p3 = &ctx.accounts.player_3;
        let p4 = &ctx.accounts.player_4;

        let players: [&PlayerState; MAX_PLAYERS] = [
            &p0, &p1, &p2, &p3, &p4,
        ];

        let mut best_score: u32 = 0;
        let mut winner_idx: u8 = MAX_PLAYERS as u8;
        let mut active_non_folded = 0u8;

        for (i, player) in players.iter().enumerate() {
            let is_folded = player.is_folded || game.player_folded[i];
            if !player.is_active || is_folded {
                continue;
            }
            active_non_folded += 1;

            if winner_idx == MAX_PLAYERS as u8 {
                winner_idx = i as u8;
            }

            if player.hole_card_1 == CARD_NOT_DEALT {
                continue;
            }

            let score = poker::evaluate_best_hand(
                [player.hole_card_1, player.hole_card_2],
                game.community_cards,
            );

            if score > best_score {
                best_score = score;
                winner_idx = i as u8;
            }
        }

        // If only 1 player left (everyone else folded), they win
        if active_non_folded == 1 {
            for (i, player) in players.iter().enumerate() {
                let is_folded = player.is_folded || game.player_folded[i];
                if player.is_active && !is_folded {
                    winner_idx = i as u8;
                    break;
                }
            }
        }

        // Safety: if no winner found, default to first active player
        if winner_idx == MAX_PLAYERS as u8 {
            for i in 0..MAX_PLAYERS {
                if tournament.player_active[i] {
                    winner_idx = i as u8;
                    break;
                }
            }
        }

        let pot = game.pot;

        // Update player chip totals, award pot to winner, and check eliminations
        for i in 0..MAX_PLAYERS {
            // Subtract what they bet, add back if winner
            let bet = players[i].total_bet_this_hand;
            if tournament.player_chips[i] >= bet {
                tournament.player_chips[i] -= bet;
            } else {
                tournament.player_chips[i] = 0;
            }

            if i == winner_idx as usize {
                tournament.player_chips[i] += pot;
            }

            if tournament.player_chips[i] == 0 && tournament.player_active[i] {
                tournament.player_active[i] = false;
                tournament.remaining_players -= 1;
                msg!("AI #{} eliminated!", i);
            }
        }

        tournament.hands_played += 1;
        game.status = STATUS_COMPLETE;

        // Check if tournament is over
        if tournament.remaining_players <= 1 {
            tournament.status = STATUS_COMPLETE;
            for i in 0..MAX_PLAYERS {
                if tournament.player_active[i] {
                    tournament.winner = Some(i as u8);
                    msg!("Tournament winner: AI #{}!", i);
                    break;
                }
            }
        }

        msg!(
            "Hand #{} complete. Winner: AI #{} wins pot of {}",
            game.hand_number,
            winner_idx,
            pot
        );
        Ok(())
    }

    /// Resolve the prediction market after tournament ends.
    /// Only the market authority (backend) can resolve. Accepts the winning AI index.
    pub fn resolve_market(ctx: Context<ResolveMarket>, winning_ai: u8) -> Result<()> {
        require!(
            (winning_ai as usize) < MAX_PLAYERS,
            PokerError::InvalidAiModel
        );

        let market = &mut ctx.accounts.market;
        market.is_open = false;
        market.is_resolved = true;
        market.winning_ai = Some(winning_ai);

        msg!("Market resolved! Winning AI: #{}", winning_ai);
        Ok(())
    }

    /// Claim prediction market winnings.
    /// YES bettors win if their AI won. NO bettors win if their AI lost.
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let market = &ctx.accounts.market;
        let user_bet = &mut ctx.accounts.user_bet;

        require!(market.is_resolved, PokerError::MarketNotResolved);
        require!(!user_bet.is_claimed, PokerError::AlreadyClaimed);

        let winning_ai = market.winning_ai.ok_or(PokerError::MarketNotResolved)?;
        let ai_idx = user_bet.ai_model_idx as usize;

        let user_won = if user_bet.is_yes {
            user_bet.ai_model_idx == winning_ai
        } else {
            user_bet.ai_model_idx != winning_ai
        };
        require!(user_won, PokerError::NoWinnings);

        // For a given AI's binary market: pool = yes_bets + no_bets
        let ai_pool = market.yes_bets_per_ai[ai_idx]
            .checked_add(market.no_bets_per_ai[ai_idx])
            .ok_or(PokerError::ArithmeticOverflow)?;
        let winning_side_pool = if user_bet.is_yes {
            market.yes_bets_per_ai[ai_idx]
        } else {
            market.no_bets_per_ai[ai_idx]
        };
        if winning_side_pool == 0 || ai_pool == 0 {
            return Err(PokerError::NoWinnings.into());
        }

        // Payout = (user_bet / winning_side_pool) * ai_pool
        let payout = (user_bet.amount as u128)
            .checked_mul(ai_pool as u128)
            .ok_or(PokerError::ArithmeticOverflow)?
            .checked_div(winning_side_pool as u128)
            .ok_or(PokerError::ArithmeticOverflow)? as u64;

        **ctx
            .accounts
            .market
            .to_account_info()
            .try_borrow_mut_lamports()? -= payout;
        **ctx
            .accounts
            .user
            .to_account_info()
            .try_borrow_mut_lamports()? += payout;

        user_bet.is_claimed = true;

        msg!("User claimed {} lamports", payout);
        Ok(())
    }

    /// Delegate tournament state to Ephemeral Rollup.
    pub fn delegate_tournament(ctx: Context<DelegateTournament>, tournament_id: u64) -> Result<()> {
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[
                TOURNAMENT_SEED,
                &tournament_id.to_le_bytes(),
            ],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        msg!("Tournament state delegated to Ephemeral Rollup");
        Ok(())
    }

    /// Delegate player state to Ephemeral Rollup.
    pub fn delegate_player(ctx: Context<DelegatePlayer>, _player_idx: u8) -> Result<()> {
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[
                PLAYER_STATE_SEED,
                ctx.accounts.game_state.key().as_ref(),
                &[_player_idx],
            ],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        msg!("Player {} state delegated to Ephemeral Rollup", _player_idx);
        Ok(())
    }

    /// Delegate game state to Ephemeral Rollup for real-time play.
    pub fn delegate_game(ctx: Context<DelegateGame>) -> Result<()> {
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[
                GAME_STATE_SEED,
                ctx.accounts.tournament.key().as_ref(),
            ],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        msg!("Game state delegated to Ephemeral Rollup");
        Ok(())
    }

    /// Commit game state and undelegate from ER back to base layer.
    pub fn undelegate_game(ctx: Context<UndelegateGame>) -> Result<()> {
        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.game_state.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        msg!("Game state undelegated from Ephemeral Rollup");
        Ok(())
    }

    /// Commit current game state from ER to base layer (without undelegating).
    pub fn commit_game_state(ctx: Context<UndelegateGame>) -> Result<()> {
        commit_accounts(
            &ctx.accounts.payer,
            vec![&ctx.accounts.game_state.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        msg!("Game state committed to base layer");
        Ok(())
    }

    /// Close the prediction market (authority only). Used if market needs to be
    /// closed without resolving (e.g. cancelled tournament).
    pub fn close_market(ctx: Context<ResolveMarket>, _winning_ai: u8) -> Result<()> {
        let market = &mut ctx.accounts.market;
        market.is_open = false;
        msg!("Market closed by authority");
        Ok(())
    }
}

// ─── Contexts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(tournament_id: u64)]
pub struct CreateTournament<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + TournamentState::LEN,
        seeds = [TOURNAMENT_SEED, &tournament_id.to_le_bytes()],
        bump
    )]
    pub tournament: Account<'info, TournamentState>,

    #[account(
        init,
        payer = authority,
        space = 8 + GameState::LEN,
        seeds = [GAME_STATE_SEED, tournament.key().as_ref()],
        bump
    )]
    pub game_state: Account<'info, GameState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(player_idx: u8)]
pub struct InitPlayer<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub tournament: Account<'info, TournamentState>,

    #[account(
        constraint = game_state.tournament == tournament.key()
    )]
    pub game_state: Account<'info, GameState>,

    #[account(
        init,
        payer = authority,
        space = 8 + PlayerState::LEN,
        seeds = [PLAYER_STATE_SEED, game_state.key().as_ref(), &[player_idx]],
        bump
    )]
    pub player_state: Account<'info, PlayerState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(tournament_id: u64)]
pub struct OpenMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [TOURNAMENT_SEED, &tournament_id.to_le_bytes()],
        bump = tournament.bump
    )]
    pub tournament: Account<'info, TournamentState>,

    #[account(
        init,
        payer = authority,
        space = 8 + MarketState::LEN,
        seeds = [MARKET_SEED, tournament.key().as_ref()],
        bump
    )]
    pub market: Account<'info, MarketState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(ai_model_idx: u8, is_yes: bool, amount: u64)]
pub struct PlacePrediction<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.tournament.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, MarketState>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserBet::LEN,
        seeds = [USER_BET_SEED, market.key().as_ref(), user.key().as_ref(), &[ai_model_idx], &[is_yes as u8]],
        bump
    )]
    pub user_bet: Account<'info, UserBet>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartHand<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub tournament: Account<'info, TournamentState>,

    #[account(
        mut,
        constraint = game_state.tournament == tournament.key()
    )]
    pub game_state: Account<'info, GameState>,
}

#[vrf]
#[derive(Accounts)]
pub struct RequestStartHand<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + VrfResult::LEN,
        seeds = [b"vrf_result", authority.key().as_ref()],
        bump,
    )]
    pub vrf_result: Account<'info, VrfResult>,

    /// CHECK: Oracle queue for VRF randomness
    #[account(mut, address = ephemeral_vrf_sdk::consts::DEFAULT_QUEUE)]
    pub oracle_queue: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CallbackStartHand<'info> {
    /// VRF program identity PDA — ensures only the VRF oracle can invoke this callback
    #[account(address = ephemeral_vrf_sdk::consts::VRF_PROGRAM_IDENTITY)]
    pub vrf_program_identity: Signer<'info>,

    #[account(mut)]
    pub vrf_result: Account<'info, VrfResult>,
}

#[derive(Accounts)]
#[instruction(player_idx: u8)]
pub struct DealHoleCards<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = game_state.tournament == tournament.key()
    )]
    pub game_state: Account<'info, GameState>,

    pub tournament: Account<'info, TournamentState>,

    #[account(
        mut,
        seeds = [PLAYER_STATE_SEED, game_state.key().as_ref(), &[player_idx]],
        bump = player_state.bump
    )]
    pub player_state: Account<'info, PlayerState>,
}

#[derive(Accounts)]
pub struct PostBlinds<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub game_state: Account<'info, GameState>,

    #[account(mut)]
    pub small_blind_player: Account<'info, PlayerState>,

    #[account(mut)]
    pub big_blind_player: Account<'info, PlayerState>,
}

#[derive(Accounts)]
pub struct PlayerAction<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub game_state: Account<'info, GameState>,

    #[account(
        mut,
        constraint = player_state.game == game_state.key()
    )]
    pub player_state: Account<'info, PlayerState>,
}

#[derive(Accounts)]
pub struct AdvanceRound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub game_state: Account<'info, GameState>,
}

#[derive(Accounts)]
pub struct Showdown<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub game_state: Account<'info, GameState>,

    #[account(mut)]
    pub tournament: Account<'info, TournamentState>,

    #[account(constraint = player_0.game == game_state.key())]
    pub player_0: Account<'info, PlayerState>,
    #[account(constraint = player_1.game == game_state.key())]
    pub player_1: Account<'info, PlayerState>,
    #[account(constraint = player_2.game == game_state.key())]
    pub player_2: Account<'info, PlayerState>,
    #[account(constraint = player_3.game == game_state.key())]
    pub player_3: Account<'info, PlayerState>,
    #[account(constraint = player_4.game == game_state.key())]
    pub player_4: Account<'info, PlayerState>,
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = market.authority == authority.key()
    )]
    pub market: Account<'info, MarketState>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub market: Account<'info, MarketState>,

    #[account(
        mut,
        constraint = user_bet.market == market.key(),
        constraint = user_bet.user == user.key()
    )]
    pub user_bet: Account<'info, UserBet>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateTournament<'info> {
    pub payer: Signer<'info>,

    /// CHECK: The tournament PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegatePlayer<'info> {
    pub payer: Signer<'info>,

    pub game_state: Account<'info, GameState>,

    /// CHECK: The player state PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateGame<'info> {
    pub payer: Signer<'info>,

    pub tournament: Account<'info, TournamentState>,

    /// CHECK: The game state PDA to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct UndelegateGame<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub game_state: Account<'info, GameState>,
}

