// ─── Nightfall: One Night — game domain model ────────────────────────────────
// Mirrors the Cairo Fair Game Engine (contracts/src/lib.cairo in the sibling
// worker) so the UI and the on-chain state machine stay in lock-step.
//
// Keep the numeric discriminants aligned with the felt252 values the Cairo
// contract uses for its phase / role enums. v0 uses the trusted-dealer path;
// roles are assigned per seat as encrypted notes.

/** Turn-based game phases, in the fixed state-machine order from docs/SPEC.md §5. */
export enum GamePhase {
  Lobby = 0,
  Deal = 1,
  Night = 2,
  Day = 3,
  Vote = 4,
  Reveal = 5,
  Settle = 6,
}

/** The 6 MVP roles (docs/SPEC.md §5). Stretch roles (Drunk, Insomniac, …) come later. */
export enum Role {
  Werewolf = 0,
  Minion = 1,
  Seer = 2,
  Robber = 3,
  Troublemaker = 4,
  Villager = 5,
}

/** Which side a role plays for at settlement. */
export enum Team {
  Wolves = "wolves",
  Village = "village",
}

/** Ordered phase list used by the phase banner. */
export const PHASES: readonly GamePhase[] = [
  GamePhase.Lobby,
  GamePhase.Deal,
  GamePhase.Night,
  GamePhase.Day,
  GamePhase.Vote,
  GamePhase.Reveal,
  GamePhase.Settle,
];

/** Ordered MVP role list used by the role-card grid. */
export const MVP_ROLES: readonly Role[] = [
  Role.Werewolf,
  Role.Minion,
  Role.Seer,
  Role.Robber,
  Role.Troublemaker,
  Role.Villager,
];

/** Human-readable phase labels (phase banner + status chips). */
export const PHASE_LABELS: Record<GamePhase, string> = {
  [GamePhase.Lobby]: "Lobby",
  [GamePhase.Deal]: "Deal",
  [GamePhase.Night]: "Night",
  [GamePhase.Day]: "Day",
  [GamePhase.Vote]: "Vote",
  [GamePhase.Reveal]: "Reveal",
  [GamePhase.Settle]: "Settle",
};

/** Human-readable role labels. */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.Werewolf]: "Werewolf",
  [Role.Minion]: "Minion",
  [Role.Seer]: "Seer",
  [Role.Robber]: "Robber",
  [Role.Troublemaker]: "Troublemaker",
  [Role.Villager]: "Villager",
};

/** Team membership per role. */
export const ROLE_TEAM: Record<Role, Team> = {
  [Role.Werewolf]: Team.Wolves,
  [Role.Minion]: Team.Wolves,
  [Role.Seer]: Team.Village,
  [Role.Robber]: Team.Village,
  [Role.Troublemaker]: Team.Village,
  [Role.Villager]: Team.Village,
};

/** Fixed night-action order and description per role (docs/SPEC.md §5). */
export const ROLE_NIGHT_ACTION: Record<Role, string> = {
  [Role.Werewolf]: "Sees other wolves",
  [Role.Minion]: "Sees wolves (wolves don't see them)",
  [Role.Seer]: "Checks one player's role",
  [Role.Robber]: "Swaps own role with another player",
  [Role.Troublemaker]: "Swaps two other players' roles",
  [Role.Villager]: "No action",
};

/** Public asset path for a role's card artwork (served from app/public). */
export function roleCardImage(role: Role): string {
  const key = Role[role].toLowerCase();
  return `/game-assets/cards/${key}.png`;
}

/** Public asset path for the village-night table backdrop. */
export const TABLE_BACKDROP = "/game-assets/backgrounds/village-night.png";

/** Display name for a game mode. */
export type GameMode = "free" | "staked";
export const GAME_MODE_LABELS: Record<GameMode, string> = {
  free: "Free",
  staked: "Staked",
};

/** Number of seats per table (One Night Werewolf, 6-player MVP). */
export const SEAT_COUNT = 6;
