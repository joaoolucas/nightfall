//! Nightfall: One Night — fair game engine (One Night Werewolf).
//!
//! v0: a plain Starknet contract implementing the turn-based state machine from
//! `docs/SPEC.md` §5. Roles are dealt deterministically from a committed seed
//! (trusted dealer for v0); the STRK20 privacy pool / anonymizer wiring
//! (`privacy_invoke`) lands in a later wave.

use core::hash::HashStateTrait;
use core::poseidon::PoseidonTrait;
use starknet::ContractAddress;

/// Minimum number of players for a game (SPEC: 3+ wallets happy path).
pub const MIN_PLAYERS: u32 = 3;
/// Maximum number of players per game (One Night Werewolf table size).
pub const MAX_PLAYERS: u32 = 12;

/// Turn-based game phases (SPEC §5).
#[derive(Drop, Copy, Serde, starknet::Store, PartialEq, Debug)]
pub enum Phase {
    #[default]
    Lobby,
    Deal,
    Night,
    Day,
    Vote,
    Reveal,
    Settle,
}

/// MVP roles (SPEC §5).
#[derive(Drop, Copy, Serde, starknet::Store, PartialEq, Debug)]
pub enum Role {
    Werewolf,
    Minion,
    Seer,
    Robber,
    Troublemaker,
    #[default]
    Villager,
}

/// Game outcome.
#[derive(Drop, Copy, Serde, starknet::Store, PartialEq, Debug)]
pub enum Winner {
    #[default]
    None,
    Wolves,
    Village,
}

/// True if `role` belongs to the wolves team. The Minion is on the wolves team
/// (it sees the wolves) even though wolves do not see the Minion (SPEC §5).
pub fn is_wolf_team(role: Role) -> bool {
    role == Role::Werewolf || role == Role::Minion
}

/// Builds the canonical role list for `player_count` players (>= [`MIN_PLAYERS`]).
///
/// Returns exactly `player_count` roles. Composition follows a standard One Night
/// Werewolf setup that grows with the table.
pub fn build_role_list(player_count: u32) -> Array<Role> {
    let mut roles: Array<Role> = array![];
    if player_count == 3 {
        roles.append(Role::Werewolf);
        roles.append(Role::Seer);
        roles.append(Role::Villager);
    } else if player_count == 4 {
        roles.append(Role::Werewolf);
        roles.append(Role::Seer);
        roles.append(Role::Villager);
        roles.append(Role::Villager);
    } else if player_count == 5 {
        roles.append(Role::Werewolf);
        roles.append(Role::Werewolf);
        roles.append(Role::Minion);
        roles.append(Role::Seer);
        roles.append(Role::Robber);
    } else {
        roles.append(Role::Werewolf);
        roles.append(Role::Werewolf);
        roles.append(Role::Minion);
        roles.append(Role::Seer);
        roles.append(Role::Robber);
        roles.append(Role::Troublemaker);
        let mut extra = player_count - 6;
        while extra > 0 {
            roles.append(Role::Villager);
            extra -= 1;
        }
    }
    roles
}

/// `x mod m` for a small nonzero `m` (result is `< m`, so it fits in `u32`).
/// `felt252` has no `%` operator, so we reduce through `u256`.
fn felt_mod_u32(x: felt252, m: u32) -> u32 {
    let x_u256: u256 = x.into();
    let m_u256: u256 = m.into();
    let r: u256 = x_u256 % m_u256;
    r.try_into().unwrap()
}

/// Deterministically shuffles [`build_role_list`] with a Fisher-Yates pass whose
/// randomness is derived from `seed` via Poseidon. The returned array has one
/// role per seat, indexed by seat id (0-based).
pub fn deal_roles(seed: felt252, player_count: u32) -> Array<Role> {
    let canonical = build_role_list(player_count);
    let n = canonical.len();

    // Copy canonical roles into a working array we can consume.
    let mut remaining: Array<Role> = array![];
    let mut k: u32 = 0;
    while k < n {
        remaining.append(*canonical[k]);
        k += 1;
    }

    let mut result: Array<Role> = array![];
    let mut i = n;
    while i > 0 {
        let h = PoseidonTrait::new().update(seed).update(i.into()).finalize();
        let j: u32 = felt_mod_u32(h, i);
        result.append(*remaining[j]);

        // Rebuild `remaining` without index `j`.
        let mut next: Array<Role> = array![];
        let mut m: u32 = 0;
        while m < i {
            if m != j {
                next.append(*remaining[m]);
            }
            m += 1;
        }
        remaining = next;
        i -= 1;
    }
    result
}

