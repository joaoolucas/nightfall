import type { Rarity, Species, Stage } from "@/utils/portage";
import type { Direction8, GridPoint } from "./grid";

/**
 * The simulation's domain model.
 *
 * Everything here is plain serialisable data: the whole world is a value that
 * a reducer advances. That is what lets the same rules drive live play, the
 * offline catch-up, and — later — an authoritative server whose state can be
 * checkpointed on chain.
 */

export const TICK_MS = 100;

export type EntityKind = "player" | "companion" | "monster" | "npc";
export type EntityState = "idle" | "walking" | "attacking" | "hurt" | "dead";

export interface CombatStats {
  attack: number;
  defense: number;
  speed: number;
}

export interface Entity extends GridPoint {
  id: string;
  kind: EntityKind;
  /** Sprite folder under world/characters. */
  charId: string;
  name: string;
  species: Species;
  stage: Stage;
  direction: Direction8;

  hp: number;
  maxHp: number;
  stats: CombatStats;
  level: number;

  state: EntityState;
  /** Ticks remaining in a non-interruptible state (attack wind-up, hurt, death). */
  stateTicks: number;

  /** Ticks until the next step is allowed; derived from speed. */
  moveCooldown: number;
  /** Ticks until the next swing is allowed. */
  attackCooldown: number;

  path: GridPoint[];
  targetId: string | null;
  /**
   * Where the Porter has decided to walk, held until they arrive or it stops
   * being worth walking to.
   *
   * Without it, auto-hunt re-argued the case from scratch every tick and the
   * character read as aimless: it would set off for a body, notice a nearer
   * one, turn, notice the first again, and drift between them. A destination
   * you can see them commit to is what makes the walking legible.
   */
  goal?: GridPoint;
  /** Where a monster returns to, and what respawns it. */
  spawnId?: string;
  /** Monster template this entity was built from; drives loot and exp. */
  templateId?: string;
  /** Tiles from home a monster will chase before giving up. */
  leash?: number;

  /** Set when an NFT backs this creature. Unused until the chain layer lands. */
  tokenId?: string;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type ItemKind = "gold" | "potion" | "weapon" | "armor" | "trophy" | "material";

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  /** Oz per unit; the Porter's capacity is finite, as in a real tile RPG. */
  weight: number;
  stackable: boolean;
  /** Gold value when sold. */
  value: number;
  /** Fraction of max hp restored. */
  heal?: number;
  sprite: string;
}

export interface ItemStack {
  /** Stable per-stack identity, so a tradeable item can later be an on-chain asset. */
  instanceId: string;
  defId: string;
  count: number;
}

/** Items lying on a tile. A corpse is a pile that names what died on it. */
export interface GroundPile extends GridPoint {
  id: string;
  items: ItemStack[];
  corpseOf?: string;
  corpseSpecies?: Species;
  corpseStage?: Stage;
  /** Tick at which the pile disappears. */
  decayTick: number;
}

// ---------------------------------------------------------------------------
// Spawns
// ---------------------------------------------------------------------------

export interface SpawnPoint extends GridPoint {
  id: string;
  /** Monster template ids this point can produce. */
  monsterIds: readonly string[];
  radius: number;
  maxAlive: number;
  respawnTicks: number;
  /** Tick at which the next monster may appear. */
  nextSpawnTick: number;
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

export type SkillId = "melee" | "shielding" | "vitality";

export interface PlayerProgress {
  level: number;
  exp: number;
  /** Skill levels, advanced by use rather than bought with gold. */
  skills: Record<SkillId, number>;
  /** Progress toward the next level of each skill. */
  skillTries: Record<SkillId, number>;
}

export interface Companion {
  id: string;
  name: string;
  species: Species;
  rarity: Rarity;
  stage: Stage;
  level: number;
  exp: number;
  tokenId?: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type CombatEventType =
  | "hit" | "miss" | "block" | "heal" | "death"
  | "loot" | "refused" | "levelUp" | "skillUp" | "spawn" | "say";

export interface CombatEvent {
  type: CombatEventType;
  tick: number;
  /** Who caused it. */
  sourceId?: string;
  /** Who received it. */
  targetId?: string;
  amount?: number;
  text?: string;
  at?: GridPoint;
}

export type LogTone = "combat" | "loot" | "level" | "system" | "damage";

export interface LogEntry {
  id: number;
  tone: LogTone;
  text: string;
}

// ---------------------------------------------------------------------------
// World state
// ---------------------------------------------------------------------------

export interface Inventory {
  /** Carried stacks. Order is the backpack order the client renders. */
  stacks: ItemStack[];
  gold: number;
  shards: number;
}

/**
 * Hunting and looting are what the game *is*, so neither is a switch any more —
 * a Porter who does not hunt is watching an empty screen. What remains is the
 * one choice that is genuinely a choice: which potion the Porter reaches for.
 */
export interface GameSettings {
  /** Item the Porter drinks when hurt, or null to drink nothing. */
  potionId: string | null;
}

export interface GameState {
  version: number;
  tick: number;
  zoneId: Species;
  seed: number;
  /** Increments per monster killed; seeds the reproducible loot draw. */
  killSerial: number;

  entities: Entity[];
  ground: GroundPile[];
  spawns: SpawnPoint[];

  progress: PlayerProgress;
  companions: Companion[];
  activeCompanionIds: string[];
  inventory: Inventory;
  settings: GameSettings;

  kills: number;
  deaths: number;
  playSeconds: number;

  log: LogEntry[];
  nextLogId: number;
  nextInstance: number;
  /** Monotonic entity id counter. Never derive an id from list length or tick. */
  nextEntitySerial: number;

  /** Wall-clock anchor for offline catch-up. */
  lastUpdatedAt: number;

  /**
   * Reserved for the Starknet layer: the last checkpointed tick and any
   * actions awaiting settlement. Nothing writes here yet, but keeping the slot
   * means the save format does not have to break when it does.
   */
  chain: {
    checkpointedTick: number;
    pendingActions: Array<{ kind: string; payload: unknown }>;
  };
}

export interface TickResult {
  state: GameState;
  events: CombatEvent[];
}
