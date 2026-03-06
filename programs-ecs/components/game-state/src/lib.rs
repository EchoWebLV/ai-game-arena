use bolt_lang::*;

declare_id!("H5tYBDgY6ubcAbR8e2EDK3Lq39E1ABpwjxBqYmnTk6mG");

#[component]
#[derive(Default)]
pub struct GameState {
    pub tournament_id: u64,
    pub hand_number: u64,
    pub pot: u64,
    pub current_round: u8,
    pub dealer_idx: u8,
    pub current_turn: u8,
    pub small_blind: u64,
    pub big_blind: u64,
    pub last_raise: u64,
    pub num_active: u8,
    pub status: u8,
    pub community_card_0: u8,
    pub community_card_1: u8,
    pub community_card_2: u8,
    pub community_card_3: u8,
    pub community_card_4: u8,
}