/// Winner determination (SPEC §5): wolves win if no wolf-team member received a
/// vote; the village wins if any wolf-team member was voted. `roles` and `votes`
/// are indexed by seat and must be the same length.
pub fn determine_winner(roles: Span<Role>, votes: Span<u32>) -> Winner {
    let mut any_wolf_voted = false;
    let mut i: u32 = 0;
    while i < votes.len() {
        let target = *votes[i];
        if is_wolf_team(*roles[target]) {
            any_wolf_voted = true;
            break;
        }
        i += 1;
    }
    if any_wolf_voted {
        Winner::Village
    } else {
        Winner::Wolves
    }
}

#[starknet::interface]
pub trait INightfall<TState> {
    fn join_game(ref self: TState);
    fn start_game(ref self: TState, seed: felt252);
    fn night_action(ref self: TState, seat: u32, target: u32);
    fn end_night(ref self: TState);
    fn begin_vote(ref self: TState);
    fn cast_vote(ref self: TState, seat: u32, target: u32);
    fn end_vote(ref self: TState);
    fn reveal_role(ref self: TState, seat: u32);
    fn settle(ref self: TState);

    fn get_phase(self: @TState) -> Phase;
    fn get_seed(self: @TState) -> felt252;
    fn get_seat_count(self: @TState) -> u32;
    fn get_seat(self: @TState, seat: u32) -> ContractAddress;
    fn get_role(self: @TState, seat: u32) -> Role;
    fn get_vote_tally(self: @TState, seat: u32) -> u32;
    fn get_winner(self: @TState) -> Winner;
}

#[starknet::contract]
pub mod Nightfall {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use super::{
        Phase, Role, Winner, deal_roles, determine_winner, MAX_PLAYERS, MIN_PLAYERS,
    };

    mod errors {
        pub const WRONG_PHASE: felt252 = 'WRONG_PHASE';
        pub const GAME_FULL: felt252 = 'GAME_FULL';
        pub const ALREADY_JOINED: felt252 = 'ALREADY_JOINED';
        pub const NOT_ENOUGH_PLAYERS: felt252 = 'NOT_ENOUGH_PLAYERS';
        pub const BAD_SEAT: felt252 = 'BAD_SEAT';
        pub const NOT_YOUR_SEAT: felt252 = 'NOT_YOUR_SEAT';
        pub const BAD_TARGET: felt252 = 'BAD_TARGET';
        pub const ALREADY_ACTED: felt252 = 'ALREADY_ACTED';
        pub const ALREADY_VOTED: felt252 = 'ALREADY_VOTED';
        pub const NOT_ENOUGH_VOTES: felt252 = 'NOT_ENOUGH_VOTES';
    }

