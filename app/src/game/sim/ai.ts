import { distance, directionTowards, hasLineOfSight, type GridPoint } from "../core/grid";
import { findPath } from "../core/pathfind";
import type { Entity, GameState } from "../core/types";
import { isFree, sightBlocked, walkableFor, type Occupancy, type WorldMap } from "../world/map";
import { monsterTemplate } from "../world/monsters";
import { isAlive } from "./combat";
import { PLAYER_ID, playerOf } from "./state";

/**
 * Creature behaviour.
 *
 * Monsters notice the Porter within their vision radius and with clear line of
 * sight, chase while they stay near home, and turn back when leashed — which is
 * what makes a spawn a place you can approach or avoid, rather than a marker
 * that teleports to you.
 */

/** How often a chaser recomputes its route, in ticks. Cheaper than every step. */
const REPATH_INTERVAL = 6;

function repathDue(entity: Entity, tick: number): boolean {
  return (tick + entity.id.length) % REPATH_INTERVAL === 0;
}

/** Anything a monster wants to fight: the Porter and its companions. */
function hostileTargets(state: GameState): Entity[] {
  return state.entities.filter(
    (entity) => (entity.kind === "player" || entity.kind === "companion") && isAlive(entity),
  );
}

export function monstersOf(state: GameState): Entity[] {
  return state.entities.filter((entity) => entity.kind === "monster" && isAlive(entity));
}

/** Nearest live monster within `radius` of a point, ignoring line of sight. */
export function nearestMonster(state: GameState, from: GridPoint, radius = Infinity): Entity | null {
  let best: Entity | null = null;
  let bestDistance = Infinity;
  for (const monster of monstersOf(state)) {
    const range = distance(from, monster);
    if (range > radius || range >= bestDistance) continue;
    best = monster;
    bestDistance = range;
  }
  return best;
}

/** Live monsters sorted by distance — the battle list the client renders. */
export function battleList(state: GameState, radius = 9): Entity[] {
  const player = playerOf(state);
  return monstersOf(state)
    .filter((monster) => distance(player, monster) <= radius)
    .sort((a, b) => distance(player, a) - distance(player, b));
}

function home(state: GameState, monster: Entity): GridPoint | null {
  const spawn = state.spawns.find((candidate) => candidate.id === monster.spawnId);
  return spawn ? { x: spawn.x, y: spawn.y } : null;
}

/**
 * Decide what a monster wants this tick. Movement and attacks are executed by
 * the tick reducer; this only sets `targetId` and `path`.
 */
export function planMonster(state: GameState, map: WorldMap, occupancy: Occupancy, monster: Entity, tick: number): void {
  const template = monster.templateId ? monsterTemplate(monster.templateId) : null;
  const vision = template?.vision ?? 6;
  const leash = monster.leash ?? 12;
  const base = home(state, monster);
  const blocked = sightBlocked(map);

  // Drop a target that died, vanished or ran out of leash range.
  const current = state.entities.find((entity) => entity.id === monster.targetId);
  if (current && (!isAlive(current) || (base && distance(base, monster) > leash))) {
    monster.targetId = null;
    monster.path = [];
  }

  if (!monster.targetId) {
    let best: Entity | null = null;
    let bestDistance = Infinity;
    for (const candidate of hostileTargets(state)) {
      const range = distance(monster, candidate);
      if (range > vision || range >= bestDistance) continue;
      if (!hasLineOfSight(monster, candidate, blocked)) continue;
      best = candidate;
      bestDistance = range;
    }
    if (best) {
      monster.targetId = best.id;
      monster.path = [];
    }
  }

  const target = state.entities.find((entity) => entity.id === monster.targetId);
  if (target) {
    if (distance(monster, target) <= 1) {
      monster.path = [];
      monster.direction = directionTowards(monster, target);
      return;
    }
    if (monster.path.length === 0 || repathDue(monster, tick)) {
      monster.path = findPath(monster, target, {
        walkable: walkableFor(map, occupancy, monster.id),
        maxNodes: 900,
        stopAdjacent: true,
      });
    }
    return;
  }

  // No target: drift home, then idle. Wandering is deliberately rare so a
  // cleared area stays readable.
  if (base && distance(monster, base) > 2) {
    if (monster.path.length === 0 || repathDue(monster, tick)) {
      monster.path = findPath(monster, base, {
        walkable: walkableFor(map, occupancy, monster.id),
        maxNodes: 700,
      });
    }
    return;
  }
  if (monster.path.length === 0 && (tick + monster.id.length) % 40 === 0) {
    const drift = { x: monster.x + ((tick % 3) - 1), y: monster.y + (((tick >> 2) % 3) - 1) };
    if (isFree(map, occupancy, drift, monster.id)) monster.path = [drift];
  }
}

