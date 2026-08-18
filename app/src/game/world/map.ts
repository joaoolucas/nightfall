import { createWorldMap, isWalkable, tileAt, type WorldMap } from "@/utils/world-engine";
import { key, type GridPoint } from "../core/grid";
import type { Entity } from "../core/types";

/**
 * The world map, plus the occupancy rules the simulation needs on top of it.
 *
 * Terrain generation still lives in `utils/world-engine` — it is tested and
 * works. What is added here is the notion that living creatures block tiles,
 * which is what makes a corridor defensible and stops two monsters stacking.
 */

export { createWorldMap, isWalkable, tileAt };
export type { WorldMap };

/**
 * Which tiles are occupied, indexed by tile key.
 *
 * This exists because the naive test — scan every entity for every candidate
 * tile — is quadratic in the worst place possible: A* consults it once per
 * expanded node, so a single 900-node path over two dozen creatures did more
 * than twenty thousand comparisons, and every monster re-paths several times a
 * second. Building the index once per tick and mutating it as creatures step
 * turns each lookup into a single hash probe.
 */
export class Occupancy {
  private readonly tiles = new Map<string, string>();

  constructor(entities: readonly Entity[]) {
    for (const entity of entities) {
      if (entity.state === "dead") continue;
      this.tiles.set(key(entity), entity.id);
    }
  }

  /** Who is standing here, if anyone. */
  at(point: GridPoint): string | undefined {
    return this.tiles.get(key(point));
  }

  /** Record a creature's step, so later lookups this tick see it. */
  move(id: string, from: GridPoint, to: GridPoint): void {
    if (this.tiles.get(key(from)) === id) this.tiles.delete(key(from));
    this.tiles.set(key(to), id);
  }

  add(id: string, point: GridPoint): void {
    this.tiles.set(key(point), id);
  }

  remove(point: GridPoint): void {
    this.tiles.delete(key(point));
  }
}

/** A tile a creature may stand on: walkable terrain with nobody alive on it. */
export function isFree(map: WorldMap, occupancy: Occupancy, point: GridPoint, moverId?: string): boolean {
  if (!isWalkable(map, point)) return false;
  const holder = occupancy.at(point);
  return holder === undefined || holder === moverId;
}

/** Occupancy test for pathfinding, where the mover ignores itself. */
export function walkableFor(map: WorldMap, occupancy: Occupancy, moverId: string) {
  return (point: GridPoint) => isFree(map, occupancy, point, moverId);
}

/**
 * Sight is blocked by terrain only. A creature standing in a doorway does not
 * hide what is behind it, which keeps chases from flickering as bodies move.
 */
export function sightBlocked(map: WorldMap) {
  return (point: GridPoint) => {
    const tile = tileAt(map, point);
    return !tile || (!tile.walkable && tile.kind !== "water" && tile.kind !== "hazard");
  };
}
