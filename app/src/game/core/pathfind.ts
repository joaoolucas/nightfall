import { DIRECTIONS_8, DIRECTION_DELTA, distance, key, samePoint, type GridPoint } from "./grid";

/**
 * 8-directional A* over the tile grid.
 *
 * Replaces the previous greedy search, which re-sorted the whole frontier on
 * every expansion and could return a detour rather than a shortest path.
 * Diagonals cost more than cardinals so routes read as straight lines, and
 * corner cutting is forbidden so nothing slips between two solid tiles.
 */

const CARDINAL_COST = 10;
const DIAGONAL_COST = 14;

interface Node {
  point: GridPoint;
  g: number;
  f: number;
}

/** Binary min-heap keyed on f. */
class Heap {
  private items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node): void {
    this.items.push(node);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].f <= this.items[index].f) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  pop(): Node | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      this.items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.items.length && this.items[left].f < this.items[smallest].f) smallest = left;
        if (right < this.items.length && this.items[right].f < this.items[smallest].f) smallest = right;
        if (smallest === index) break;
        [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
        index = smallest;
      }
    }
    return top;
  }
}

export interface PathOptions {
  /** Can this tile be stood on? */
  walkable: (point: GridPoint) => boolean;
  /** Stop expanding after this many nodes; a long path is better abandoned than stalled. */
  maxNodes?: number;
  /** Accept any tile adjacent to the goal instead of the goal itself (melee approach). */
  stopAdjacent?: boolean;
}

/**
 * Steps from `start` (exclusive) to `goal` (inclusive). Empty when no route
 * exists, when already there, or when the search budget runs out.
 */
export function findPath(start: GridPoint, goal: GridPoint, options: PathOptions): GridPoint[] {
  const { walkable, maxNodes = 4000, stopAdjacent = false } = options;
  if (samePoint(start, goal)) return [];
  if (stopAdjacent && distance(start, goal) === 1) return [];

  const reached = stopAdjacent
    ? (point: GridPoint) => distance(point, goal) <= 1
    : (point: GridPoint) => samePoint(point, goal);

  // Without this an unreachable goal burns the whole node budget every call.
  if (!stopAdjacent && !walkable(goal)) return [];

  const open = new Heap();
  const cameFrom = new Map<string, GridPoint | null>();
  const cost = new Map<string, number>();
  const startKey = key(start);
  cameFrom.set(startKey, null);
  cost.set(startKey, 0);
  open.push({ point: start, g: 0, f: distance(start, goal) * CARDINAL_COST });

  let expanded = 0;
  while (open.size && expanded < maxNodes) {
    const current = open.pop();
    if (!current) break;
    expanded += 1;
    const currentKey = key(current.point);
    if (current.g > (cost.get(currentKey) ?? Infinity)) continue;

    if (reached(current.point)) {
      const path: GridPoint[] = [];
      let cursor: GridPoint | null = current.point;
      while (cursor && !samePoint(cursor, start)) {
        path.push(cursor);
        cursor = cameFrom.get(key(cursor)) ?? null;
      }
      return path.reverse();
    }

    for (const direction of DIRECTIONS_8) {
      const delta = DIRECTION_DELTA[direction];
      const next = { x: current.point.x + delta.x, y: current.point.y + delta.y };
      if (!walkable(next)) continue;
      const diagonal = delta.x !== 0 && delta.y !== 0;
      if (diagonal) {
        // Refuse to squeeze through the corner between two solid tiles.
        if (!walkable({ x: current.point.x + delta.x, y: current.point.y })) continue;
        if (!walkable({ x: current.point.x, y: current.point.y + delta.y })) continue;
      }
      const nextKey = key(next);
      const g = current.g + (diagonal ? DIAGONAL_COST : CARDINAL_COST);
      if (g >= (cost.get(nextKey) ?? Infinity)) continue;
      cost.set(nextKey, g);
      cameFrom.set(nextKey, current.point);
      open.push({ point: next, g, f: g + distance(next, goal) * CARDINAL_COST });
    }
  }
  return [];
}

/** Nearest standable tile to `origin`, spiralling outward. */
export function nearestWalkable(origin: GridPoint, walkable: (point: GridPoint) => boolean, maxRadius = 12): GridPoint | null {
  if (walkable(origin)) return origin;
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const candidate = { x: origin.x + dx, y: origin.y + dy };
        if (walkable(candidate)) return candidate;
      }
    }
  }
  return null;
}
