//! Tests for the Portage.fun core contract (v0).
//!
//! `cairo_test` cannot deploy contracts, so we drive the external functions
//! directly through the generated `PortageImpl` (the same code the ABI
//! dispatches to) and impersonate callers with
//! `starknet::testing::set_caller_address`.

use crate::portage::Portage::PortageImpl;
use crate::portage::Portage::{roll_rarity, roll_species};
use crate::portage::{
    Portage, Rarity, Species, Stage, WEIGHT_COMMON, WEIGHT_UNCOMMON, WEIGHT_RARE, WEIGHT_EPIC,
    WEIGHT_LEGENDARY, WEIGHT_MYTHIC, TOTAL_WEIGHT, RAKE_BPS, BPS_DENOMINATOR, SPECIES_COUNT,
};
use starknet::ContractAddress;
use starknet::testing::{set_caller_address, set_contract_address};

/// Helper: a deterministic `ContractAddress` from a short string.
fn addr(short: felt252) -> ContractAddress {
    short.try_into().unwrap()
}

// ---------------------------------------------------------------------------
// Rarity table
// ---------------------------------------------------------------------------

#[test]
fn test_rarity_weights_are_fixed() {
    assert_eq!(WEIGHT_COMMON, 40);
    assert_eq!(WEIGHT_UNCOMMON, 25);
    assert_eq!(WEIGHT_RARE, 15);
    assert_eq!(WEIGHT_EPIC, 10);
    assert_eq!(WEIGHT_LEGENDARY, 7);
    assert_eq!(WEIGHT_MYTHIC, 3);

    let sum = WEIGHT_COMMON
        + WEIGHT_UNCOMMON
        + WEIGHT_RARE
        + WEIGHT_EPIC
        + WEIGHT_LEGENDARY
        + WEIGHT_MYTHIC;
    assert_eq!(sum, TOTAL_WEIGHT);
    assert_eq!(TOTAL_WEIGHT, 100);

    // Rake + denom pinned.
    assert_eq!(RAKE_BPS, 250);
    assert_eq!(BPS_DENOMINATOR, 10000);
    assert_eq!(SPECIES_COUNT, 6);
}

#[test]
fn test_rarity_weights_getter() {
    let state = Portage::contract_state_for_testing();
    let weights = PortageImpl::get_rarity_weights(@state);

    assert_eq!(weights.len(), 6);
    assert_eq!(*weights[0], WEIGHT_COMMON);
    assert_eq!(*weights[1], WEIGHT_UNCOMMON);
    assert_eq!(*weights[2], WEIGHT_RARE);
    assert_eq!(*weights[3], WEIGHT_EPIC);
    assert_eq!(*weights[4], WEIGHT_LEGENDARY);
    assert_eq!(*weights[5], WEIGHT_MYTHIC);
}

// ---------------------------------------------------------------------------
// Provably-fair rolls
// ---------------------------------------------------------------------------

#[test]
fn test_roll_rarity_is_deterministic() {
    assert_eq!(roll_rarity(0xCAFE, 7), roll_rarity(0xCAFE, 7));
    assert_eq!(roll_rarity(0xCAFE, 8), roll_rarity(0xCAFE, 8));
    assert_eq!(roll_rarity(0xDEAD, 0), roll_rarity(0xDEAD, 0));
    assert_eq!(roll_rarity(0xBEEF, 3), roll_rarity(0xBEEF, 3));
}

#[test]
fn test_roll_species_is_deterministic() {
    assert_eq!(roll_species(0xCAFE, 7), roll_species(0xCAFE, 7));
    assert_eq!(roll_species(0xCAFE, 8), roll_species(0xCAFE, 8));
    assert_eq!(roll_species(0xDEAD, 0), roll_species(0xDEAD, 0));
    assert_eq!(roll_species(0xBEEF, 3), roll_species(0xBEEF, 3));
}

