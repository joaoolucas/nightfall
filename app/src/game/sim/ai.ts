import { distance, directionTowards, hasLineOfSight, type GridPoint } from "../core/grid";
import { findPath } from "../core/pathfind";
import type { Entity, GameState, GroundPile, ItemStack } from "../core/types";
import { isFree, sightBlocked, walkableFor, type Occupancy, type WorldMap } from "../world/map";
import { capacity, inventoryWeight, itemDef } from "../world/items";
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

// A note for whoever tries this next: holding a route until the quarry leaves
// the end of it, instead of recomputing every six ticks, was tried and is
// worse. It looks like the fix for dithering — seven in ten of the Porter's
// direction reversals are a route doubling back on an unchanged destination —
// but a stale route means the correction, when it finally comes, is a bigger
// and more visible swerve. Measured over ten minutes: reversals 7.5% -> 8.6%
// of steps, and steps taken away from a nearby monster 5.0% -> 9.3%.

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
export function battleList(state: GameState, view: GridPoint = { x: 9, y: 9 }): Entity[] {
  const player = playerOf(state);
  return monstersOf(state)
    .filter((monster) => Math.abs(monster.x - player.x) <= view.x && Math.abs(monster.y - player.y) <= view.y)
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

/**
 * How far the fight may drift before the Porter bothers to reposition.
 *
 * This is the difference between a handler holding their post and a handler
 * fidgeting. Without it they matched every step the monster took, forward and
 * back, and the movement had no readable intent at all.
 */
const STANDOFF_SLACK = 2;

/**
 * The Porter steps out of reach of anything that has closed on them.
 *
 * The standoff only ever pulled them forward: once a monster walked the last
 * three tiles itself, nothing in the plan said what to do about it. So the
 * Porter — who cannot swing back — stood in contact taking free hits until
 * their creature finished the kill. Measured over twenty minutes of unattended
 * hunting, a third of every tick was spent motionless with a monster against
 * them, in stretches of up to ten seconds. On screen that is not a handler
 * holding their post, it is a character that has stopped working.
 *
 * Backing off one tile at a time is enough. The monster spends its steps
 * following instead of swinging, the creature keeps hitting it from behind,
 * and the movement reads as a handler giving ground rather than fleeing.
 */
const CONTACT = 1;

/**
 * How far the Porter may back away from their own creature.
 *
 * The retreat has to stay a retreat and not become a rout: the creature takes
 * its fight from whatever its handler has marked, so a Porter who kept
 * stepping back would eventually drag it off the monster it was killing.
 */
const BACKOFF_LEASH = 6;

/** Live monsters standing close enough to swing at the Porter. */
function inContact(state: GameState, player: Entity): Entity[] {
  return monstersOf(state).filter((monster) => distance(player, monster) <= CONTACT);
}

/** Distance from a tile to the nearest live monster; Infinity when there is none. */
function threatRange(state: GameState, at: GridPoint): number {
  let nearest = Infinity;
  for (const monster of monstersOf(state)) nearest = Math.min(nearest, distance(at, monster));
  return nearest;
}

/**
 * Give ground, if there is ground to give.
 *
 * One step, to whichever neighbouring tile puts the most air between the
 * Porter and the nearest monster, and never so far that they lose their own
 * creature. Surrounded with nowhere free to go, they stand — that is the fight
 * they are in, not a stall — and the caller carries on as before.
 */
function backOff(state: GameState, map: WorldMap, occupancy: Occupancy, player: Entity): boolean {
  const threats = inContact(state, player);
  if (!threats.length) return false;

  const creature = state.entities.find((entity) => entity.kind === "companion" && isAlive(entity));
  let best: GridPoint | null = null;
  let bestRange = threatRange(state, player);

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const candidate = { x: player.x + dx, y: player.y + dy };
      if (!isFree(map, occupancy, candidate, PLAYER_ID)) continue;
      if (creature && distance(candidate, creature) > BACKOFF_LEASH) continue;
      const range = threatRange(state, candidate);
      if (range <= bestRange) continue;
      best = candidate;
      bestRange = range;
    }
  }
  if (!best) return false;

  player.goal = undefined;
  player.path = [best];
  // Still watching what is coming for them, not the tile they are heading to.
  player.direction = directionTowards(player, threats[0]);
  return true;
}

/**
 * Whether the Porter could take this stack if they tried.
 *
 * Currency always: it is the point of hunting and weighs against capacity only
 * as coin. Everything else has to fit, by the same measure the tick reducer
 * uses when it picks loot up.
 */
function canLift(state: GameState, stack: ItemStack): boolean {
  if (stack.defId === "gold" || stack.defId === "shard") return true;
  const room = capacity(state.progress.level) - inventoryWeight(state.inventory);
  return itemDef(stack.defId).weight * stack.count <= room;
}

