/// Hand ranking constants (higher = better)
const HAND_HIGH_CARD: u32 = 0;
const HAND_ONE_PAIR: u32 = 1;
const HAND_TWO_PAIR: u32 = 2;
const HAND_THREE_KIND: u32 = 3;
const HAND_STRAIGHT: u32 = 4;
const HAND_FLUSH: u32 = 5;
const HAND_FULL_HOUSE: u32 = 6;
const HAND_FOUR_KIND: u32 = 7;
const HAND_STRAIGHT_FLUSH: u32 = 8;

/// Card utilities: card_index 0..51
/// rank = card % 13 (0=2, 1=3, ..., 12=A)
/// suit = card / 13 (0..3)
fn rank(card: u8) -> u8 {
    card % 13
}

fn suit(card: u8) -> u8 {
    card / 13
}

/// Evaluate a 5-card hand and return a score.
/// Higher score = better hand.
/// Format: hand_rank * 1_000_000 + tiebreaker
fn evaluate_5(cards: &[u8; 5]) -> u32 {
    let mut ranks: [u8; 5] = cards.map(|c| rank(c));
    let suits: [u8; 5] = cards.map(|c| suit(c));

    ranks.sort_unstable_by(|a, b| b.cmp(a));

    let is_flush = suits[0] == suits[1]
        && suits[1] == suits[2]
        && suits[2] == suits[3]
        && suits[3] == suits[4];

    let is_straight = is_straight_sorted(&ranks);
    let is_wheel = is_wheel_sorted(&ranks);

    let mut rank_counts: [u8; 13] = [0; 13];
    for &r in &ranks {
        rank_counts[r as usize] += 1;
    }

    let mut fours = [0u8; 2];
    let mut fours_len = 0usize;
    let mut threes = [0u8; 2];
    let mut threes_len = 0usize;
    let mut pairs = [0u8; 3];
    let mut pairs_len = 0usize;
    let mut singles = [0u8; 5];
    let mut singles_len = 0usize;

    for r in (0..13u8).rev() {
        match rank_counts[r as usize] {
            4 => { fours[fours_len] = r; fours_len += 1; }
            3 => { threes[threes_len] = r; threes_len += 1; }
            2 => { pairs[pairs_len] = r; pairs_len += 1; }
            1 => { singles[singles_len] = r; singles_len += 1; }
            _ => {}
        }
    }

    if (is_straight || is_wheel) && is_flush {
        let high = if is_wheel { 3 } else { ranks[0] };
        return HAND_STRAIGHT_FLUSH * 1_000_000 + high as u32 * 1000;
    }

    if fours_len > 0 {
        let kicker = if ranks[0] != fours[0] {
            ranks[0]
        } else {
            ranks[4]
        };
        return HAND_FOUR_KIND * 1_000_000 + fours[0] as u32 * 1000 + kicker as u32;
    }

    if threes_len > 0 && pairs_len > 0 {
        return HAND_FULL_HOUSE * 1_000_000 + threes[0] as u32 * 1000 + pairs[0] as u32;
    }

    if is_flush {
        return HAND_FLUSH * 1_000_000 + rank_tiebreaker(&ranks);
    }

    if is_straight || is_wheel {
        let high = if is_wheel { 3 } else { ranks[0] };
        return HAND_STRAIGHT * 1_000_000 + high as u32 * 1000;
    }

    if threes_len > 0 {
        let s0 = if singles_len > 0 { singles[0] } else { 0 };
        let s1 = if singles_len > 1 { singles[1] } else { 0 };
        return HAND_THREE_KIND * 1_000_000
            + threes[0] as u32 * 10000
            + s0 as u32 * 100
            + s1 as u32;
    }

    if pairs_len >= 2 {
        let kicker = if singles_len > 0 { singles[0] } else { 0 };
        return HAND_TWO_PAIR * 1_000_000
            + pairs[0] as u32 * 10000
            + pairs[1] as u32 * 100
            + kicker as u32;
    }

    if pairs_len == 1 {
        let s0 = if singles_len > 0 { singles[0] } else { 0 };
        let s1 = if singles_len > 1 { singles[1] } else { 0 };
        let s2 = if singles_len > 2 { singles[2] } else { 0 };
        return HAND_ONE_PAIR * 1_000_000
            + pairs[0] as u32 * 10000
            + s0 as u32 * 100
            + s1 as u32 * 10
            + s2 as u32;
    }

    HAND_HIGH_CARD * 1_000_000 + rank_tiebreaker(&ranks)
}

