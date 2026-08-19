//! Portage.fun core contract (v0).
//!
//! Implements the three pillars of the v0 game loop:
//!   1. a `hatch` whose rarity/species roll is publicly verifiable,
//!   2. the creature NFT (mint, own, transfer) with rarity + species + stage,
//!   3. a minimal marketplace (list / buy / cancel) with a 2.5% rake.
//!
//! Rarity odds are a FIXED public table (see the `WEIGHT_*` constants below) so
//! anyone can recompute a hatch and confirm the contract followed it:
//! `r = poseidon(seed, count)` picks rarity by weight, and
//! `poseidon(seed, count, 1) mod 6` picks species.
//!
//! Verifiable is not the same as fair, and the seed is where the difference
//! lives. `hatch(seed)` used to take it straight from the caller, which let the
//! person who benefits from the outcome choose the input to it: grind seeds
//! off-chain until one rolls Mythic, submit only that one. Every roll was
//! checkable and none of them was fair.
//!
//! Hatching is therefore two steps, and neither party holds both halves of the
//! entropy:
//!
//!   1. `commit_hatch(poseidon(secret, caller))` publishes a sealed promise.
//!      The secret stays with the player, so the sequencer cannot see it.
//!   2. `reveal_hatch(secret)`, at least `REVEAL_DELAY` blocks later, rolls
//!      from `poseidon(secret, block_hash(commit_block), commit_block)`. That
//!      block hash did not exist when the promise was made, so the player
//!      cannot grind it; and it is mixed with a secret the sequencer never saw,
//!      so choosing block contents does not steer the result either.
//!
//! What this does not do is make walking away free to punish. A player can
//! always decline to reveal and commit again, and the honest deterrent is that
//! doing so costs them the commitment — which bites properly once hatching is
//! paid for. One open commitment per address stops the cheaper version of that
//! attack, where a grinder holds several promises at once and redeems only the
//! one that landed well.
//!
//! `Hatched` publishes the secret, the block hash and the commit block
//! alongside the mixed seed, so the whole derivation can be recomputed from
//! outside and not merely the final roll.
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

/// Exp thresholds driving evolution (Hatchling -> Adult -> Legend).
pub const EXP_TO_ADULT: u128 = 100;
pub const EXP_TO_LEGEND: u128 = 500;

/// Cooldown between expeditions, in seconds (demo-friendly; tune for prod).
pub const EXPEDITION_COOLDOWN: u64 = 60;

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
    pub exp: u128,
}

/// Derived stats for a creature: base species stats scaled by rarity and stage.
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct Stats {
    pub health: u128,
    pub attack: u128,
    pub defense: u128,
    pub speed: u128,
}

/// A marketplace listing. `price == 0` means "not listed" (sentinel).
#[derive(Copy, Drop, Serde, PartialEq, Debug, starknet::Store)]
pub struct Listing {
    pub seller: ContractAddress,
    pub price: u128,
}

/// An open hatch commitment: what was promised, and the block it was made in.
#[derive(Copy, Drop, Serde, PartialEq, Debug, Default, starknet::Store)]
pub struct Commitment {
    /// `poseidon(secret, caller)`. Zero means no open commitment.
    pub digest: felt252,
    /// Block the commitment was mined in; its hash is half of the entropy.
    pub block: u64,
}

// ---------------------------------------------------------------------------
// Commit-reveal timing
// ---------------------------------------------------------------------------

/// Blocks that must pass before a commitment can be revealed.
///
/// `get_block_hash_syscall` only answers for blocks at least 10 behind the
/// current one, so this is the protocol's floor and not a tuning choice.
pub const REVEAL_DELAY: u64 = 10;

/// Blocks after which a commitment can no longer be revealed.
///
/// This is a policy, not a protocol limit — worth being exact about, because
/// it was first written down as one. `get_block_hash_syscall` answers for
/// `[first_v0_12_0_block, current_block - 10]`: only the lower bound is real,
/// and an old block's hash stays retrievable indefinitely. Nothing forces a
/// commitment to expire.
///
/// It expires anyway, because an open promise that never dies is a slot that
/// never frees, and because walking away from a roll should cost something.
/// A player who dislikes what they are about to reveal can always decline and
/// commit again; the deterrent is that doing so forfeits this commitment,
/// which bites properly once hatching is paid for.
pub const REVEAL_WINDOW: u64 = 1000;

// ---------------------------------------------------------------------------
// External interface
// ---------------------------------------------------------------------------

