//! Reusable, title-agnostic game engine surface.
//!
//! This module defines the *generic* lifecycle contract that every concrete
//! title built on the Nightfall platform shares, independent of any specific
//! game's rules (e.g. One Night Werewolf). It deliberately avoids all
//! title-specific vocabulary: roles, teams, and winner semantics are the
//! concrete title's concern, while this surface only pins down the turn-based
//! state machine and its generic entrypoints.
//!
//! Nightfall is one concrete title: `crate::nightfall::Nightfall` implements
//! its own `INightfall` ABI, whose phases map onto these canonical constants.

/// Canonical, felt252-typed phase set for a turn-based engine.
///
/// The values are ordered by lifecycle: a game is created in [`LOBBY`], cards
/// are assigned in [`DEAL`], hidden actions happen in [`NIGHT`], the table
/// discusses in [`DAY`], votes are cast in [`VOTE`], results are shown in
/// [`REVEAL`], and the game ends in [`SETTLE`].
pub const LOBBY: felt252 = 0;
pub const DEAL: felt252 = 1;
pub const NIGHT: felt252 = 2;
pub const DAY: felt252 = 3;
pub const VOTE: felt252 = 4;
pub const REVEAL: felt252 = 5;
pub const SETTLE: felt252 = 6;

/// Generic, reusable engine ABI.
///
/// This is the platform-level surface shared by every title: players join in
/// the lobby, a `seed` commits the deal, hidden actions and votes are recorded
/// per seat, and the game is settled into a winner. Concrete titles may layer
/// title-specific entrypoints (reveals, team lookups, etc.) on top of this
/// surface. Phase and winner values are engine-defined `felt252` codes so the
/// surface stays title-agnostic.
#[starknet::interface]
pub trait IGameEngine<TState> {
    /// A player joins the current game in the lobby.
    fn join_game(ref self: TState);

    /// Commit a seed and transition the game out of the lobby (deal phase).
    fn start_game(ref self: TState, seed: felt252);

    /// Record a hidden action for `seat` targeting `target`.
    fn night_action(ref self: TState, seat: u32, target: u32);

    /// Record a vote for `seat` targeting `target`.
    fn cast_vote(ref self: TState, seat: u32, target: u32);

    /// Resolve the game and write the winner.
    fn settle(ref self: TState);

    /// Current phase, as one of the canonical [`LOBBY`]..[`SETTLE`] constants.
    fn get_phase(self: @TState) -> felt252;

    /// Number of seats currently in the game.
    fn get_seat_count(self: @TState) -> u32;

    /// Engine-defined winner code (felt252), title-specific in meaning.
    fn get_winner(self: @TState) -> felt252;
}
