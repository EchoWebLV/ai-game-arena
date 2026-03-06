use bolt_lang::*;
use game_state::GameState;
use player_state::PlayerState;

declare_id!("HTU8dhsybkio6AoK7hsfaGV7DHRHmfc4aqPzVg4GGms");

#[system]
pub mod game_action {

    /// Process a player action in the poker game.
    /// args_p encodes: [action_type: u8, raise_amount: u64 (LE bytes)]
    pub fn execute(ctx: Context<Components>, args_p: Vec<u8>) -> Result<Components> {
        let game = &mut ctx.accounts.game_state;
        let player = &mut ctx.accounts.player_state;

        let action_type = if !args_p.is_empty() { args_p[0] } else { 1 };

        let raise_amount = if args_p.len() >= 9 {
            u64::from_le_bytes(args_p[1..9].try_into().unwrap_or([0u8; 8]))
        } else {
            0
        };

        let call_amount = game.last_raise.saturating_sub(player.current_bet);

        match action_type {
            0 => {
                // Fold
                player.is_folded = true;
                game.num_active -= 1;
            }
            1 => {
                // Check (only valid when call_amount == 0)
            }
            2 => {
                // Call
                let amount = call_amount.min(player.chips);
                player.chips -= amount;
                player.current_bet += amount;
                game.pot += amount;
                if player.chips == 0 {
                    player.is_all_in = true;
                }
            }
            3 => {
                // Raise
                let amount = raise_amount.min(player.chips);
                player.chips -= amount;
                player.current_bet += amount;
                game.pot += amount;
                game.last_raise = player.current_bet;
                if player.chips == 0 {
                    player.is_all_in = true;
                }
            }
            4 => {
                // All-in
                let amount = player.chips;
                game.pot += amount;
                player.current_bet += amount;
                player.chips = 0;
                player.is_all_in = true;
                if player.current_bet > game.last_raise {
                    game.last_raise = player.current_bet;
                }
            }
            _ => {}
        }

        player.has_acted = true;

        // Advance turn
        game.current_turn = (player.player_idx + 1) % 5;

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub game_state: GameState,
        pub player_state: PlayerState,
    }
}