#[starknet::interface]
pub trait IPortage<TState> {
    /// Promise a hatch. `digest` must be `poseidon(secret, caller)`.
    fn commit_hatch(ref self: TState, digest: felt252);
    /// Redeem a promise made at least `REVEAL_DELAY` blocks ago.
    fn reveal_hatch(ref self: TState, secret: felt252) -> u256;
    /// The caller's open commitment, or a zero digest when there is none.
    fn get_commitment(self: @TState, who: ContractAddress) -> (felt252, u64);
    /// The mixed entropy a reveal would use, so a client can show its own work.
    fn preview_entropy(self: @TState, secret: felt252, commit_block: u64) -> felt252;
    fn owner_of(self: @TState, token_id: u256) -> ContractAddress;
    fn transfer_from(ref self: TState, to: ContractAddress, token_id: u256);
    fn get_creature(
        self: @TState, token_id: u256,
    ) -> (ContractAddress, Species, Rarity, Stage, u128);
    fn get_creature_stats(self: @TState, token_id: u256) -> Stats;
    fn expedition(ref self: TState, token_id: u256);
    fn evolve(ref self: TState, token_id: u256);
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
    use starknet::{
        ContractAddress, get_caller_address, get_block_timestamp, get_block_number,
    };
    use starknet::syscalls::get_block_hash_syscall;
    use core::poseidon::poseidon_hash_span;
    use super::{
        Commitment, Creature, Listing, Rarity, Species, Stage, Stats, IPortage, WEIGHT_COMMON,
        WEIGHT_UNCOMMON, WEIGHT_RARE, WEIGHT_EPIC, WEIGHT_LEGENDARY, WEIGHT_MYTHIC, TOTAL_WEIGHT,
        RAKE_BPS, BPS_DENOMINATOR, SPECIES_COUNT, EXP_TO_ADULT, EXP_TO_LEGEND, EXPEDITION_COOLDOWN,
        REVEAL_DELAY, REVEAL_WINDOW,
    };

    mod errors {
        pub const NOT_OWNER: felt252 = 'NOT_OWNER';
        pub const NOT_LISTED: felt252 = 'NOT_LISTED';
        pub const ALREADY_LISTED: felt252 = 'ALREADY_LISTED';
        pub const INVALID_PRICE: felt252 = 'INVALID_PRICE';
        pub const NOT_FOUND: felt252 = 'NOT_FOUND';
        pub const NOT_READY: felt252 = 'NOT_READY';
        pub const ON_COOLDOWN: felt252 = 'ON_COOLDOWN';
        pub const COMMIT_OPEN: felt252 = 'COMMIT_OPEN';
        pub const NO_COMMIT: felt252 = 'NO_COMMIT';
        pub const BAD_SECRET: felt252 = 'BAD_SECRET';
        pub const TOO_EARLY: felt252 = 'TOO_EARLY';
        pub const COMMIT_EXPIRED: felt252 = 'COMMIT_EXPIRED';
        pub const ZERO_DIGEST: felt252 = 'ZERO_DIGEST';
    }

    #[storage]
    struct Storage {
        creatures: Map<u256, Creature>,
        listings: Map<u256, Listing>,
        last_expedition: Map<u256, u64>,
        /// One open hatch promise per address, so a grinder cannot keep a
        /// spread of commitments open and reveal only the one that landed well.
        commitments: Map<ContractAddress, Commitment>,
        hatch_count: u64,
        total_supply: u256,
    }

    #[event]
    #[derive(Copy, Drop, PartialEq, Debug, starknet::Event)]
    pub enum Event {
        Committed: Committed,
        Hatched: Hatched,
        Listed: Listed,
        Sold: Sold,
        Cancelled: Cancelled,
        ExpGained: ExpGained,
        Evolved: Evolved,
    }

    /// A promise made. Published so the wait is visible and so anyone can later
    /// check the reveal against the digest that was standing at this block.
    #[derive(Copy, Drop, PartialEq, Debug, starknet::Event)]
    pub struct Committed {
        #[key]
        pub who: ContractAddress,
        pub digest: felt252,
        pub commit_block: u64,
    }

    /// A hatch, with every input needed to recompute it from outside.
    ///
    /// `seed` is the mixed entropy the rolls actually consumed, so the existing
    /// `roll_rarity(seed, count)` check still works unchanged. The three
    /// components are published alongside it so the mixing itself is checkable
    /// too, rather than having to be taken on trust.
    #[derive(Copy, Drop, PartialEq, Debug, starknet::Event)]
    pub struct Hatched {
        #[key]
        pub token_id: u256,
        pub species: Species,
        pub rarity: Rarity,
        pub seed: felt252,
        pub secret: felt252,
        pub block_hash: felt252,
        pub commit_block: u64,
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

    #[derive(Copy, Drop, PartialEq, Debug, starknet::Event)]
    pub struct ExpGained {
        #[key]
        pub token_id: u256,
        pub amount: u128,
        pub new_total: u128,
    }

    #[derive(Copy, Drop, PartialEq, Debug, starknet::Event)]
    pub struct Evolved {
        #[key]
        pub token_id: u256,
        pub from_stage: Stage,
        pub to_stage: Stage,
    }

