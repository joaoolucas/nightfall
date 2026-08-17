import type { Species, Stage } from "./portage";

/**
 * World view sprite utilities for directional 8-way idle + 4-frame cardinal walk cycles.
 * Assets live under /game-assets/world/characters/<species>-<stage>/
 * Expected files:
 *   idle-{direction}.png       (8 directions: north, south, east, west, north-east, north-west, south-east, south-west)
 *   walk-{direction}-{0..3}.png (4 frames per cardinal: north, south, east, west)
 */

export type WorldDirection = "north" | "south" | "east" | "west" | "north-east" | "north-west" | "south-east" | "south-west";
export type CardinalDirection = "north" | "south" | "east" | "west";

const IDLE_DIRS: readonly WorldDirection[] = [
  "south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"
];

const WALK_DIRS: readonly CardinalDirection[] = ["south", "east", "north", "west"];

/** Species folder stem (matches SPECIES_SPRITE_ID from portage.ts). */
export function worldSpriteStem(species: Species): string {
  const map: Record<Species, string> = {
    ember: "cinderling", creek: "ripple", grove: "bramble",
    stone: "shard", mist: "wisp", sky: "aurora",
  };
  return map[species];
}

/** Build the base path for a character's folder. */
export function worldCharacterBasePath(species: Species, stage: Stage): string {
  return `/game-assets/world/characters/${worldSpriteStem(species)}-${stage}`;
}

/** Get the idle sprite path for a given direction (8-way). */
export function worldIdleSpritePath(species: Species, stage: Stage, direction: WorldDirection): string {
  const base = worldCharacterBasePath(species, stage);
  const idx = IDLE_DIRS.indexOf(direction);
  const safeDir = idx >= 0 ? IDLE_DIRS[idx] : "south";
  return `${base}/idle-${safeDir}.png`;
}

/** Get a walk cycle frame path (4 frames per cardinal direction). */
export function worldWalkSpritePath(species: Species, stage: Stage, direction: CardinalDirection, frame: number): string {
  const base = worldCharacterBasePath(species, stage);
  const idx = WALK_DIRS.indexOf(direction);
  const safeDir = idx >= 0 ? WALK_DIRS[idx] : "south";
  const safeFrame = ((frame % 4) + 4) % 4;
  return `${base}/walk-${safeDir}-${safeFrame}.png`;
}

/** Resolve the best direction string from a grid delta (dx, dy). */
export function directionFromDelta(dx: number, dy: number): WorldDirection {
  if (dx === 0 && dy === -1) return "north";
  if (dx === 1 && dy === -1) return "north-east";
  if (dx === 1 && dy === 0) return "east";
  if (dx === 1 && dy === 1) return "south-east";
  if (dx === 0 && dy === 1) return "south";
  if (dx === -1 && dy === 1) return "south-west";
  if (dx === -1 && dy === 0) return "west";
  if (dx === -1 && dy === -1) return "north-west";
  return "south";
}

/** Resolve a cardinal direction from a grid delta (for walk cycles). */
export function cardinalFromDelta(dx: number, dy: number): CardinalDirection {
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
}

/** Preload all sprites for a character (idle + walk). Returns a map of path -> HTMLImageElement. */
export async function preloadWorldCharacterSprites(
  species: Species,
  stage: Stage,
  onProgress?: (loaded: number, total: number) => void
): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>();
  const base = worldCharacterBasePath(species, stage);
  const paths: string[] = [];

  // 8 idle directions
  for (const dir of IDLE_DIRS) paths.push(`${base}/idle-${dir}.png`);
  // 4 cardinal directions × 4 frames
  for (const dir of WALK_DIRS) for (let f = 0; f < 4; f++) paths.push(`${base}/walk-${dir}-${f}.png`);

  let loaded = 0;
  await Promise.all(paths.map(async (path) => {
    const img = new Image();
    img.src = path;
    await new Promise<void>((resolve) => {
      img.onload = () => { images.set(path, img); loaded++; onProgress?.(loaded, paths.length); resolve(); };
      img.onerror = () => { loaded++; onProgress?.(loaded, paths.length); resolve(); };
    });
  }));
  return images;
}

/** Preload all enemy/boss sprites for a zone. */
export async function preloadZoneEnemySprites(
  zoneId: Species,
  onProgress?: (loaded: number, total: number) => void
): Promise<Map<string, HTMLImageElement>> {
  const images = new Map<string, HTMLImageElement>();
  // adult + legend for enemy display
  for (const stage of ["adult", "legend"] as Stage[]) {
    const base = worldCharacterBasePath(zoneId, stage);
    const paths: string[] = [];
    for (const dir of IDLE_DIRS) paths.push(`${base}/idle-${dir}.png`);
    for (const dir of WALK_DIRS) for (let f = 0; f < 4; f++) paths.push(`${base}/walk-${dir}-${f}.png`);

    let loaded = 0;
    await Promise.all(paths.map(async (path) => {
      const img = new Image();
      img.src = path;
      await new Promise<void>((resolve) => {
        img.onload = () => { images.set(path, img); loaded++; onProgress?.(loaded, paths.length); resolve(); };
        img.onerror = () => { loaded++; onProgress?.(loaded, paths.length); resolve(); };
      });
    }));
  }
  return images;
}