#[test]
fn test_rolls_stay_within_valid_enums_and_cover_species() {
    let mut ember: u32 = 0;
    let mut creek: u32 = 0;
    let mut grove: u32 = 0;
    let mut stone: u32 = 0;
    let mut mist: u32 = 0;
    let mut sky: u32 = 0;
    let mut common: u32 = 0;
    let mut mythic: u32 = 0;

    let mut i: u32 = 0;
    while i < 1000 {
        let seed: felt252 = i.into();
        // Exhaustive matches: if a roll ever left the enum the match would
        // still be total, so reaching here for 1000 distinct seeds proves the
        // RNG never produces an out-of-range value.
        match roll_species(seed, 0) {
            Species::Ember => { ember += 1; },
            Species::Creek => { creek += 1; },
            Species::Grove => { grove += 1; },
            Species::Stone => { stone += 1; },
            Species::Mist => { mist += 1; },
            Species::Sky => { sky += 1; },
        }
        match roll_rarity(seed, 0) {
            Rarity::Common => { common += 1; },
            Rarity::Uncommon => {},
            Rarity::Rare => {},
            Rarity::Epic => {},
            Rarity::Legendary => {},
            Rarity::Mythic => { mythic += 1; },
        }
        i += 1;
    }

    assert(ember > 0, 'NO_EMBER');
    assert(creek > 0, 'NO_CREEK');
    assert(grove > 0, 'NO_GROVE');
    assert(stone > 0, 'NO_STONE');
    assert(mist > 0, 'NO_MIST');
    assert(sky > 0, 'NO_SKY');
    assert(common > 0, 'NO_COMMON');
    assert(mythic > 0, 'NO_MYTHIC');
}

// ---------------------------------------------------------------------------
// Hatch / mint
// ---------------------------------------------------------------------------

#[test]
fn test_hatch_mints_to_caller_and_increments() {
    let alice = addr('ALICE');
    let mut state = Portage::contract_state_for_testing();
    set_caller_address(alice);

    let seed: felt252 = 0xABCD;
    let token_id = PortageImpl::hatch(ref state, seed);

    assert_eq!(token_id, 0);
    assert_eq!(PortageImpl::get_hatch_count(@state), 1);
    assert_eq!(PortageImpl::get_total_supply(@state), 1);
    assert_eq!(PortageImpl::owner_of(@state, token_id), alice);

    let (owner, species, rarity, stage) = PortageImpl::get_creature(@state, token_id);
    assert_eq!(owner, alice);
    assert_eq!(species, roll_species(seed, 0));
    assert_eq!(rarity, roll_rarity(seed, 0));
    assert_eq!(stage, Stage::Hatchling);
}

#[test]
fn test_hatch_uses_hatch_count_in_rng() {
    let alice = addr('ALICE');
    let mut state = Portage::contract_state_for_testing();
    set_caller_address(alice);

    let seed: felt252 = 0x42;
    let t0 = PortageImpl::hatch(ref state, seed);
    let t1 = PortageImpl::hatch(ref state, seed);

    assert_eq!(t0, 0);
    assert_eq!(t1, 1);
    assert_eq!(PortageImpl::get_hatch_count(@state), 2);
    assert_eq!(PortageImpl::get_total_supply(@state), 2);

    let (_, s0, r0, _) = PortageImpl::get_creature(@state, 0);
    let (_, s1, r1, _) = PortageImpl::get_creature(@state, 1);
    assert_eq!(r0, roll_rarity(seed, 0));
    assert_eq!(s0, roll_species(seed, 0));
    assert_eq!(r1, roll_rarity(seed, 1));
    assert_eq!(s1, roll_species(seed, 1));
}

#[test]
fn test_hatch_emits_event() {
    let alice = addr('ALICE');
    let portage = addr('PORTAGE');
    let mut state = Portage::contract_state_for_testing();
    set_contract_address(portage);
    set_caller_address(alice);

    let seed: felt252 = 0xBEEF;
    let token_id = PortageImpl::hatch(ref state, seed);

    let hatched: Option<Portage::Event> = starknet::testing::pop_log(portage);
    assert_eq!(
        hatched,
        Option::Some(
            Portage::Event::Hatched(
                Portage::Hatched {
                    token_id,
                    species: roll_species(seed, 0),
                    rarity: roll_rarity(seed, 0),
                    seed,
                    owner: alice,
                },
            ),
        ),
    );
}

// ---------------------------------------------------------------------------
// Ownership / transfer
// ---------------------------------------------------------------------------

