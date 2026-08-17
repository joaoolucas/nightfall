import type { Species, Stage } from "./portage";
import type { GroundKind, PropKind } from "./world-engine";
import { worldSpriteStem, type CardinalDirection, type WorldDirection } from "./world-sprites";

/**
 * Every world sprite the renderer can draw, plus a shared image cache.
 *
 * The PixelLab pipeline (scripts/gen-world-assets.mjs) already writes all of
 * these; before this module the renderer only consumed `tilesets/` and drew
 * props, structures and the player with canvas primitives instead.
 */

const ROOT = "/game-assets/world";

/** A character is any folder under world/characters — Porters, NPCs and creatures alike. */
export type CharacterId = string;
export type StructureKind = "lodge" | "tent";

/** The player is a human Porter, not a creature of the current biome. */
export const PLAYER_CHARACTER: CharacterId = "wayfarer";

/** Authored outpost NPCs, keyed by the ids used in world-engine's npc list. */
export const NPC_CHARACTER: Record<string, CharacterId> = {
  healer: "healer-mira",
  quartermaster: "quartermaster-orin",
  pathfinder: "pathfinder-tavi",
  warden: "scout-sable",
};

/** Ambient Porters milling around the outpost. Idle-only (no walk cycle generated). */
export const AMBIENT_CHARACTERS: readonly CharacterId[] = ["wayfarer-blue", "wayfarer-green", "wayfarer-red"];

/** Characters that have a 4-direction × 4-frame walk cycle on disk. */
const WALKING_CHARACTERS = new Set<CharacterId>([PLAYER_CHARACTER]);

/** Native pixel sizes as generated. The renderer scales by whole numbers only. */
export const NATIVE = {
  tile: 32,
  character: 48,
  prop: 64,
  effect: 64,
  lodge: { width: 224, height: 128 },
  tent: { width: 96, height: 96 },
} as const;

const IDLE_DIRECTIONS: readonly WorldDirection[] = [
  "south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west",
];
const WALK_DIRECTIONS: readonly CardinalDirection[] = ["south", "east", "north", "west"];
const PROP_KINDS: readonly PropKind[] = ["tree", "rock", "crystal", "shrub", "lantern", "ruin"];

/**
 * Ground kinds drawn as a texture over the Wang base.
 *
 * Only `plaza` qualifies today: the generated `tiles/<zone>/water.png` and
 * `hazard.png` are single compositions rather than seamless patterns, so they
 * tile visibly. Water and hazard use a tinted fill until phase 1 regenerates
 * them as proper Wang overlay sets.
 */
export const OVERLAY_GROUND: readonly GroundKind[] = ["plaza"];

/** Flat colours for the ground kinds that have no seamless texture yet. */
export const LIQUID_TINT: Record<Species, { water: string; waterLight: string; hazard: string; hazardCrack: string }> = {
  ember: { water: "#5d1d16", waterLight: "#a8391f", hazard: "#2a1414", hazardCrack: "#e8622c" },
  creek: { water: "#1f5f80", waterLight: "#3d93b5", hazard: "#16324a", hazardCrack: "#5fb6d8" },
  grove: { water: "#1b4a44", waterLight: "#2f7d68", hazard: "#241a14", hazardCrack: "#7fae4a" },
  stone: { water: "#1c3350", waterLight: "#33608c", hazard: "#100f1a", hazardCrack: "#9a7ad4" },
  mist: { water: "#1a2440", waterLight: "#2f4272", hazard: "#120f22", hazardCrack: "#8d78d6" },
  sky: { water: "#215577", waterLight: "#4b96be", hazard: "#0e1330", hazardCrack: "#e2c463" },
};

export function characterIdlePath(id: CharacterId, direction: WorldDirection): string {
  return `${ROOT}/characters/${id}/idle-${direction}.png`;
}

export function characterWalkPath(id: CharacterId, direction: CardinalDirection, frame: number): string {
  return `${ROOT}/characters/${id}/walk-${direction}-${((frame % 4) + 4) % 4}.png`;
}

/** Wild creatures and party companions live in `<stem>-<stage>` folders. */
export function creatureCharacterId(species: Species, stage: Stage): CharacterId {
  return `${worldSpriteStem(species)}-${stage}`;
}

export function hasWalkCycle(id: CharacterId): boolean {
  // Creature folders are `<stem>-<stage>` and always ship a walk cycle.
  return WALKING_CHARACTERS.has(id) || /-(hatchling|adult|legend)$/.test(id);
}

export function propPath(zone: Species, kind: PropKind): string {
  return `${ROOT}/props/${zone}/${kind}.png`;
}

export function structurePath(zone: Species, kind: StructureKind): string {
  return `${ROOT}/structures/${zone}/${kind}.png`;
}

export function groundTexturePath(zone: Species, kind: GroundKind): string {
  return `${ROOT}/tiles/${zone}/${kind}.png`;
}

export function impactPath(zone: Species): string {
  return `${ROOT}/effects/${zone}-impact.png`;
}

// ---------------------------------------------------------------------------
// Shared image cache
// ---------------------------------------------------------------------------

const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement | null>>();

/** Synchronous lookup for the render loop. Returns undefined until decoded. */
export function getImage(source: string): HTMLImageElement | undefined {
  return cache.get(source);
}

/** Idempotent load. Missing files resolve to null rather than rejecting. */
export function loadImage(source: string): Promise<HTMLImageElement | null> {
  const ready = cache.get(source);
  if (ready) return Promise.resolve(ready);
  const inFlight = pending.get(source);
  if (inFlight) return inFlight;
  const task = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => { cache.set(source, image); pending.delete(source); resolve(image); };
    image.onerror = () => { pending.delete(source); resolve(null); };
    image.src = source;
  });
  pending.set(source, task);
  return task;
}

export async function loadAll(sources: Iterable<string>): Promise<void> {
  await Promise.all([...sources].map(loadImage));
}

/** Every frame a character can be drawn in. */
export function characterSources(id: CharacterId): string[] {
  const sources = IDLE_DIRECTIONS.map((direction) => characterIdlePath(id, direction));
  if (hasWalkCycle(id)) {
    for (const direction of WALK_DIRECTIONS) {
      for (let frame = 0; frame < 4; frame += 1) sources.push(characterWalkPath(id, direction, frame));
    }
  }
  return sources;
}

/** Props, structures, ground overlays and the impact effect for one biome. */
export function zoneEnvironmentSources(zone: Species): string[] {
  return [
    ...PROP_KINDS.map((kind) => propPath(zone, kind)),
    structurePath(zone, "lodge"),
    structurePath(zone, "tent"),
    ...OVERLAY_GROUND.map((kind) => groundTexturePath(zone, kind)),
    impactPath(zone),
  ];
}
