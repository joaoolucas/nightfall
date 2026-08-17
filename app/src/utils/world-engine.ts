import type { Species } from "./portage";

export const WORLD_TILE_SIZE = 32;
export const WORLD_WIDTH = 52;
export const WORLD_HEIGHT = 38;

export type GroundKind = "ground" | "path" | "plaza" | "water" | "hazard";
export type PropKind = "tree" | "rock" | "crystal" | "shrub" | "lantern" | "ruin";

export interface GridPoint { x: number; y: number }
export interface WorldTile extends GridPoint { kind: GroundKind; walkable: boolean }
export interface WorldProp extends GridPoint { id: string; kind: PropKind; solid: boolean; variant: number }
export interface WorldSpawn extends GridPoint { id: string; radius: number }
export interface WorldNpc extends GridPoint { id: string; name: string; role: string; palette: number }
export interface WorldStructure extends GridPoint { id: string; width: number; height: number; kind: "lodge" | "tent" }

export interface WorldMap {
  zoneId: Species;
  width: number;
  height: number;
  tiles: WorldTile[];
  props: WorldProp[];
  spawns: WorldSpawn[];
  npcs: WorldNpc[];
  structures: WorldStructure[];
  start: GridPoint;
  hub: { x: number; y: number; width: number; height: number; name: string };
}

const ZONE_SEEDS: Record<Species, number> = {
  ember: 0x8e12a3,
  creek: 0x19b77d,
  grove: 0x4ca911,
  stone: 0x729dd4,
  mist: 0xa61c3f,
  sky: 0xd4b802,
};

const HUB_NAMES: Record<Species, string> = {
  ember: "Cinderpath Outpost",
  creek: "Moon Creek Ferry",
  grove: "Rootwild Lodge",
  stone: "Crystal Delve Camp",
  mist: "Whisper Fen Lantern",
  sky: "Aurora Reach Dock",
};

const PROP_BY_ZONE: Record<Species, readonly PropKind[]> = {
  ember: ["rock", "crystal", "ruin", "shrub"],
  creek: ["tree", "shrub", "rock", "lantern"],
  grove: ["tree", "tree", "shrub", "ruin"],
  stone: ["rock", "crystal", "rock", "ruin"],
  mist: ["tree", "shrub", "lantern", "ruin"],
  sky: ["crystal", "shrub", "lantern", "ruin"],
};

function hash2(x: number, y: number, seed: number): number {
  let value = Math.imul(x + 0x7ed55d16, 0x165667b1) ^ Math.imul(y + 0xd3a2646c, 0x27d4eb2d) ^ seed;
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  return ((value ^ (value >>> 13)) >>> 0) / 0x100000000;
}

