import { createWorldMap, isWalkable, tileAt, type WorldMap } from "@/utils/world-engine";
import type { GridPoint } from "../core/grid";
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

/** A tile a creature may stand on: walkable terrain with nobody alive on it. */
export function isFree(map: WorldMap, entities: readonly Entity[], point: GridPoint, ignoreId?: string): boolean {
  if (!isWalkable(map, point)) return false;
  return !entities.some(
    (entity) =>
      entity.id !== ignoreId &&
      entity.state !== "dead" &&
      entity.x === point.x &&
      entity.y === point.y,
  );
}

/** Occupancy test used by pathfinding, where the mover ignores itself. */
export function walkableFor(map: WorldMap, entities: readonly Entity[], moverId: string) {
  return (point: GridPoint) => isFree(map, entities, point, moverId);
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
