//! Portage.fun core contract (v0).
//!
//! Implements the three pillars of the v0 game loop:
//!   1. a provably-fair `hatch` (rarity/species RNG committed on-chain),
//!   2. the creature NFT (mint, own, transfer) with rarity + species + stage,
//!   3. a minimal marketplace (list / buy / cancel) with a 2.5% rake.
//!
//! Rarity odds are a FIXED public table (see the `WEIGHT_*` constants below) so
//! anyone can recompute and verify a hatch was fair: `r = poseidon(seed, count)`
//! picks rarity by weight, `poseidon(seed, count, 1) mod 6` picks species.
//!
//! Marketplace settlement note (v0): there is no ERC-20 in the repo yet, so
//! `buy` records the sale on-chain (seller/buyer/price/rake/proceeds in the
//! `Sold` event) instead of moving tokens. Wiring the real STRK transfer through
//! the STRK20 privacy pool is the next iteration; the `Sold` event keeps the
//! rake math verifiable today.

use starknet::ContractAddress;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// The 6 biomes a creature can come from.
#[derive(Copy, Drop, Serde, PartialEq, Debug, Default, starknet::Store)]
pub enum Species {
    #[default]
    Ember,
    Creek,
    Grove,
    Stone,
    Mist,
    Sky,
}

/// Creature rarity, from most common to rarest.
#[derive(Copy, Drop, Serde, PartialEq, Debug, Default, starknet::Store)]
pub enum Rarity {
    #[default]
    Common,
    Uncommon,
    Rare,
    Epic,
    Legendary,
    Mythic,
}

/// Growth stage of a creature (evolution is a later milestone).
#[derive(Copy, Drop, Serde, PartialEq, Debug, Default, starknet::Store)]
pub enum Stage {
    #[default]
    Hatchling,
    Adult,
    Legend,
}

// ---------------------------------------------------------------------------
// On-chain, verifiable rarity table (weights sum to TOTAL_WEIGHT = 100)
// ---------------------------------------------------------------------------

pub const WEIGHT_COMMON: u16 = 40;
pub const WEIGHT_UNCOMMON: u16 = 25;
pub const WEIGHT_RARE: u16 = 15;
pub const WEIGHT_EPIC: u16 = 10;
pub const WEIGHT_LEGENDARY: u16 = 7;
pub const WEIGHT_MYTHIC: u16 = 3;
pub const TOTAL_WEIGHT: u16 = 100;

// ---------------------------------------------------------------------------
// Marketplace economics
// ---------------------------------------------------------------------------

/// Protocol rake, in basis points: 250 = 2.50%.
pub const RAKE_BPS: u128 = 250;
pub const BPS_DENOMINATOR: u128 = 10000;

// ---------------------------------------------------------------------------
// Hatch RNG
// ---------------------------------------------------------------------------

/// Number of species in the pool; species = poseidon(seed, count, 1) % 6.
pub const SPECIES_COUNT: felt252 = 6;

// ---------------------------------------------------------------------------
// On-chain records
// ---------------------------------------------------------------------------

/// A minted creature. Owned by a single address at a time.
#[derive(Copy, Drop, Serde, PartialEq, Debug, starknet::Store)]
pub struct Creature {
    pub owner: ContractAddress,
    pub species: Species,
    pub rarity: Rarity,
    pub stage: Stage,
}

/// A marketplace listing. `price == 0` means "not listed" (sentinel).
#[derive(Copy, Drop, Serde, PartialEq, Debug, starknet::Store)]
pub struct Listing {
    pub seller: ContractAddress,
    pub price: u128,
}

// ---------------------------------------------------------------------------
// External interface
// ---------------------------------------------------------------------------