    // -----------------------------------------------------------------------
    // Pure roll helpers. Public so off-chain verifiers and tests can recompute
    // the exact same result from (seed, hatch_count).
    // -----------------------------------------------------------------------

    /// Mint a creature from an already-decided seed.
    ///
    /// Test-only, and `#[cfg(test)]` so it is compiled out of every build that
    /// is not the test binary — it cannot exist in the class that goes on
    /// chain. It exists because `reveal_hatch` needs a real block hash, and
    /// `cairo_test` has no chain behind it: `get_block_hash_syscall` returns an
    /// error there, so every test that merely needs a creature to exist in
    /// order to test expeditions, evolution or the marketplace would otherwise
    /// be unable to make one. The commit-reveal path itself is covered by its
    /// pure functions and its guards below, and end to end on Sepolia.
    #[cfg(test)]
    pub fn mint_for_testing(ref self: ContractState, seed: felt252) -> u256 {
        let owner = get_caller_address();
        let count = self.hatch_count.read();
        let rarity = roll_rarity(seed, count);
        let species = roll_species(seed, count);
        let token_id: u256 = count.into();
        let creature = Creature { owner, species, rarity, stage: Stage::Hatchling, exp: 0 };
        self.creatures.write(token_id, creature);
        self.hatch_count.write(count + 1);
        self.total_supply.write(self.total_supply.read() + 1);
        token_id
    }

    /// The digest a player must publish to open a hatch.
    ///
    /// Binding the caller into it means a secret observed in the mempool during
    /// someone else's reveal cannot be replayed by whoever saw it: the digest
    /// it hashes to belongs to an address they do not control.
    pub fn commitment_digest(secret: felt252, who: ContractAddress) -> felt252 {
        poseidon_hash_span(array![secret, who.into()].span())
    }

    /// The seed a hatch actually rolls from.
    ///
    /// Two halves, and neither party holds both. The player picks `secret` and
    /// is bound to it by their commitment before the block hash exists. The
    /// block hash is fixed by the chain after that commitment is already
    /// mined, so the player cannot grind it — and because it is mixed with a
    /// secret the sequencer never sees, the sequencer cannot steer the outcome
    /// by choosing block contents either.
    pub fn mix_entropy(secret: felt252, block_hash: felt252, commit_block: u64) -> felt252 {
        poseidon_hash_span(array![secret, block_hash, commit_block.into()].span())
    }

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

    // -----------------------------------------------------------------------
    // Stats & evolution helpers (pure, public for tests & off-chain clients).
    // -----------------------------------------------------------------------

    /// Base (unscaled) stats for each species.
    pub fn base_stats(species: Species) -> Stats {
        match species {
            Species::Ember => Stats { health: 60, attack: 90, defense: 50, speed: 70 },
            Species::Creek => Stats { health: 90, attack: 60, defense: 60, speed: 60 },
            Species::Grove => Stats { health: 100, attack: 50, defense: 80, speed: 50 },
            Species::Stone => Stats { health: 80, attack: 60, defense: 100, speed: 40 },
            Species::Mist => Stats { health: 50, attack: 80, defense: 40, speed: 100 },
            Species::Sky => Stats { health: 60, attack: 70, defense: 50, speed: 90 },
        }
    }

    /// Rarity multiplier numerator (basis points): 100 = x1.0 ... 350 = x3.5.
    fn rarity_mult_numer(rarity: Rarity) -> u128 {
        match rarity {
            Rarity::Common => 100,
            Rarity::Uncommon => 130,
            Rarity::Rare => 160,
            Rarity::Epic => 200,
            Rarity::Legendary => 250,
            Rarity::Mythic => 350,
        }
    }

    /// Stage multiplier numerator (basis points): 50 = x0.5 ... 200 = x2.0.
    fn stage_mult_numer(stage: Stage) -> u128 {
        match stage {
            Stage::Hatchling => 50,
            Stage::Adult => 100,
            Stage::Legend => 200,
        }
    }

    /// Final stats = base * rarity_mult / 100 * stage_mult / 100 (integer math).
    pub fn creature_stats(species: Species, rarity: Rarity, stage: Stage) -> Stats {
        let base = base_stats(species);
        let r = rarity_mult_numer(rarity);
        let s = stage_mult_numer(stage);
        Stats {
            health: base.health * r / 100 * s / 100,
            attack: base.attack * r / 100 * s / 100,
            defense: base.defense * r / 100 * s / 100,
            speed: base.speed * r / 100 * s / 100,
        }
    }

