use anchor_lang::prelude::*;

#[error_code]
pub enum PokerError {
    #[msg("Tournament is not in waiting state")]
    TournamentNotWaiting,
    #[msg("Tournament is not active")]
    TournamentNotActive,
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
    #[msg("Insufficient chips")]
    InsufficientChips,
    #[msg("Invalid action")]
    InvalidAction,
    #[msg("Round is not complete")]
    RoundNotComplete,
    #[msg("Cannot advance past river")]
    CannotAdvancePastRiver,
    #[msg("Not all players have acted")]
    NotAllPlayersActed,
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
    #[msg("Showdown requires at least 2 active players")]
    NotEnoughPlayersForShowdown,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
