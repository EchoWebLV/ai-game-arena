use anchor_lang::prelude::*;

#[error_code]
pub enum PokerError {
    #[msg("Tournament is already complete")]
    TournamentComplete,
    #[msg("Hand is not active")]
    HandNotActive,
    #[msg("Not this player's turn")]
    NotPlayerTurn,
    #[msg("Player has already folded")]
    PlayerFolded,
    #[msg("Player is not active in tournament")]
    PlayerNotActive,
    #[msg("Invalid bet amount")]
    InvalidBetAmount,
    #[msg("Invalid action")]
    InvalidAction,
    #[msg("Cannot advance past river")]
    CannotAdvancePastRiver,
    #[msg("Prediction market is closed")]
    MarketClosed,
    #[msg("Prediction market not resolved")]
    MarketNotResolved,
    #[msg("Already claimed winnings")]
    AlreadyClaimed,
    #[msg("No winnings to claim")]
    NoWinnings,
    #[msg("Invalid AI model index")]
    InvalidAiModel,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