fn is_straight_sorted(ranks: &[u8; 5]) -> bool {
    ranks[0] == ranks[1] + 1
        && ranks[1] == ranks[2] + 1
        && ranks[2] == ranks[3] + 1
        && ranks[3] == ranks[4] + 1
}

/// Ace-low straight: A-2-3-4-5
fn is_wheel_sorted(ranks: &[u8; 5]) -> bool {
    ranks[0] == 12 && ranks[1] == 3 && ranks[2] == 2 && ranks[3] == 1 && ranks[4] == 0
}

fn rank_tiebreaker(sorted_ranks: &[u8; 5]) -> u32 {
    sorted_ranks[0] as u32 * 100_000
        + sorted_ranks[1] as u32 * 1_000
        + sorted_ranks[2] as u32 * 100
        + sorted_ranks[3] as u32 * 10
        + sorted_ranks[4] as u32
}

/// Evaluate best 5-card hand from 7 cards (2 hole + 5 community).
/// Returns (score, best_5_card_indices).
pub fn evaluate_best_hand(hole: [u8; 2], community: [u8; 5]) -> u32 {
    let all_cards: [u8; 7] = [
        hole[0],
        hole[1],
        community[0],
        community[1],
        community[2],
        community[3],
        community[4],
    ];

    let mut best_score: u32 = 0;

    // Iterate all C(7,5) = 21 combinations
    for i in 0..7 {
        for j in (i + 1)..7 {
            for k in (j + 1)..7 {
                for l in (k + 1)..7 {
                    for m in (l + 1)..7 {
                        let hand = [
                            all_cards[i],
                            all_cards[j],
                            all_cards[k],
                            all_cards[l],
                            all_cards[m],
                        ];
                        let score = evaluate_5(&hand);
                        if score > best_score {
                            best_score = score;
                        }
                    }
                }
            }
        }
    }

    best_score
}

/// Fisher-Yates shuffle using VRF randomness bytes.
/// Uses two bytes per swap to reduce modular bias (u16 range = 65536).
pub fn shuffle_deck(randomness: &[u8; 32]) -> [u8; 52] {
    let mut deck: [u8; 52] = [0u8; 52];
    for i in 0..52 {
        deck[i] = i as u8;
    }

    let mut rng_idx: usize = 0;

    for i in (1..52).rev() {
        let b0 = randomness[rng_idx % 32] as u16;
        let b1 = randomness[(rng_idx + 1) % 32] as u16;
        rng_idx += 2;
        let rand_val = (b0 << 8) | b1;
        let j = (rand_val as usize) % (i + 1);
        deck.swap(i, j);
    }

    deck
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_royal_flush() {
        // A, K, Q, J, 10 of hearts (suit 0)
        let cards = [12, 11, 10, 9, 8]; // rank indices for same suit
        let score = evaluate_5(&cards);
        assert!(score >= HAND_STRAIGHT_FLUSH * 1_000_000);
    }

    #[test]
    fn test_shuffle_deterministic() {
        let rand = [42u8; 32];
        let deck1 = shuffle_deck(&rand);
        let deck2 = shuffle_deck(&rand);
        assert_eq!(deck1, deck2);
    }

    #[test]
    fn test_shuffle_all_cards_present() {
        let rand = [7u8; 32];
        let deck = shuffle_deck(&rand);
        let mut sorted = deck;
        sorted.sort();
        for i in 0..52 {
            assert_eq!(sorted[i], i as u8);
        }
    }
}