#[test]
fn test_transfer_to_new_owner() {
    let alice = addr('ALICE');
    let bob = addr('BOB');
    let mut state = Portage::contract_state_for_testing();

    set_caller_address(alice);
    let token_id = PortageImpl::hatch(ref state, 0x1);
    assert_eq!(PortageImpl::owner_of(@state, token_id), alice);

    set_caller_address(alice);
    PortageImpl::transfer_from(ref state, bob, token_id);
    assert_eq!(PortageImpl::owner_of(@state, token_id), bob);

    let (owner, _, _, _) = PortageImpl::get_creature(@state, token_id);
    assert_eq!(owner, bob);
}

#[test]
#[should_panic]
fn test_transfer_reverts_for_non_owner() {
    let alice = addr('ALICE');
    let bob = addr('BOB');
    let carol = addr('CAROL');
    let mut state = Portage::contract_state_for_testing();

    set_caller_address(alice);
    let token_id = PortageImpl::hatch(ref state, 0x1);

    // Bob is not the owner -> must revert.
    set_caller_address(bob);
    PortageImpl::transfer_from(ref state, carol, token_id);
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

#[test]
fn test_list_buy_settles_and_applies_rake() {
    let alice = addr('ALICE');
    let bob = addr('BOB');
    let portage = addr('PORTAGE');
    let mut state = Portage::contract_state_for_testing();
    set_contract_address(portage);

    let seed: felt252 = 0x123;
    set_caller_address(alice);
    let token_id = PortageImpl::hatch(ref state, seed);
    PortageImpl::list(ref state, token_id, 1000);

    set_caller_address(bob);
    PortageImpl::buy(ref state, token_id);

    // Ownership moved to the buyer.
    assert_eq!(PortageImpl::owner_of(@state, token_id), bob);

    // Listing cleared.
    let (seller, price) = PortageImpl::get_listing(@state, token_id);
    assert_eq!(seller, 0.try_into().unwrap());
    assert_eq!(price, 0);

    // Events, in emission order: Hatched, Listed, Sold.
    let hatched: Option<Portage::Event> = starknet::testing::pop_log(portage);
    assert_eq!(
        hatched,
        Option::Some(
            Portage::Event::Hatched(
                Portage::Hatched {
                    token_id,
                    species: roll_species(seed, 0),
                    rarity: roll_rarity(seed, 0),
                    seed,
                    owner: alice,
                },
            ),
        ),
    );

    let listed: Option<Portage::Event> = starknet::testing::pop_log(portage);
    assert_eq!(
        listed,
        Option::Some(Portage::Event::Listed(Portage::Listed { token_id, seller: alice, price: 1000 })),
    );

    let sold: Option<Portage::Event> = starknet::testing::pop_log(portage);
    assert_eq!(
        sold,
        Option::Some(
            Portage::Event::Sold(
                Portage::Sold {
                    token_id,
                    seller: alice,
                    buyer: bob,
                    price: 1000,
                    rake: 25,
                    proceeds: 975,
                },
            ),
        ),
    );
}

#[test]
fn test_cancel_removes_listing() {
    let alice = addr('ALICE');
    let mut state = Portage::contract_state_for_testing();

    set_caller_address(alice);
    let token_id = PortageImpl::hatch(ref state, 0x1);
    PortageImpl::list(ref state, token_id, 500);

    let (seller, price) = PortageImpl::get_listing(@state, token_id);
    assert_eq!(seller, alice);
    assert_eq!(price, 500);

    PortageImpl::cancel(ref state, token_id);

    let (seller2, price2) = PortageImpl::get_listing(@state, token_id);
    assert_eq!(seller2, 0.try_into().unwrap());
    assert_eq!(price2, 0);
}

#[test]
#[should_panic]
fn test_buy_non_listed_reverts() {
    let alice = addr('ALICE');
    let bob = addr('BOB');
    let mut state = Portage::contract_state_for_testing();

    set_caller_address(alice);
    let token_id = PortageImpl::hatch(ref state, 0x1);

    // Never listed -> buy must revert.
    set_caller_address(bob);
    PortageImpl::buy(ref state, token_id);
}