#[starknet::interface]
pub trait IPortage<TState> {
    fn hatch(ref self: TState, seed: felt252) -> u256;
    fn owner_of(self: @TState, token_id: u256) -> ContractAddress;
    fn transfer_from(ref self: TState, to: ContractAddress, token_id: u256);
    fn get_creature(self: @TState, token_id: u256) -> (ContractAddress, Species, Rarity, Stage);
    fn list(ref self: TState, token_id: u256, price: u128);
    fn buy(ref self: TState, token_id: u256);
    fn cancel(ref self: TState, token_id: u256);
    fn get_listing(self: @TState, token_id: u256) -> (ContractAddress, u128);
    fn get_hatch_count(self: @TState) -> u64;
    fn get_rarity_weights(self: @TState) -> Span<u16>;
    fn get_total_supply(self: @TState) -> u256;
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[starknet::contract]
pub mod Portage {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use core::poseidon::poseidon_hash_span;
    use super::{
        Creature, Listing, Rarity, Species, Stage, IPortage, WEIGHT_COMMON, WEIGHT_UNCOMMON,
        WEIGHT_RARE, WEIGHT_EPIC, WEIGHT_LEGENDARY, WEIGHT_MYTHIC, TOTAL_WEIGHT, RAKE_BPS,
        BPS_DENOMINATOR, SPECIES_COUNT,
    };

    mod errors {
        pub const NOT_OWNER: felt252 = 'NOT_OWNER';
        pub const NOT_LISTED: felt252 = 'NOT_LISTED';
        pub const ALREADY_LISTED: felt252 = 'ALREADY_LISTED';
        pub const INVALID_PRICE: felt252 = 'INVALID_PRICE';
        pub const NOT_FOUND: felt252 = 'NOT_FOUND';
    }

    #[storage]
    struct Storage {
        creatures: Map<u256, Creature>,
        listings: Map<u256, Listing>,
        hatch_count: u64,
        total_supply: u256,
    }

    #[event]
    #[derive(Copy, Drop, PartialEq, Debug, starknet::Event)]
    pub enum Event {
        Hatched: Hatched,
        Listed: Listed,
        Sold: Sold,
        Cancelled: Cancelled,
    }

    #[derive(Copy, Drop, PartialEq, Debug, starknet::Event)]
    pub struct Hatched {
        #[key]
        pub token_id: u256,
        pub species: Species,
        pub rarity: Rarity,
        pub seed: felt252,
        pub owner: ContractAddress,
    }

    #[derive(Copy, Drop, PartialEq, Debug, starknet::Event)]
    pub struct Listed {
        #[key]
        pub token_id: u256,
        pub seller: ContractAddress,
        pub price: u128,
    }

    #[derive(Copy, Drop, PartialEq, Debug, starknet::Event)]
    pub struct Sold {
        #[key]
        pub token_id: u256,
        pub seller: ContractAddress,
        pub buyer: ContractAddress,
        pub price: u128,
        pub rake: u128,
        pub proceeds: u128,
    }

    #[derive(Copy, Drop, PartialEq, Debug, starknet::Event)]
    pub struct Cancelled {
        #[key]
        pub token_id: u256,
        pub seller: ContractAddress,
    }

    // -----------------------------------------------------------------------
    // Pure roll helpers. Public so off-chain verifiers and tests can recompute
    // the exact same result from (seed, hatch_count).
    // -----------------------------------------------------------------------

    /// Rarity roll: `poseidon(seed, hatch_count) mod 100` mapped onto the fixed
    /// weight table.
    pub fn roll_rarity(seed: felt252, count: u64) -> Rarity {
        let r: felt252 = poseidon_hash_span(array![seed, count.into()].span());
        let roll: u256 = r.into() % TOTAL_WEIGHT.into();

        let common: u256 = WEIGHT_COMMON.into();
        let uncommon: u256 = WEIGHT_UNCOMMON.into();
        let rare: u256 = WEIGHT_RARE.into();
        let epic: u256 = WEIGHT_EPIC.into();
        let legendary: u256 = WEIGHT_LEGENDARY.into();

        if roll < common {
            Rarity::Common
        } else if roll < common + uncommon {
            Rarity::Uncommon
        } else if roll < common + uncommon + rare {
            Rarity::Rare
        } else if roll < common + uncommon + rare + epic {
            Rarity::Epic
        } else if roll < common + uncommon + rare + epic + legendary {
            Rarity::Legendary
        } else {
            Rarity::Mythic
        }
    }

    /// Species roll: `poseidon(seed, hatch_count, 1) mod 6`.
    pub fn roll_species(seed: felt252, count: u64) -> Species {
        let s: felt252 = poseidon_hash_span(array![seed, count.into(), 1].span());
        let idx: u256 = s.into() % SPECIES_COUNT.into();
        if idx == 0 {
            Species::Ember
        } else if idx == 1 {
            Species::Creek
        } else if idx == 2 {
            Species::Grove
        } else if idx == 3 {
            Species::Stone
        } else if idx == 4 {
            Species::Mist
        } else {
            Species::Sky
        }
    }

