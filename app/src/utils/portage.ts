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
