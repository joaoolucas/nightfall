/**
 * Tile-space geometry.
 *
 * Movement and melee range are 8-directional with Chebyshev distance, matching
 * how a top-down tile RPG reads: a creature diagonally adjacent to you is in
 * range, and stepping diagonally is one step.
 */

export interface GridPoint {
  x: number;
  y: number;
}

export type Direction8 =
  | "north" | "north-east" | "east" | "south-east"
  | "south" | "south-west" | "west" | "north-west";

export type Cardinal = "north" | "east" | "south" | "west";

export const DIRECTION_DELTA: Record<Direction8, GridPoint> = {
  north: { x: 0, y: -1 },
  "north-east": { x: 1, y: -1 },
  east: { x: 1, y: 0 },
  "south-east": { x: 1, y: 1 },
  south: { x: 0, y: 1 },
  "south-west": { x: -1, y: 1 },
  west: { x: -1, y: 0 },
  "north-west": { x: -1, y: -1 },
};

/** Cardinals first: monster steps prefer straight lines, which reads cleaner. */
export const DIRECTIONS_8: readonly Direction8[] = [
  "north", "east", "south", "west",
  "north-east", "south-east", "south-west", "north-west",
];

export const DIRECTIONS_4: readonly Direction8[] = ["north", "east", "south", "west"];

export function key(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

export function samePoint(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

export function translate(point: GridPoint, direction: Direction8): GridPoint {
  const delta = DIRECTION_DELTA[direction];
  return { x: point.x + delta.x, y: point.y + delta.y };
}

/** Chebyshev: the number of 8-directional steps between two tiles. */
export function distance(a: GridPoint, b: GridPoint): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Manhattan, used only where a cheaper tie-break is wanted. */
export function manhattan(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isAdjacent(a: GridPoint, b: GridPoint): boolean {
  return distance(a, b) === 1;
}

export function directionFromDelta(dx: number, dy: number): Direction8 {
  const nx = Math.sign(dx);
  const ny = Math.sign(dy);
  if (nx === 0 && ny === 0) return "south";
  if (nx === 0) return ny < 0 ? "north" : "south";
  if (ny === 0) return nx > 0 ? "east" : "west";
  if (nx > 0) return ny < 0 ? "north-east" : "south-east";
  return ny < 0 ? "north-west" : "south-west";
}

export function directionTowards(from: GridPoint, to: GridPoint): Direction8 {
  return directionFromDelta(to.x - from.x, to.y - from.y);
}

/** Walk cycles only exist for the four cardinals; diagonals borrow the dominant axis. */
export function cardinalOf(direction: Direction8): Cardinal {
  const delta = DIRECTION_DELTA[direction];
  if (Math.abs(delta.x) >= Math.abs(delta.y)) return delta.x > 0 ? "east" : "west";
  return delta.y > 0 ? "south" : "north";
}

/**
 * Bresenham line of sight. A monster only notices the player if nothing blocks
 * the straight line between them, so walls and buildings actually hide you.
 */
export function hasLineOfSight(a: GridPoint, b: GridPoint, blocked: (point: GridPoint) => boolean): boolean {
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const stepX = a.x < b.x ? 1 : -1;
  const stepY = a.y < b.y ? 1 : -1;
  let error = dx - dy;

  // The endpoints themselves never block: you can see the creature standing on
  // an obstructed tile, and you can always see out of your own tile.
  for (let guard = 0; guard < 512; guard += 1) {
    if (x === b.x && y === b.y) return true;
    const doubled = error * 2;
    if (doubled > -dy) { error -= dy; x += stepX; }
    if (doubled < dx) { error += dx; y += stepY; }
    if (x === b.x && y === b.y) return true;
    if (blocked({ x, y })) return false;
  }
  return false;
}

/** Tiles within `radius` steps of `origin`, nearest first. */
export function tilesWithin(origin: GridPoint, radius: number): GridPoint[] {
  const points: GridPoint[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      points.push({ x: origin.x + dx, y: origin.y + dy });
    }
  }
  return points.sort((a, b) => distance(origin, a) - distance(origin, b));
}