    #[abi(embed_v0)]
    pub impl PortageImpl of IPortage<ContractState> {
        fn hatch(ref self: ContractState, seed: felt252) -> u256 {
            let count = self.hatch_count.read();
            let rarity = roll_rarity(seed, count);
            let species = roll_species(seed, count);
            let owner = get_caller_address();
            let token_id: u256 = count.into();

            let creature = Creature { owner, species, rarity, stage: Stage::Hatchling };
            self.creatures.write(token_id, creature);
            self.hatch_count.write(count + 1);
            self.total_supply.write(self.total_supply.read() + 1);

            self.emit(Hatched { token_id, species, rarity, seed, owner });
            token_id
        }

        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            self.creatures.read(token_id).owner
        }

        fn transfer_from(ref self: ContractState, to: ContractAddress, token_id: u256) {
            let caller = get_caller_address();
            let mut creature = self.creatures.read(token_id);
            assert(creature.owner == caller, errors::NOT_OWNER);
            creature.owner = to;
            self.creatures.write(token_id, creature);
        }

        fn get_creature(
            self: @ContractState, token_id: u256,
        ) -> (ContractAddress, Species, Rarity, Stage) {
            let c = self.creatures.read(token_id);
            (c.owner, c.species, c.rarity, c.stage)
        }

        fn list(ref self: ContractState, token_id: u256, price: u128) {
            let caller = get_caller_address();
            let creature = self.creatures.read(token_id);
            assert(creature.owner == caller, errors::NOT_OWNER);
            assert(price > 0, errors::INVALID_PRICE);
            assert(self.listings.read(token_id).price == 0, errors::ALREADY_LISTED);

            self.listings.write(token_id, Listing { seller: caller, price });
            self.emit(Listed { token_id, seller: caller, price });
        }

        fn buy(ref self: ContractState, token_id: u256) {
            let buyer = get_caller_address();
            let listing = self.listings.read(token_id);
            assert(listing.price != 0, errors::NOT_LISTED);

            let mut creature = self.creatures.read(token_id);
            assert(creature.owner == listing.seller, errors::NOT_FOUND);

            // Rake kept by the protocol; the remainder goes to the seller.
            // Compute in u256 so a large price can never overflow u128.
            let price_u256: u256 = listing.price.into();
            let rake_u256: u256 = price_u256 * RAKE_BPS.into() / BPS_DENOMINATOR.into();
            let rake: u128 = rake_u256.try_into().unwrap();
            let proceeds: u128 = listing.price - rake;

            // Clear the listing and move the creature to the buyer.
            self.listings.write(token_id, Listing { seller: 0.try_into().unwrap(), price: 0 });
            creature.owner = buyer;
            self.creatures.write(token_id, creature);

            // v0 settlement: recorded on-chain (no ERC-20 yet). The STRK transfer
            // through the STRK20 privacy pool lands in the next iteration.
            self
                .emit(
                    Sold {
                        token_id,
                        seller: listing.seller,
                        buyer,
                        price: listing.price,
                        rake,
                        proceeds,
                    },
                );
        }

        fn cancel(ref self: ContractState, token_id: u256) {
            let caller = get_caller_address();
            let listing = self.listings.read(token_id);
            assert(listing.price != 0, errors::NOT_LISTED);
            assert(listing.seller == caller, errors::NOT_OWNER);

            self.listings.write(token_id, Listing { seller: 0.try_into().unwrap(), price: 0 });
            self.emit(Cancelled { token_id, seller: caller });
        }

        fn get_listing(self: @ContractState, token_id: u256) -> (ContractAddress, u128) {
            let l = self.listings.read(token_id);
            (l.seller, l.price)
        }

        fn get_hatch_count(self: @ContractState) -> u64 {
            self.hatch_count.read()
        }

        fn get_rarity_weights(self: @ContractState) -> Span<u16> {
            array![
                WEIGHT_COMMON,
                WEIGHT_UNCOMMON,
                WEIGHT_RARE,
                WEIGHT_EPIC,
                WEIGHT_LEGENDARY,
                WEIGHT_MYTHIC,
            ]
                .span()
        }

        fn get_total_supply(self: @ContractState) -> u256 {
            self.total_supply.read()
        }
    }
}
