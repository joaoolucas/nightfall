//! Tests for the Portage.fun core contract (v0).
//!
//! `cairo_test` cannot deploy contracts, so we drive the external functions
//! directly through the generated `PortageImpl` (the same code the ABI
//! dispatches to) and impersonate callers with
//! `starknet::testing::set_caller_address`.

use crate::portage::Portage::PortageImpl;
use crate::portage::Portage::{roll_rarity, roll_species, base_stats, creature_stats, exp_yield};
use crate::portage::{
    Portage, Rarity, Species, Stage, WEIGHT_COMMON, WEIGHT_UNCOMMON, WEIGHT_RARE,
    WEIGHT_EPIC, WEIGHT_LEGENDARY, WEIGHT_MYTHIC, TOTAL_WEIGHT, RAKE_BPS, BPS_DENOMINATOR,
    SPECIES_COUNT, EXP_TO_ADULT, EXP_TO_LEGEND, EXPEDITION_COOLDOWN,
};
use starknet::ContractAddress;
use starknet::testing::{set_caller_address, set_contract_address, set_block_timestamp};

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
// Publicly verifiable rolls
//
// These prove the roll is reproducible from (seed, count) — not that it is
// fair. The caller supplies the seed, so a grinder picks their own outcome.
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

    let (owner, species, rarity, stage, exp) = PortageImpl::get_creature(@state, token_id);
    assert_eq!(owner, alice);
    assert_eq!(species, roll_species(seed, 0));
    assert_eq!(rarity, roll_rarity(seed, 0));
    assert_eq!(stage, Stage::Hatchling);
    assert_eq!(exp, 0);
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

    let (_, s0, r0, _, _) = PortageImpl::get_creature(@state, 0);
    let (_, s1, r1, _, _) = PortageImpl::get_creature(@state, 1);
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

    let (owner, _, _, _, _) = PortageImpl::get_creature(@state, token_id);
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

// ---------------------------------------------------------------------------
// Stats & evolution
// ---------------------------------------------------------------------------

#[test]
fn test_base_stats_table() {
    let ember = base_stats(Species::Ember);
    assert_eq!(ember.health, 60);
    assert_eq!(ember.attack, 90);
    assert_eq!(ember.defense, 50);
    assert_eq!(ember.speed, 70);

    let creek = base_stats(Species::Creek);
    assert_eq!(creek.health, 90);
    assert_eq!(creek.attack, 60);
    assert_eq!(creek.defense, 60);
    assert_eq!(creek.speed, 60);

    let grove = base_stats(Species::Grove);
    assert_eq!(grove.health, 100);
    assert_eq!(grove.attack, 50);
    assert_eq!(grove.defense, 80);
    assert_eq!(grove.speed, 50);

    let stone = base_stats(Species::Stone);
    assert_eq!(stone.health, 80);
    assert_eq!(stone.attack, 60);
    assert_eq!(stone.defense, 100);
    assert_eq!(stone.speed, 40);

    let mist = base_stats(Species::Mist);
    assert_eq!(mist.health, 50);
    assert_eq!(mist.attack, 80);
    assert_eq!(mist.defense, 40);
    assert_eq!(mist.speed, 100);

    let sky = base_stats(Species::Sky);
    assert_eq!(sky.health, 60);
    assert_eq!(sky.attack, 70);
    assert_eq!(sky.defense, 50);
    assert_eq!(sky.speed, 90);
}

