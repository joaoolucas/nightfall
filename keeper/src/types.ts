/**
 * Shared domain types for the Nightfall keeper.
 *
 * These mirror the on-chain state machine (docs/SPEC.md §5) but are kept
 * deliberately minimal: the keeper is off-chain and only ever knows the
 * public game state plus its own seat's decrypted role note.
 */

/** Turn-based phases of One Night Werewolf. */
export type Phase =
  | 'lobby'
  | 'deal'
  | 'night'
  | 'day'
  | 'vote'
  | 'reveal'
  | 'settle';

/** MVP roles (docs/SPEC.md §5). */
export type Role =
  | 'werewolf'
  | 'minion'
  | 'seer'
  | 'robber'
  | 'troublemaker'
  | 'villager';

/** The three decisions a keeper seat can emit. */
export type Action = 'vote' | 'night_action' | 'pass';

/** Seat budget → model mapping (keeper/README.md). */
export type Budget = 'default' | 'strong';

/** Structured decision returned by the LLM (or the deterministic fallback). */
export interface Decision {
  action: Action;
  /** Seat number acted upon, or `null` when there is no target / pass. */
  target: number | null;
  reasoning: string;
}

/** Public, non-secret info about a player (safe to expose in prompts). */
export interface PublicPlayer {
  seat: number;
  alive: boolean;
}

/** A seat. `role` is present only for the seat the keeper controls. */
export interface Seat extends PublicPlayer {
  role?: Role;
}

/** Game state as observed by the keeper (public state + own seat's role). */
export interface GameState {
  gameId: string;
  phase: Phase;
  seats: Seat[];
  /** Public action history (turns already taken), most recent last. */
  actionHistory: string[];
}

/** Roles that have a night action (SPEC §5). */
export const NIGHT_ACTION_ROLES: readonly Role[] = [
  'werewolf',
  'minion',
  'seer',
  'robber',
  'troublemaker',
];