/**
 * How far the Porter will walk off to collect a body, and how far they will
 * look for the next thing to hunt.
 *
 * Collecting is bounded twice over. Between fights they will cross a room for
 * a body; while their creature is actually swinging at something they will
 * only step to one practically at their feet. Letting them cross that room
 * mid-fight is what made them look like they were running away — they were
 * walking off from a live monster towards a corpse, which is indistinguishable
 * from fleeing, and it dragged the creature off its target too.
 *
 * The hunt range is what the screen shows, near enough. Ranging further meant
 * setting off towards a monster nobody could see, which is the other half of
 * "he walks off in a direction that makes no sense". Only when there is
 * genuinely nothing in sight do they look further afield, and then an empty
 * screen explains the walk by itself.
 */
const COLLECT_BETWEEN_FIGHTS = 7;
const COLLECT_MID_FIGHT = 2;
const HUNT_IN_SIGHT = 12;
const HUNT_FURTHER = 26;

/** The nearest body carrying something the Porter could actually take. */
function nearestBody(state: GameState, player: Entity, radius: number): GroundPile | null {
  let best: GroundPile | null = null;
  let bestDistance = Infinity;
  for (const pile of state.ground) {
    const range = distance(player, pile);
    if (range > radius || range >= bestDistance) continue;
    if (!pile.items.some((stack) => canLift(state, stack))) continue;
    best = pile;
    bestDistance = range;
  }
  return best;
}

/** Is the creature in the field actually engaged on something alive? */
function creatureIsFighting(state: GameState): boolean {
  const creature = state.entities.find((entity) => entity.kind === "companion" && isAlive(entity));
  if (!creature) return false;
  const quarry = state.entities.find((entity) => entity.id === creature.targetId);
  return !!quarry && isAlive(quarry) && distance(creature, quarry) <= 2;
}

/**
 * Is the body the Porter set out for still worth the walk?
 *
 * Holding a destination is what makes the movement readable, but holding one
 * that has rotted away or been emptied would be worse than re-deciding.
 */
function goalStillWorthIt(state: GameState, player: Entity): boolean {
  if (!player.goal) return false;
  const pile = state.ground.find(
    (candidate) => candidate.x === player.goal!.x && candidate.y === player.goal!.y,
  );
  return !!pile && pile.items.some((stack) => canLift(state, stack));
}

export function planAutoHunt(state: GameState, map: WorldMap, occupancy: Occupancy, tick: number): void {
  const player = playerOf(state);
  if (!isAlive(player)) {
    player.goal = undefined;
    return;
  }

  // Nothing outranks getting out of reach. The Porter cannot trade blows, so
  // every tick spent in contact is damage taken for nothing — and a character
  // standing still while three monsters chew on them is the single clearest
  // way this game can look broken. Corpses and posts can wait a step.
  if (backOff(state, map, occupancy, player)) return;

  // A body the Porter already set out for is seen through. Re-arguing the case
  // every tick is what made them drift: they would start for one corpse, notice
  // a nearer one, turn, and end up walking between the two without reaching
  // either. Commitment is the whole point.
  if (goalStillWorthIt(state, player)) {
    if (distance(player, player.goal!) <= 1) {
      player.goal = undefined;
      player.path = [];
      return;
    }
    if (player.path.length === 0) {
      player.path = findPath(player, player.goal!, {
        walkable: walkableFor(map, occupancy, PLAYER_ID),
        maxNodes: 900,
      });
      // Nowhere to walk: give it up rather than stand facing it.
      if (player.path.length === 0) player.goal = undefined;
    }
    if (player.goal) return;
  }
  player.goal = undefined;

  // Collecting only outranks the fight when it costs a step or two. The
  // creature takes its fight from the Porter's mark, so a long detour calls it
  // off the thing it was killing.
  const reach = creatureIsFighting(state) ? COLLECT_MID_FIGHT : COLLECT_BETWEEN_FIGHTS;
  const body = nearestBody(state, player, reach);
  if (body) {
    if (distance(player, body) <= 1) {
      player.path = [];
      return;
    }
    const route = findPath(player, body, {
      walkable: walkableFor(map, occupancy, PLAYER_ID),
      maxNodes: 900,
    });
    if (route.length > 0) {
      player.goal = { x: body.x, y: body.y };
      player.path = route;
      return;
    }
  }

  const target = state.entities.find((entity) => entity.id === player.targetId);
  if (target && isAlive(target)) {
    // A deadband, not a line. Holding position at exactly three tiles meant
    // shuffling: the monster steps, the Porter is now four tiles off and walks
    // in, the monster steps back, the Porter stops — a step forward and a step
    // back for as long as the fight lasted, which is most of what made the
    // walking impossible to read. Once they have taken their post they keep it
    // until the fight genuinely moves away from them.
    const post = player.path.length === 0 ? HANDLER_STANDOFF + STANDOFF_SLACK : HANDLER_STANDOFF;
    if (distance(player, target) <= post) {
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

  const next =
    nearestMonster(state, player, HUNT_IN_SIGHT) ?? nearestMonster(state, player, HUNT_FURTHER);
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