#[test]
fn test_creature_stats_multipliers() {
    // Ember (90 attack) Epic (x2.0) Adult (x1.0) -> attack = 90 * 200 / 100 = 180.
    let ember_epic = creature_stats(Species::Ember, Rarity::Epic, Stage::Adult);
    assert_eq!(ember_epic.health, 60 * 200 / 100 * 100 / 100);
    assert_eq!(ember_epic.attack, 180);
    assert_eq!(ember_epic.defense, 50 * 200 / 100 * 100 / 100);
    assert_eq!(ember_epic.speed, 70 * 200 / 100 * 100 / 100);

    // Stone (100 defense) Mythic (x3.5) Legend (x2.0) -> defense = 700.
    let stone_mythic = creature_stats(Species::Stone, Rarity::Mythic, Stage::Legend);
    assert_eq!(stone_mythic.health, 80 * 350 / 100 * 200 / 100);
    assert_eq!(stone_mythic.attack, 60 * 350 / 100 * 200 / 100);
    assert_eq!(stone_mythic.defense, 700);
    assert_eq!(stone_mythic.speed, 40 * 350 / 100 * 200 / 100);

    // Creek (60 attack) Common (x1.0) Hatchling (x0.5) -> attack = 30.
    let creek_hatchling = creature_stats(Species::Creek, Rarity::Common, Stage::Hatchling);
    assert_eq!(creek_hatchling.health, 90 * 100 / 100 * 50 / 100);
    assert_eq!(creek_hatchling.attack, 30);
    assert_eq!(creek_hatchling.defense, 60 * 100 / 100 * 50 / 100);
    assert_eq!(creek_hatchling.speed, 60 * 100 / 100 * 50 / 100);

    // Mist (100 speed) Legendary (x2.5) Adult (x1.0) -> speed = 250.
    let mist_legendary = creature_stats(Species::Mist, Rarity::Legendary, Stage::Adult);
    assert_eq!(mist_legendary.speed, 250);
}

#[test]
fn test_get_creature_stats_view() {
    let alice = addr('ALICE');
    let mut state = Portage::contract_state_for_testing();
    set_caller_address(alice);

    let seed: felt252 = 0x123;
    let token_id = PortageImpl::hatch(ref state, seed);

    let species = roll_species(seed, 0);
    let rarity = roll_rarity(seed, 0);
    let stats = PortageImpl::get_creature_stats(@state, token_id);
    assert_eq!(stats, creature_stats(species, rarity, Stage::Hatchling));
}

/// Grant exp by running repeated expeditions, advancing the block timestamp by
/// the cooldown each time (meters the idle loop the same way the chain does).
fn grant_exp(ref state: Portage::ContractState, token_id: u256, target: u128) {
    let (_, _, _, _, mut exp) = PortageImpl::get_creature(@state, token_id);
    let mut t: u64 = EXPEDITION_COOLDOWN;
    while exp < target {
        set_block_timestamp(t);
        PortageImpl::expedition(ref state, token_id);
        let (_, _, _, _, e) = PortageImpl::get_creature(@state, token_id);
        exp = e;
        t += EXPEDITION_COOLDOWN;
    }
}

#[test]
fn test_expedition_accumulates_and_emits_event() {
    let alice = addr('ALICE');
    let portage = addr('PORTAGE');
    let mut state = Portage::contract_state_for_testing();
    set_contract_address(portage);
    set_caller_address(alice);

    let token_id = PortageImpl::hatch(ref state, 0x1);
    let (_, _, rarity, _, _) = PortageImpl::get_creature(@state, token_id);
    let yield_amount: u128 = exp_yield(rarity);

    // Drain the Hatched event.
    let _: Option<Portage::Event> = starknet::testing::pop_log(portage);

    // First expedition (advance past the initial 0 timestamp cooldown).
    set_block_timestamp(EXPEDITION_COOLDOWN);
    PortageImpl::expedition(ref state, token_id);
    let (_, _, _, _, exp) = PortageImpl::get_creature(@state, token_id);
    assert_eq!(exp, yield_amount);

    // Second expedition after another cooldown.
    set_block_timestamp(EXPEDITION_COOLDOWN * 2);
    PortageImpl::expedition(ref state, token_id);
    let (_, _, _, _, exp2) = PortageImpl::get_creature(@state, token_id);
    assert_eq!(exp2, yield_amount * 2);

    let first: Option<Portage::Event> = starknet::testing::pop_log(portage);
    assert_eq!(
        first,
        Option::Some(
            Portage::Event::ExpGained(
                Portage::ExpGained { token_id, amount: yield_amount, new_total: yield_amount },
            ),
        ),
    );
}

