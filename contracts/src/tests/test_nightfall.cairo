//! Tests for the Nightfall game engine state machine (v0).
//!
//! `cairo_test` cannot deploy contracts, so we drive the contract's external
//! functions directly through the generated `unsafe_new_contract_state` +
//! `NightfallImpl` (the same code the ABI dispatches to), using
//! `starknet::testing::set_caller_address` to impersonate seats.

use crate::nightfall::Nightfall::NightfallImpl;
use crate::nightfall::{
    Nightfall, Phase, Role, Winner, build_role_list, deal_roles, determine_winner, is_wolf_team,
    MAX_PLAYERS, MIN_PLAYERS,
};
use starknet::ContractAddress;
use starknet::testing::set_caller_address;

/// Helper: a deterministic ContractAddress from a short string.
fn addr(short: felt252) -> ContractAddress {
    short.try_into().unwrap()
}

/// Helper: the three player addresses used by the happy path.
fn players() -> Array<ContractAddress> {
    array![addr('PLAYER0'), addr('PLAYER1'), addr('PLAYER2')]
}

/// Helper: the wolf seat index for a 3-player deal.
fn wolf_seat(seed: felt252) -> u32 {
    let roles = deal_roles(seed, 3);
    let mut i: u32 = 0;
    while i < roles.len() {
        if *roles[i] == Role::Werewolf {
            return i;
        }
        i += 1;
    }
    assert(false, 'NO_WOLF');
    0
}

#[test]
fn test_is_wolf_team() {
    assert(is_wolf_team(Role::Werewolf), 'WEREWOLF_IS_WOLF');
    assert(is_wolf_team(Role::Minion), 'MINION_IS_WOLF');
    assert(!is_wolf_team(Role::Seer), 'SEER_IS_VILLAGE');
    assert(!is_wolf_team(Role::Robber), 'ROBBER_IS_VILLAGE');
    assert(!is_wolf_team(Role::Villager), 'VILLAGER_IS_VILLAGE');
}

#[test]
fn test_build_role_list_length() {
    let roles_min = build_role_list(MIN_PLAYERS);
    assert_eq!(roles_min.len(), MIN_PLAYERS);

    let roles_max = build_role_list(MAX_PLAYERS);
    assert_eq!(roles_max.len(), MAX_PLAYERS);
}

#[test]
fn test_deal_roles_is_permutation() {
    let roles = deal_roles(0x1234, 5);
    assert_eq!(roles.len(), 5);

    let mut w: u32 = 0;
    let mut m: u32 = 0;
    let mut s: u32 = 0;
    let mut r: u32 = 0;
    let mut i: u32 = 0;
    while i < roles.len() {
        let role = *roles[i];
        if role == Role::Werewolf {
            w += 1;
        } else if role == Role::Minion {
            m += 1;
        } else if role == Role::Seer {
            s += 1;
        } else if role == Role::Robber {
            r += 1;
        } else {
            assert(false, 'UNEXPECTED_ROLE');
        }
        i += 1;
    }
    // build_role_list(5) = [W, W, Minion, Seer, Robber].
    assert_eq!(w, 2);
    assert_eq!(m, 1);
    assert_eq!(s, 1);
    assert_eq!(r, 1);
}

#[test]
fn test_deal_roles_deterministic() {
    let a = deal_roles(0xCAFE, 4);
    let b = deal_roles(0xCAFE, 4);
    assert_eq!(a.len(), b.len());

    let mut i: u32 = 0;
    while i < a.len() {
        assert_eq!(*a[i], *b[i]);
        i += 1;
    }
}

#[test]
fn test_determine_winner() {
    // Seat 2 votes for the wolf (seat 0) => village wins.
    let roles = array![Role::Werewolf, Role::Seer, Role::Villager];
    let votes = array![1, 1, 0];
    assert_eq!(determine_winner(roles.span(), votes.span()), Winner::Village);

    // Nobody votes for the wolf (seat 0) => wolves win.
    let roles2 = array![Role::Werewolf, Role::Seer, Role::Villager];
    let votes2 = array![1, 1, 1];
    assert_eq!(determine_winner(roles2.span(), votes2.span()), Winner::Wolves);
}

#[test]
fn test_happy_path_join_start_night_vote_reveal_settle() {
    let mut state = Nightfall::unsafe_new_contract_state();
    let ps = players();
    let seed: felt252 = 0xBEEF;

    // Lobby: three players join.
    let mut i: u32 = 0;
    while i < 3 {
        set_caller_address(*ps[i]);
        NightfallImpl::join_game(ref state);
        i += 1;
    }
    assert_eq!(NightfallImpl::get_seat_count(@state), 3);

    // Deal: start_game assigns roles deterministically and enters Night.
    set_caller_address(*ps[0]);
    NightfallImpl::start_game(ref state, seed);
    assert_eq!(NightfallImpl::get_phase(@state), Phase::Night);
    assert_eq!(NightfallImpl::get_seed(@state), seed);

    // Night: seat 0 acts on seat 1.
    NightfallImpl::night_action(ref state, 0, 1);

    // Night -> Day -> Vote.
    NightfallImpl::end_night(ref state);
    assert_eq!(NightfallImpl::get_phase(@state), Phase::Day);
    NightfallImpl::begin_vote(ref state);
    assert_eq!(NightfallImpl::get_phase(@state), Phase::Vote);

    // Vote: every seat votes for the wolf seat => village wins.
    let wolf = wolf_seat(seed);
    let mut k: u32 = 0;
    while k < 3 {
        set_caller_address(*ps[k]);
        NightfallImpl::cast_vote(ref state, k, wolf);
        k += 1;
    }
    assert_eq!(NightfallImpl::get_vote_tally(@state, wolf), 3);

    // Vote -> Reveal.
    NightfallImpl::end_vote(ref state);
    assert_eq!(NightfallImpl::get_phase(@state), Phase::Reveal);

    // Reveal: seat 0 reveals its own role.
    set_caller_address(*ps[0]);
    NightfallImpl::reveal_role(ref state, 0);

    // Settle.
    NightfallImpl::settle(ref state);
    assert_eq!(NightfallImpl::get_phase(@state), Phase::Settle);
    assert_eq!(NightfallImpl::get_winner(@state), Winner::Village);
}

#[test]
#[should_panic]
fn test_cast_vote_during_lobby_reverts() {
    let mut state = Nightfall::unsafe_new_contract_state();
    set_caller_address(addr('PLAYER0'));
    NightfallImpl::join_game(ref state);
    // Still in Lobby: casting a vote is an invalid transition.
    NightfallImpl::cast_vote(ref state, 0, 0);
}

#[test]
#[should_panic]
fn test_start_game_with_too_few_players_reverts() {
    let mut state = Nightfall::unsafe_new_contract_state();
    set_caller_address(addr('PLAYER0'));
    NightfallImpl::join_game(ref state);
    NightfallImpl::start_game(ref state, 1);
}

#[test]
#[should_panic]
fn test_night_action_during_lobby_reverts() {
    let mut state = Nightfall::unsafe_new_contract_state();
    set_caller_address(addr('PLAYER0'));
    NightfallImpl::join_game(ref state);
    NightfallImpl::night_action(ref state, 0, 0);
}
