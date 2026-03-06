use bolt_lang::*;

declare_id!("3rP5pWrWPNXWWQrD6dKypNXgMZkzZHgLMDm77nePzHnR");

#[component]
#[derive(Default)]
pub struct PlayerState {
    pub player_idx: u8,
    pub chips: u64,
    pub current_bet: u64,
    pub is_active: bool,
    pub is_folded: bool,
    pub is_all_in: bool,
    pub ai_model_id: u8,
    pub has_acted: bool,
    pub hand_score: u32,
}
