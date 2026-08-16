// Domain model for Portage.fun creatures.
//
// Mirrors docs/SPEC.md §4 (6 biomes, 6 rarities, 3 stages) and the fixed
// on-chain rarity table (§5 / §10). The Cairo ABI does not exist yet, so these
// are typed values the UI renders until the contracts are wired up.

/** The 6 biomes a creature can hail from (SPEC §4). */
export type Species = "ember" | "creek" | "grove" | "stone" | "mist" | "sky";

/** The 6 creature rarities, ordered least → most scarce. */
export type Rarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";

/** The 3 evolution stages of a creature (Hatchling → Adult → Legend). */
export type Stage = "hatchling" | "adult" | "legend";

export interface SpeciesInfo {
  /** English display label, e.g. "Ember". */
  label: string;
  /** The biome's element (Fire, Water, …). */
  element: string;
  /** The biome's theme / silhouette language. */
  theme: string;
  /** The flagship example creature for the biome. */
  example: string;
}

export const SPECIES: Record<Species, SpeciesInfo> = {
  ember: { label: "Ember", element: "Fire", theme: "embers, cinders", example: "Cinderling" },
  creek: { label: "Creek", element: "Water", theme: "rain, current", example: "Ripple" },
  grove: { label: "Grove", element: "Nature", theme: "leaves, roots", example: "Bramble" },
  stone: { label: "Stone", element: "Earth", theme: "rock, crystal", example: "Shard" },
  mist: { label: "Mist", element: "Shadow", theme: "fog, whisper", example: "Wisp" },
  sky: { label: "Sky", element: "Light", theme: "aurora, wind", example: "Aurora" },
};

export interface RarityInfo {
  /** English display label, e.g. "Epic". */
  label: string;
  /** Card border color for the rarity (cozy portal palette). */
  borderColor: string;
  /** Accent text / badge color. */
  color: string;
  /** Subtle glow color used for card shadows. */
  glow: string;
}

export const RARITY: Record<Rarity, RarityInfo> = {
  common:    { label: "Common",    borderColor: "#8a8f9c", color: "#b6bbc7", glow: "rgba(138, 143, 156, 0.45)" },
  uncommon:  { label: "Uncommon",  borderColor: "#3e9d5a", color: "#6fd58f", glow: "rgba(62, 157, 90, 0.5)" },
  rare:      { label: "Rare",      borderColor: "#4f8cff", color: "#86b4ff", glow: "rgba(79, 140, 255, 0.5)" },
  epic:      { label: "Epic",      borderColor: "#a855f7", color: "#cd93ff", glow: "rgba(168, 85, 247, 0.5)" },
  legendary: { label: "Legendary", borderColor: "#f0a93a", color: "#ffc46b", glow: "rgba(240, 169, 58, 0.5)" },
  mythic:    { label: "Mythic",    borderColor: "#ff5c7a", color: "#ff8fa3", glow: "rgba(255, 92, 122, 0.55)" },
};

/**
 * Fixed on-chain rarity table (percentage weights), mirrored from the Cairo
 * hatch contract. Common 40 / Uncommon 25 / Rare 15 / Epic 10 / Legendary 7 /
 * Mythic 3 — neither the team nor anyone else can print extra legendaries.
 */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 40,
  uncommon: 25,
  rare: 15,
  epic: 10,
  legendary: 7,
  mythic: 3,
};

export interface StageInfo {
  /** English display label, e.g. "Hatchling". */
  label: string;
}

export const STAGE: Record<Stage, StageInfo> = {
  hatchling: { label: "Hatchling" },
  adult: { label: "Adult" },
  legend: { label: "Legend" },
};

/** Ordered lists for iteration (drop tables, filters, keying, …). */
export const SPECIES_LIST: readonly Species[] = ["ember", "creek", "grove", "stone", "mist", "sky"];
export const RARITY_LIST: readonly Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
export const STAGE_LIST: readonly Stage[] = ["hatchling", "adult", "legend"];

/** English label lookups, used across the UI. */
export const speciesLabel = (s: Species): string => SPECIES[s].label;
export const rarityLabel = (r: Rarity): string => RARITY[r].label;
export const stageLabel = (s: Stage): string => STAGE[s].label;

// ---------------------------------------------------------------------------
// Creature stats, exp & evolution (SPEC §5)
// ---------------------------------------------------------------------------

/** Base stats per species (health, attack, defense, speed) — SPEC §5 table. */
export const BASE_STATS: Record<
  Species,
  { health: number; attack: number; defense: number; speed: number }
> = {
  ember: { health: 60, attack: 90, defense: 50, speed: 70 },
  creek: { health: 90, attack: 60, defense: 60, speed: 60 },
  grove: { health: 100, attack: 50, defense: 80, speed: 50 },
  stone: { health: 80, attack: 60, defense: 100, speed: 40 },
  mist: { health: 50, attack: 80, defense: 40, speed: 100 },
  sky: { health: 60, attack: 70, defense: 50, speed: 90 },
};

/** Rarity multiplier — SPEC §5. */
export const RARITY_MULT: Record<Rarity, number> = {
  common: 1.0,
  uncommon: 1.3,
  rare: 1.6,
  epic: 2.0,
  legendary: 2.5,
  mythic: 3.5,
};

/** Stage multiplier — SPEC §5. */
export const STAGE_MULT: Record<Stage, number> = {
  hatchling: 0.5,
  adult: 1.0,
  legend: 2.0,
};

/**
 * Exp needed to evolve to the next stage. `null` = no further evolution.
 * Hatchling → Adult at 100 exp, Adult → Legend at 500 exp (SPEC §5).
 */
export const EXP_THRESHOLDS: Record<Stage, number | null> = {
  hatchling: 100,
  adult: 500,
  legend: null,
};

/** Rarity index, least → most scarce (0 = Common … 5 = Mythic). */
export const RARITY_INDEX: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

/** Final derived creature stats. */
export interface CreatureStats {
  health: number;
  attack: number;
  defense: number;
  speed: number;
}

/**
 * Final stats for a creature: `base_species × rarity_mult × stage_mult`,
 * rounded to the nearest integer (SPEC §5).
 */
export function creatureStats(species: Species, rarity: Rarity, stage: Stage): CreatureStats {
  const base = BASE_STATS[species];
  const mult = RARITY_MULT[rarity] * STAGE_MULT[stage];
  return {
    health: Math.round(base.health * mult),
    attack: Math.round(base.attack * mult),
    defense: Math.round(base.defense * mult),
    speed: Math.round(base.speed * mult),
  };
}

/** Exp a creature earns per expedition tick, scaled by rarity (SPEC §5). */
export function expYield(rarity: Rarity): number {
  return 1 + RARITY_INDEX[rarity];
}
