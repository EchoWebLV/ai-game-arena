pub const MAX_PLAYERS: usize = 5;
pub const DECK_SIZE: usize = 52;
pub const COMMUNITY_CARDS: usize = 5;
pub const HOLE_CARDS: usize = 2;
pub const CARD_NOT_DEALT: u8 = 255;

pub const TOURNAMENT_SEED: &[u8] = b"tournament";
pub const GAME_STATE_SEED: &[u8] = b"game_state";
pub const PLAYER_STATE_SEED: &[u8] = b"player_state";
pub const MARKET_SEED: &[u8] = b"market";
pub const USER_BET_SEED: &[u8] = b"user_bet";

pub const ROUND_PREFLOP: u8 = 0;
pub const ROUND_FLOP: u8 = 1;
pub const ROUND_TURN: u8 = 2;
pub const ROUND_RIVER: u8 = 3;
pub const ROUND_SHOWDOWN: u8 = 4;

pub const STATUS_WAITING: u8 = 0;
pub const STATUS_ACTIVE: u8 = 1;
pub const STATUS_COMPLETE: u8 = 2;

pub const ACTION_FOLD: u8 = 0;
pub const ACTION_CHECK: u8 = 1;
pub const ACTION_CALL: u8 = 2;
pub const ACTION_RAISE: u8 = 3;
pub const ACTION_ALL_IN: u8 = 4;