function key(point: GridPoint): string { return `${point.x},${point.y}`; }
function distance(a: GridPoint, b: GridPoint): number { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function spawnPoints(): WorldSpawn[] {
  return [
    { id: "north", x: 26, y: 4, radius: 4 },
    { id: "north-east", x: 43, y: 8, radius: 4 },
    { id: "east", x: 47, y: 19, radius: 4 },
    { id: "south-east", x: 42, y: 31, radius: 4 },
    { id: "south", x: 26, y: 34, radius: 4 },
    { id: "south-west", x: 9, y: 31, radius: 4 },
    { id: "west", x: 4, y: 19, radius: 4 },
    { id: "north-west", x: 9, y: 7, radius: 4 },
  ];
}

/** Smooth value noise in [0, 1), bilinearly interpolated between lattice points. */
function valueNoise(x: number, y: number, seed: number, scale: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  // Smoothstep the interpolant so cell boundaries do not show as creases.
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}

/** Two octaves: broad landmasses with a ragged edge rather than a clean blob. */
function fieldNoise(x: number, y: number, seed: number): number {
  return valueNoise(x, y, seed, 11) * 0.68 + valueNoise(x, y, seed ^ 0x5bf03635, 4.5) * 0.32;
}

/**
 * Grove is deliberately dry: not every biome needs an impassable body, and one
 * clear forest makes the hazards elsewhere read as hazards rather than decor.
 */
const HAZARD_KIND: Partial<Record<Species, GroundKind>> = {
  ember: "hazard",
  stone: "hazard",
  sky: "hazard",
  creek: "water",
  mist: "water",
};

/** Share of the map a biome's impassable body may cover. */
const HAZARD_COVERAGE = 0.12;

/**
 * Where a biome's water or hazard lies.
 *
 * These used to be axis-aligned rectangles, which rendered as flat slabs that
 * looked like UI panels laid over the map. A noise field gives organic
 * coastlines instead — but thresholding that field at a fixed value produced
 * wildly different coverage per biome (0.5% in one, 47% in another), because
 * each zone seeds a different distribution. So the cut is taken at a
 * *percentile* of the field's own values, which pins coverage to
 * HAZARD_COVERAGE everywhere while keeping each biome's shapes distinct.
 */
function hazardTiles(zoneId: Species, seed: number): Set<string> {
  const kind = HAZARD_KIND[zoneId];
  const chosen = new Set<string>();
  if (!kind) return chosen;

  const cx = Math.floor(WORLD_WIDTH / 2);
  const cy = Math.floor(WORLD_HEIGHT / 2);
  const scored: Array<{ key: string; value: number }> = [];

  for (let y = 1; y < WORLD_HEIGHT - 1; y += 1) {
    for (let x = 1; x < WORLD_WIDTH - 1; x += 1) {
      // Nothing encroaches near the hub, so the outpost stays usable.
      const fromHub = Math.max(Math.abs(x - cx) / (WORLD_WIDTH / 2), Math.abs(y - cy) / (WORLD_HEIGHT / 2));
      if (fromHub < 0.4) continue;
      // Weight toward the rim so bodies gather at the edges of the map.
      const value = fieldNoise(x, y, seed ^ 0x27d4eb2d) + (fromHub - 0.4) * 0.35;
      scored.push({ key: `${x},${y}`, value });
    }
  }

  scored.sort((a, b) => b.value - a.value);
  const take = Math.floor(WORLD_WIDTH * WORLD_HEIGHT * HAZARD_COVERAGE);
  for (const entry of scored.slice(0, take)) chosen.add(entry.key);
  return chosen;
}

export function createWorldMap(zoneId: Species): WorldMap {
  const seed = ZONE_SEEDS[zoneId];
  const cx = Math.floor(WORLD_WIDTH / 2);
  const cy = Math.floor(WORLD_HEIGHT / 2);
  const hub = { x: cx - 6, y: cy - 4, width: 13, height: 9, name: HUB_NAMES[zoneId] };
  const spawns = spawnPoints();
  const tiles: WorldTile[] = [];

  // Roads from the outpost to every spawn. Carving them before terrain is
  // decided guarantees each hunting ground stays reachable no matter how the
  // noise field falls, and reads as tracks radiating out of the camp.
  const road = new Set<string>();
  for (const spawn of spawns) {
    const steps = Math.max(Math.abs(spawn.x - cx), Math.abs(spawn.y - cy));
    for (let step = 0; step <= steps; step += 1) {
      const t = steps === 0 ? 0 : step / steps;
      const rx = Math.round(cx + (spawn.x - cx) * t);
      const ry = Math.round(cy + (spawn.y - cy) * t);
      // Two tiles wide so a road never becomes a single-file choke point.
      road.add(`${rx},${ry}`);
      road.add(`${rx + 1},${ry}`);
      road.add(`${rx},${ry + 1}`);
    }
  }

  const hazard = hazardTiles(zoneId, seed);
  const hazardKind = HAZARD_KIND[zoneId];

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const edge = x === 0 || y === 0 || x === WORLD_WIDTH - 1 || y === WORLD_HEIGHT - 1;
      const inHub = x >= hub.x && x < hub.x + hub.width && y >= hub.y && y < hub.y + hub.height;
      const onRoad = road.has(`${x},${y}`);
      const nearSpawn = spawns.some((spawn) => distance(spawn, { x, y }) <= 2);
      let kind: GroundKind = "ground";
      if (inHub) kind = "plaza";
      else if (onRoad || nearSpawn) kind = "path";
      else if (hazardKind && hazard.has(`${x},${y}`)) kind = hazardKind;
      tiles.push({ x, y, kind, walkable: !edge && kind !== "water" && kind !== "hazard" });
    }
  }

  const props: WorldProp[] = [];
  for (let y = 2; y < WORLD_HEIGHT - 2; y += 1) {
    for (let x = 2; x < WORLD_WIDTH - 2; x += 1) {
      const tile = tiles[y * WORLD_WIDTH + x];
      if (!tile.walkable || tile.kind !== "ground") continue;
      if (x >= hub.x - 2 && x < hub.x + hub.width + 2 && y >= hub.y - 2 && y < hub.y + hub.height + 2) continue;
      if (spawns.some((spawn) => distance(spawn, { x, y }) <= 2)) continue;
      const roll = hash2(x, y, seed);
      if (roll > (zoneId === "grove" ? 0.87 : 0.91)) {
        const list = PROP_BY_ZONE[zoneId];
        const kind = list[Math.floor(hash2(y, x, seed + 77) * list.length) % list.length];
        props.push({ id: `prop-${x}-${y}`, x, y, kind, solid: kind !== "shrub" && kind !== "lantern", variant: Math.floor(hash2(x + 9, y - 4, seed) * 4) });
      }
    }
  }

  // Hub furniture and lighting are authored positions, making every spawn feel inhabited.
  props.push(
    { id: "hub-lantern-a", x: hub.x + 1, y: hub.y + 1, kind: "lantern", solid: false, variant: 0 },
    { id: "hub-lantern-b", x: hub.x + hub.width - 2, y: hub.y + 1, kind: "lantern", solid: false, variant: 1 },
    { id: "hub-crystal", x: cx, y: cy - 1, kind: "crystal", solid: true, variant: 2 },
    { id: "hub-ruin-a", x: hub.x + 1, y: hub.y + hub.height - 2, kind: "ruin", solid: true, variant: 1 },
  );

  const npcs: WorldNpc[] = [
    { id: "healer", name: "Mira", role: "Caravan healer", x: cx - 4, y: cy, palette: 1 },
    { id: "quartermaster", name: "Orin", role: "Quartermaster", x: cx + 5, y: cy, palette: 2 },
    { id: "pathfinder", name: "Tavi", role: "Pathfinder", x: cx + 2, y: cy + 3, palette: 3 },
    { id: "warden", name: "Sable", role: "Warden scout", x: cx - 4, y: cy + 3, palette: 4 },
  ];
  const structures: WorldStructure[] = [
    { id: "caravan-lodge", x: cx - 3, y: hub.y, width: 7, height: 3, kind: "lodge" },
    { id: "supply-tent", x: hub.x, y: hub.y + 1, width: 2, height: 2, kind: "tent" },
  ];

  const map: WorldMap = { zoneId, width: WORLD_WIDTH, height: WORLD_HEIGHT, tiles, props, spawns, npcs, structures, start: { x: cx, y: cy + 2 }, hub };
  // Solid props and authored structures participate in ground collision.
  const solid = new Set(props.filter((prop) => prop.solid).map(key));
  for (const structure of structures) {
    for (let sy = structure.y; sy < structure.y + structure.height; sy += 1) {
      for (let sx = structure.x; sx < structure.x + structure.width; sx += 1) solid.add(`${sx},${sy}`);
    }
  }
  map.tiles = tiles.map((tile) => solid.has(key(tile)) ? { ...tile, walkable: false } : tile);
  return map;
}