/**
 * Companions fight what the Porter is fighting and otherwise stay close. They
 * never wander off, so the party reads as a caravan rather than three
 * independent creatures.
 */
export function planCompanion(state: GameState, map: WorldMap, occupancy: Occupancy, companion: Entity, index: number, tick: number): void {
  const player = playerOf(state);
  const playerTarget = state.entities.find((entity) => entity.id === player.targetId);

  let target = state.entities.find((entity) => entity.id === companion.targetId);
  if (target && !isAlive(target)) {
    companion.targetId = null;
    target = undefined;
  }
  if (!target) {
    const preferred = playerTarget && isAlive(playerTarget) ? playerTarget : nearestMonster(state, companion, 7);
    if (preferred) {
      companion.targetId = preferred.id;
      companion.path = [];
      target = preferred;
    }
  }

  if (target && distance(companion, target) <= 8) {
    if (distance(companion, target) <= 1) {
      companion.path = [];
      companion.direction = directionTowards(companion, target);
      return;
    }
    if (companion.path.length === 0 || repathDue(companion, tick)) {
      companion.path = findPath(companion, target, {
        walkable: walkableFor(map, occupancy, companion.id),
        maxNodes: 800,
        stopAdjacent: true,
      });
    }
    return;
  }

  companion.targetId = null;
  // Trail the Porter in a loose formation rather than stacking on top of them.
  const offsets: GridPoint[] = [{ x: -1, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }];
  const wanted = offsets[index % offsets.length];
  const spot = { x: player.x + wanted.x, y: player.y + wanted.y };
  if (distance(companion, spot) <= 1) {
    companion.path = [];
    return;
  }
  if (companion.path.length === 0 || repathDue(companion, tick)) {
    companion.path = findPath(companion, spot, {
      walkable: walkableFor(map, occupancy, companion.id),
      maxNodes: 500,
      stopAdjacent: true,
    });
  }
}

/**
 * Auto-hunt. The idle pillar runs the real combat model rather than a parallel
 * formula: it picks a target, walks to it, and lets the ordinary attack and
 * loot rules apply. Manual control always wins — the caller skips this while
 * the player is steering.
 */
/**
 * How close the Porter gets to what they are hunting.
 *
 * They cannot fight, so walking into melee would only feed the monster free
 * hits. Hanging back a few tiles still keeps the creature — which engages
 * anything its handler has marked within eight tiles — on the target.
 */
const HANDLER_STANDOFF = 3;

export function planAutoHunt(state: GameState, map: WorldMap, occupancy: Occupancy, tick: number): void {
  const player = playerOf(state);
  if (!isAlive(player)) return;

  const target = state.entities.find((entity) => entity.id === player.targetId);
  if (target && isAlive(target)) {
    if (distance(player, target) <= HANDLER_STANDOFF) {
      player.path = [];
      player.direction = directionTowards(player, target);
      return;
    }
    if (player.path.length === 0 || repathDue(player, tick)) {
      player.path = findPath(player, target, {
        walkable: walkableFor(map, occupancy, PLAYER_ID),
        maxNodes: 1600,
        stopAdjacent: true,
      });
    }
    return;
  }

  // Loot first: an unopened corpse underfoot is worth more than the next kill.
  const pile = state.ground.find((candidate) => distance(player, candidate) <= 1 && candidate.items.length > 0);
  if (pile) {
    player.path = [];
    return;
  }

  const next = nearestMonster(state, player, 26);
  if (!next) {
    player.targetId = null;
    return;
  }
  player.targetId = next.id;
  player.path = findPath(player, next, {
    walkable: walkableFor(map, occupancy, PLAYER_ID),
    maxNodes: 1600,
    stopAdjacent: true,
  });
}
