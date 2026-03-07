use anchor_lang::prelude::*;
use crate::constants::*;

#[account]
pub struct TournamentState {
    pub id: u64,
    pub authority: Pubkey,
    pub status: u8,
    pub blind_level: u8,
    pub small_blind: u64,
    pub big_blind: u64,
    pub hands_played: u64,
    pub remaining_players: u8,
    pub starting_chips: u64,
    pub player_chips: [u64; MAX_PLAYERS],
    pub player_active: [bool; MAX_PLAYERS],
    pub ai_models: [u8; MAX_PLAYERS],
    pub winner: Option<u8>,
    pub game_state: Pubkey,
    pub bump: u8,
}

impl TournamentState {
    pub const LEN: usize = 8 + 32 + 1 + 1 + 8 + 8 + 8 + 1 + 8
        + (8 * MAX_PLAYERS) + MAX_PLAYERS + MAX_PLAYERS
        + 2 + 32 + 1;
}

#[account]
pub struct GameState {
    pub tournament: Pubkey,
    pub hand_number: u64,
    pub deck: [u8; DECK_SIZE],
    pub deck_index: u8,
    pub community_cards: [u8; COMMUNITY_CARDS],
    pub pot: u64,
    pub current_round: u8,
    pub dealer_idx: u8,
    pub current_turn: u8,
    pub small_blind: u64,
    pub big_blind: u64,
    pub last_raise: u64,
    pub num_active_in_hand: u8,
    pub num_acted_this_round: u8,
    pub last_raiser: u8,
    pub status: u8,
    pub bump: u8,
    pub player_folded: [bool; MAX_PLAYERS],
    pub player_all_in: [bool; MAX_PLAYERS],
    pub player_active: [bool; MAX_PLAYERS],
}

impl GameState {
    pub const LEN: usize = 32 + 8 + DECK_SIZE + 1 + COMMUNITY_CARDS
        + 8 + 1 + 1 + 1 + 8 + 8 + 8 + 1 + 1 + 1 + 1 + 1
        + MAX_PLAYERS + MAX_PLAYERS + MAX_PLAYERS;

    pub fn next_active_turn(&self, after: u8) -> u8 {
        let n = MAX_PLAYERS as u8;
        for i in 1..=n {
            let idx = (after + i) % n;
            if self.player_active[idx as usize]
                && !self.player_folded[idx as usize]
                && !self.player_all_in[idx as usize]
            {
                return idx;
            }
        }
        after
    }
}

#[account]
pub struct PlayerState {
    pub game: Pubkey,
    pub player_idx: u8,
    pub chips: u64,
    pub current_bet: u64,
    pub total_bet_this_hand: u64,
    pub is_active: bool,
    pub is_folded: bool,
    pub is_all_in: bool,
    pub hole_card_1: u8,
    pub hole_card_2: u8,
    pub ai_model_id: u8,
    pub has_acted: bool,
    pub bump: u8,
}

impl PlayerState {
    pub const LEN: usize = 32 + 1 + 8 + 8 + 8 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1;
}

#[account]
pub struct MarketState {
    pub tournament: Pubkey,
    pub authority: Pubkey,
    pub total_pool: u64,
    pub bets_per_ai: [u64; MAX_PLAYERS],
    pub is_open: bool,
    pub is_resolved: bool,
    pub winning_ai: Option<u8>,
    pub bump: u8,
}

impl MarketState {
    pub const LEN: usize = 32 + 32 + 8 + (8 * MAX_PLAYERS) + 1 + 1 + 2 + 1;
}

#[account]
pub struct UserBet {
    pub user: Pubkey,
    pub market: Pubkey,
    pub ai_model_idx: u8,
    pub amount: u64,
    pub is_claimed: bool,
    pub bump: u8,
}

impl UserBet {
    pub const LEN: usize = 32 + 32 + 1 + 8 + 1 + 1;
}