export function tileAt(map: WorldMap, point: GridPoint): WorldTile | null {
  if (point.x < 0 || point.y < 0 || point.x >= map.width || point.y >= map.height) return null;
  return map.tiles[point.y * map.width + point.x] ?? null;
}

export function isWalkable(map: WorldMap, point: GridPoint): boolean {
  return Boolean(tileAt(map, point)?.walkable);
}

export function nearestWalkable(map: WorldMap, origin: GridPoint): GridPoint {
  if (isWalkable(map, origin)) return origin;
  for (let radius = 1; radius < 12; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const candidate = { x: origin.x + dx, y: origin.y + dy };
        if (isWalkable(map, candidate)) return candidate;
      }
    }
  }
  return map.start;
}

const DIRECTIONS: readonly GridPoint[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

export function findPath(map: WorldMap, start: GridPoint, requestedGoal: GridPoint, maxNodes = 2200): GridPoint[] {
  const goal = nearestWalkable(map, requestedGoal);
  if (start.x === goal.x && start.y === goal.y) return [];
  const frontier: GridPoint[] = [start];
  const cameFrom = new Map<string, GridPoint | null>([[key(start), null]]);
  let visited = 0;

  while (frontier.length && visited < maxNodes) {
    frontier.sort((a, b) => (distance(a, goal) + distance(start, a) * 0.04) - (distance(b, goal) + distance(start, b) * 0.04));
    const current = frontier.shift()!;
    visited += 1;
    if (current.x === goal.x && current.y === goal.y) {
      const path: GridPoint[] = [];
      let cursor: GridPoint | null = current;
      while (cursor && !(cursor.x === start.x && cursor.y === start.y)) {
        path.push(cursor);
        cursor = cameFrom.get(key(cursor)) ?? null;
      }
      return path.reverse();
    }
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (!isWalkable(map, next) || cameFrom.has(key(next))) continue;
      cameFrom.set(key(next), current);
      frontier.push(next);
    }
  }
  return [];
}

export function pathToAdjacent(map: WorldMap, start: GridPoint, target: GridPoint): GridPoint[] {
  const candidates = DIRECTIONS
    .map((direction) => ({ x: target.x + direction.x, y: target.y + direction.y }))
    .filter((point) => isWalkable(map, point))
    .map((point) => ({ point, path: findPath(map, start, point) }))
    .filter(({ point, path }) => path.length > 0 || (point.x === start.x && point.y === start.y));
  candidates.sort((a, b) => a.path.length - b.path.length);
  return candidates[0]?.path ?? [];
}

export function worldDistance(a: GridPoint, b: GridPoint): number {
  return distance(a, b);
}
