//! Tests for the generic GameEngine surface.
//!
//! The engine phase set is the canonical, title-agnostic lifecycle that every
//! concrete title (Nightfall included) maps onto. These assertions pin the
//! documented order so a reorder or renumber can never slip in silently.

use crate::engine::{LOBBY, DEAL, NIGHT, DAY, VOTE, REVEAL, SETTLE};

#[test]
fn test_engine_phase_constants_are_0_to_6_in_order() {
    assert_eq!(LOBBY, 0);
    assert_eq!(DEAL, 1);
    assert_eq!(NIGHT, 2);
    assert_eq!(DAY, 3);
    assert_eq!(VOTE, 4);
    assert_eq!(REVEAL, 5);
    assert_eq!(SETTLE, 6);
}