    /// Exp earned per expedition tick, scaled by rarity (rarity_mult / 10).
    pub fn exp_yield(rarity: Rarity) -> u128 {
        match rarity {
            Rarity::Common => 10,
            Rarity::Uncommon => 13,
            Rarity::Rare => 16,
            Rarity::Epic => 20,
            Rarity::Legendary => 25,
            Rarity::Mythic => 35,
        }
    }

    #[abi(embed_v0)]
    pub impl PortageImpl of IPortage<ContractState> {
        fn commit_hatch(ref self: ContractState, digest: felt252) {
            // A zero digest is the "no commitment" marker in storage, so it can
            // never be a real one.
            assert(digest != 0, errors::ZERO_DIGEST);
            let who = get_caller_address();
            let current = get_block_number();
            let open = self.commitments.read(who);

            // An expired promise is not in the way — it can no longer be
            // revealed, so the slot is free. A live one is: allowing a second
            // would let a grinder hold several and redeem only the best.
            if open.digest != 0 {
                assert(current > open.block + REVEAL_WINDOW, errors::COMMIT_OPEN);
            }

            self.commitments.write(who, Commitment { digest, block: current });
            self.emit(Committed { who, digest, commit_block: current });
        }

        fn reveal_hatch(ref self: ContractState, secret: felt252) -> u256 {
            let owner = get_caller_address();
            let open = self.commitments.read(owner);
            assert(open.digest != 0, errors::NO_COMMIT);
            assert(commitment_digest(secret, owner) == open.digest, errors::BAD_SECRET);

            // The wait is what makes this fair, so it is enforced rather than
            // assumed: the block hash below does not exist yet before it.
            let current = get_block_number();
            assert(current >= open.block + REVEAL_DELAY, errors::TOO_EARLY);
            assert(current <= open.block + REVEAL_WINDOW, errors::COMMIT_EXPIRED);

            let block_hash = get_block_hash_syscall(open.block).unwrap();
            let seed = mix_entropy(secret, block_hash, open.block);

            let count = self.hatch_count.read();
            let rarity = roll_rarity(seed, count);
            let species = roll_species(seed, count);
            let token_id: u256 = count.into();

            // Spend the commitment before minting, so a reveal can never be
            // replayed against the same promise.
            self.commitments.write(owner, Commitment { digest: 0, block: 0 });

            let creature = Creature { owner, species, rarity, stage: Stage::Hatchling, exp: 0 };
            self.creatures.write(token_id, creature);
            self.hatch_count.write(count + 1);
            self.total_supply.write(self.total_supply.read() + 1);

            self.emit(
                Hatched {
                    token_id, species, rarity, seed, secret, block_hash,
                    commit_block: open.block, owner,
                },
            );
            token_id
        }

        fn get_commitment(self: @ContractState, who: ContractAddress) -> (felt252, u64) {
            let open = self.commitments.read(who);
            (open.digest, open.block)
        }

        fn preview_entropy(
            self: @ContractState, secret: felt252, commit_block: u64,
        ) -> felt252 {
            let block_hash = get_block_hash_syscall(commit_block).unwrap();
            mix_entropy(secret, block_hash, commit_block)
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
        ) -> (ContractAddress, Species, Rarity, Stage, u128) {
            let c = self.creatures.read(token_id);
            (c.owner, c.species, c.rarity, c.stage, c.exp)
        }

        fn get_creature_stats(self: @ContractState, token_id: u256) -> Stats {
            let c = self.creatures.read(token_id);
            creature_stats(c.species, c.rarity, c.stage)
        }

        fn expedition(ref self: ContractState, token_id: u256) {
            let caller = get_caller_address();
            let mut creature = self.creatures.read(token_id);
            assert(creature.owner == caller, errors::NOT_OWNER);

            let now = get_block_timestamp();
            let last = self.last_expedition.read(token_id);
            assert(now >= last + EXPEDITION_COOLDOWN, errors::ON_COOLDOWN);

            let amount = exp_yield(creature.rarity);
            creature.exp += amount;
            self.creatures.write(token_id, creature);
            self.last_expedition.write(token_id, now);
            self.emit(ExpGained { token_id, amount, new_total: creature.exp });
        }

        fn evolve(ref self: ContractState, token_id: u256) {
            let caller = get_caller_address();
            let mut creature = self.creatures.read(token_id);
            assert(creature.owner == caller, errors::NOT_OWNER);

            let from_stage = creature.stage;
            if from_stage == Stage::Hatchling {
                assert(creature.exp >= EXP_TO_ADULT, errors::NOT_READY);
                creature.stage = Stage::Adult;
            } else if from_stage == Stage::Adult {
                assert(creature.exp >= EXP_TO_LEGEND, errors::NOT_READY);
                creature.stage = Stage::Legend;
            } else {
                assert(false, errors::NOT_READY);
            }
            self.creatures.write(token_id, creature);
            self.emit(Evolved { token_id, from_stage, to_stage: creature.stage });
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