#[test]
#[should_panic]
fn test_expedition_reverts_on_cooldown() {
    let alice = addr('ALICE');
    let mut state = Portage::contract_state_for_testing();

    set_caller_address(alice);
    let token_id = PortageImpl::hatch(ref state, 0x1);
    PortageImpl::expedition(ref state, token_id);

    // Same timestamp -> still on cooldown -> revert.
    PortageImpl::expedition(ref state, token_id);
}

#[test]
#[should_panic]
fn test_expedition_reverts_for_non_owner() {
    let alice = addr('ALICE');
    let bob = addr('BOB');
    let mut state = Portage::contract_state_for_testing();

    set_caller_address(alice);
    let token_id = PortageImpl::hatch(ref state, 0x1);

    // Bob is not the owner -> must revert.
    set_caller_address(bob);
    PortageImpl::expedition(ref state, token_id);
}

#[test]
fn test_evolve_hatchling_to_adult_at_100() {
    let alice = addr('ALICE');
    let portage = addr('PORTAGE');
    let mut state = Portage::contract_state_for_testing();
    set_contract_address(portage);
    set_caller_address(alice);

    let token_id = PortageImpl::hatch(ref state, 0x1);
    grant_exp(ref state, token_id, EXP_TO_ADULT);
    PortageImpl::evolve(ref state, token_id);

    let (_, _, _, stage, exp) = PortageImpl::get_creature(@state, token_id);
    assert_eq!(stage, Stage::Adult);
    assert!(exp >= EXP_TO_ADULT);
}

#[test]
#[should_panic]
fn test_evolve_reverts_below_threshold() {
    let alice = addr('ALICE');
    let mut state = Portage::contract_state_for_testing();

    set_caller_address(alice);
    let token_id = PortageImpl::hatch(ref state, 0x1);
    // No exp -> evolve must revert.
    PortageImpl::evolve(ref state, token_id);
}

#[test]
fn test_evolve_adult_to_legend_at_500() {
    let alice = addr('ALICE');
    let mut state = Portage::contract_state_for_testing();

    set_caller_address(alice);
    let token_id = PortageImpl::hatch(ref state, 0x1);

    grant_exp(ref state, token_id, EXP_TO_LEGEND);
    PortageImpl::evolve(ref state, token_id); // Hatchling -> Adult
    PortageImpl::evolve(ref state, token_id); // Adult -> Legend

    let (_, _, _, stage, exp) = PortageImpl::get_creature(@state, token_id);
    assert_eq!(stage, Stage::Legend);
    assert!(exp >= EXP_TO_LEGEND);
}

#[test]
#[should_panic]
fn test_evolve_reverts_at_legend() {
    let alice = addr('ALICE');
    let mut state = Portage::contract_state_for_testing();

    set_caller_address(alice);
    let token_id = PortageImpl::hatch(ref state, 0x1);

    grant_exp(ref state, token_id, EXP_TO_LEGEND);
    PortageImpl::evolve(ref state, token_id); // Hatchling -> Adult
    PortageImpl::evolve(ref state, token_id); // Adult -> Legend
    PortageImpl::evolve(ref state, token_id); // Legend -> revert
}

#[test]
#[should_panic]
fn test_evolve_reverts_for_non_owner() {
    let alice = addr('ALICE');
    let bob = addr('BOB');
    let mut state = Portage::contract_state_for_testing();

    set_caller_address(alice);
    let token_id = PortageImpl::hatch(ref state, 0x1);
    grant_exp(ref state, token_id, EXP_TO_ADULT);

    // Bob is not the owner -> must revert.
    set_caller_address(bob);
    PortageImpl::evolve(ref state, token_id);
}