    #[storage]
    struct Storage {
        phase: Phase,
        seed: felt252,
        seat_count: u32,
        seats: Map<u32, ContractAddress>,
        seat_of: Map<ContractAddress, u32>,
        joined: Map<ContractAddress, bool>,
        roles: Map<u32, Role>,
        night_actions: Map<u32, u32>,
        night_acted: Map<u32, bool>,
        voted: Map<u32, bool>,
        votes: Map<u32, u32>,
        vote_tally: Map<u32, u32>,
        vote_count: u32,
        winner: Winner,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        PlayerJoined: PlayerJoined,
        PhaseChanged: PhaseChanged,
        RolesDealt: RolesDealt,
        NightAction: NightAction,
        VoteCast: VoteCast,
        RoleRevealed: RoleRevealed,
        GameSettled: GameSettled,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PlayerJoined {
        #[key]
        pub seat: u32,
        #[key]
        pub player: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PhaseChanged {
        #[key]
        pub from: Phase,
        pub to: Phase,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RolesDealt {
        #[key]
        pub seed: felt252,
        pub seat_count: u32,
    }

    #[derive(Drop, starknet::Event)]
    pub struct NightAction {
        #[key]
        pub seat: u32,
        pub target: u32,
    }

    #[derive(Drop, starknet::Event)]
    pub struct VoteCast {
        #[key]
        pub seat: u32,
        pub target: u32,
    }

    #[derive(Drop, starknet::Event)]
    pub struct RoleRevealed {
        #[key]
        pub seat: u32,
        pub role: Role,
    }

    #[derive(Drop, starknet::Event)]
    pub struct GameSettled {
        #[key]
        pub winner: Winner,
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_phase(self: @ContractState, expected: Phase) {
            assert(self.phase.read() == expected, errors::WRONG_PHASE);
        }

        fn assert_valid_seat(self: @ContractState, seat: u32) {
            assert(seat < self.seat_count.read(), errors::BAD_SEAT);
        }

        fn assert_valid_target(self: @ContractState, target: u32) {
            assert(target < self.seat_count.read(), errors::BAD_TARGET);
        }

        fn assert_seat_owner(self: @ContractState, seat: u32) {
            assert(self.seats.read(seat) == get_caller_address(), errors::NOT_YOUR_SEAT);
        }

        fn transition(ref self: ContractState, from: Phase, to: Phase) {
            self.assert_phase(from);
            self.phase.write(to);
            self.emit(PhaseChanged { from, to });
        }
    }

    #[abi(embed_v0)]
    pub impl NightfallImpl of super::INightfall<ContractState> {
        fn join_game(ref self: ContractState) {
            self.assert_phase(Phase::Lobby);
            let caller = get_caller_address();
            assert(!self.joined.read(caller), errors::ALREADY_JOINED);
            assert(self.seat_count.read() < MAX_PLAYERS, errors::GAME_FULL);

            let seat = self.seat_count.read();
            self.seats.write(seat, caller);
            self.seat_of.write(caller, seat);
            self.joined.write(caller, true);
            self.seat_count.write(seat + 1);
            self.emit(PlayerJoined { seat, player: caller });
        }

        fn start_game(ref self: ContractState, seed: felt252) {
            self.assert_phase(Phase::Lobby);
            let n = self.seat_count.read();
            assert(n >= MIN_PLAYERS, errors::NOT_ENOUGH_PLAYERS);

            // Deal: assign roles deterministically from the committed seed.
            self.phase.write(Phase::Deal);
            self.emit(PhaseChanged { from: Phase::Lobby, to: Phase::Deal });

            self.seed.write(seed);
            let roles = deal_roles(seed, n);
            let mut i: u32 = 0;
            while i < n {
                self.roles.write(i, *roles[i]);
                i += 1;
            }
            self.emit(RolesDealt { seed, seat_count: n });

            // Move straight into the night window.
            self.phase.write(Phase::Night);
            self.emit(PhaseChanged { from: Phase::Deal, to: Phase::Night });
        }

        fn night_action(ref self: ContractState, seat: u32, target: u32) {
            self.assert_phase(Phase::Night);
            self.assert_valid_seat(seat);
            self.assert_seat_owner(seat);
            self.assert_valid_target(target);
            assert(!self.night_acted.read(seat), errors::ALREADY_ACTED);

            self.night_acted.write(seat, true);
            self.night_actions.write(seat, target);
            self.emit(NightAction { seat, target });
        }

        fn end_night(ref self: ContractState) {
            self.transition(Phase::Night, Phase::Day);
        }

        fn begin_vote(ref self: ContractState) {
            self.transition(Phase::Day, Phase::Vote);
        }

        fn cast_vote(ref self: ContractState, seat: u32, target: u32) {
            self.assert_phase(Phase::Vote);
            self.assert_valid_seat(seat);
            self.assert_seat_owner(seat);
            self.assert_valid_target(target);
            assert(!self.voted.read(seat), errors::ALREADY_VOTED);

            self.voted.write(seat, true);
            self.votes.write(seat, target);
            self.vote_tally.write(target, self.vote_tally.read(target) + 1);
            self.vote_count.write(self.vote_count.read() + 1);
            self.emit(VoteCast { seat, target });
        }

        fn end_vote(ref self: ContractState) {
            self.assert_phase(Phase::Vote);
            assert(self.vote_count.read() == self.seat_count.read(), errors::NOT_ENOUGH_VOTES);
            self.transition(Phase::Vote, Phase::Reveal);
        }

        fn reveal_role(ref self: ContractState, seat: u32) {
            self.assert_phase(Phase::Reveal);
            self.assert_valid_seat(seat);
            self.assert_seat_owner(seat);
            self.emit(RoleRevealed { seat, role: self.roles.read(seat) });
        }

        fn settle(ref self: ContractState) {
            self.assert_phase(Phase::Reveal);
            let n = self.seat_count.read();

            let mut roles_arr: Array<Role> = array![];
            let mut votes_arr: Array<u32> = array![];
            let mut i: u32 = 0;
            while i < n {
                roles_arr.append(self.roles.read(i));
                votes_arr.append(self.votes.read(i));
                i += 1;
            }

            let winner = determine_winner(roles_arr.span(), votes_arr.span());
            self.winner.write(winner);
            self.phase.write(Phase::Settle);
            self.emit(PhaseChanged { from: Phase::Reveal, to: Phase::Settle });
            self.emit(GameSettled { winner });
        }

        fn get_phase(self: @ContractState) -> Phase {
            self.phase.read()
        }

        fn get_seed(self: @ContractState) -> felt252 {
            self.seed.read()
        }

        fn get_seat_count(self: @ContractState) -> u32 {
            self.seat_count.read()
        }

        fn get_seat(self: @ContractState, seat: u32) -> ContractAddress {
            self.seats.read(seat)
        }

        fn get_role(self: @ContractState, seat: u32) -> Role {
            self.roles.read(seat)
        }

        fn get_vote_tally(self: @ContractState, seat: u32) -> u32 {
            self.vote_tally.read(seat)
        }

        fn get_winner(self: @ContractState) -> Winner {
            self.winner.read()
        }
    }
}
