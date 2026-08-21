import { distance, directionTowards, hasLineOfSight, samePoint, type GridPoint } from "../core/grid";
import { findPath, nearestWalkable } from "../core/pathfind";
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
 * loot rules apply. It is the only thing that moves the Porter: the client
 * hands the player no way to steer them.
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

/**
 * What standing on a tile would cost, as the fight actually charges for it.
 *
 * How many monsters could swing at the Porter from there comes first, and only
 * then how far the nearest one is. Ordering it the other way — nearest range
 * alone — is a real mistake with a real symptom: cornered by three coalbacks
 * with their creature beside them, every square within reach was a tile away
 * from *something*, so nothing scored better than standing still and the
 * Porter took three blows a round rather than step somewhere only one of them
 * could follow.
 */
interface Exposure {
  touching: number;
  nearest: number;
}

function exposureAt(state: GameState, at: GridPoint): Exposure {
  let touching = 0;
  let nearest = Infinity;
  for (const monster of monstersOf(state)) {
    const range = distance(at, monster);
    if (range <= CONTACT) touching += 1;
    if (range < nearest) nearest = range;
  }
  return { touching, nearest };
}

/** Is the first a better place to stand than the second? */
function safer(a: Exposure, b: Exposure): boolean {
  return a.touching !== b.touching ? a.touching < b.touching : a.nearest > b.nearest;
}

/**
 * Give ground, if there is ground to give.
 *
 * One step, to whichever neighbouring tile fewer monsters can reach — their
 * own creature's square included, since the two change places — and never so
 * far that they lose that creature. Failing that, a route out of the pocket.
 * Failing even that they stand, which by then is the fight they are in rather
 * than a stall.
 */
function backOff(state: GameState, map: WorldMap, occupancy: Occupancy, player: Entity): boolean {
  const threats = inContact(state, player);
  if (!threats.length) return false;

  const creature = state.entities.find((entity) => entity.kind === "companion" && isAlive(entity));
  const here = exposureAt(state, player);
  let best: GridPoint | null = null;
  let bestExposure = here;

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const candidate = { x: player.x + dx, y: player.y + dy };
      if (!isFree(map, occupancy, candidate, PLAYER_ID)) continue;
      if (creature && distance(candidate, creature) > BACKOFF_LEASH) continue;
      const exposure = exposureAt(state, candidate);
      if (!safer(exposure, bestExposure)) continue;
      best = candidate;
      bestExposure = exposure;
    }
  }

  // Ground of their own first, and only then their creature's square: the two
  // change places, which the reducer allows. It has to be the last resort and
  // not a preference — a creature dragged backwards every time the Porter felt
  // crowded is a creature that never finishes anything, and trying it first
  // cost two thirds of the kills in a fifty-minute run. But when the pack has
  // filled every other square, which is precisely the corner the Porter used
  // to be beaten to death in, it is the only move on the board, and it puts
  // the one who can actually fight in front.
  if (!best && creature && distance(player, creature) <= CONTACT) {
    const swapped = exposureAt(state, creature);
    if (safer(swapped, here)) best = { x: creature.x, y: creature.y };
  }
  if (best) {
    player.goal = undefined;
    player.path = [best];
    // Still watching what is coming for them, not the tile they are heading to.
    player.direction = directionTowards(player, threats[0]);
    return true;
  }

  // No neighbouring tile is any better, which is a pocket, not a stalemate: a
  // doorway or a den corner with the pack filling every square around it. One
  // greedy step cannot leave a pocket — every first step out of one is sideways
  // or worse — so this asks for a route to open ground instead, and walks it.
  // Without this the Porter simply stood in the nook and was chewed on, which
  // is the freeze the retreat was written to end.
  if (player.path.length > 0) return true;

  const refuge = nearestWalkable(
    player,
    (point) =>
      isFree(map, occupancy, point, PLAYER_ID)
      && exposureAt(state, point).nearest >= HANDLER_STANDOFF
      && (!creature || distance(point, creature) <= BACKOFF_LEASH),
    8,
  );
  if (!refuge) return false;

  const route = findPath(player, refuge, {
    walkable: walkableFor(map, occupancy, PLAYER_ID),
    maxNodes: 600,
  });
  if (route.length === 0) return false;

  player.goal = undefined;
  player.path = route;
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

/**
 * How many monsters are tried before the Porter settles for one.
 *
 * Nearest-first, and the first that can actually be walked to wins. It has to
 * be more than one: the nearest monster is regularly the one boxed into a den
 * by its own kind, and taking it on faith is what stopped the hunt. It has to
 * be few, because each candidate costs a search.
 *
 * The wider sweep gets a longer list rather than the same one twice. Cinderpath
 * puts a lava field through the middle of the map, and the four monsters
 * nearest the Porter are regularly all on the far side of it: with the same
 * four tried both times, the sweep that was supposed to range further just
 * repeated the failure, and the Porter stood for thirty-six seconds with
 * nineteen monsters alive on the map.
 */
const HUNT_ATTEMPTS = 4;
const HUNT_ATTEMPTS_FAR = 12;

/**
 * The Porter's search budget, in nodes.
 *
 * A biome is 52 by 38, which is 1,976 tiles, so anything under that can fail
 * on a route that is merely long — around the lava rather than across it — and
 * report a reachable monster as unreachable. The budget has to be able to see
 * the whole map, or the failure it produces is a lie.
 */
const HUNT_NODES = 3_000;

/** A monster the Porter can reach, and the route that gets them there. */
function huntable(
  state: GameState,
  map: WorldMap,
  occupancy: Occupancy,
  player: Entity,
  radius: number,
  attempts: number,
): { entity: Entity; route: GridPoint[] } | null {
  const candidates = monstersOf(state)
    .filter((monster) => distance(player, monster) <= radius)
    .sort((a, b) => distance(player, a) - distance(player, b))
    .slice(0, attempts);

  for (const candidate of candidates) {
    // Already at their post: no route is needed, and asking for one would come
    // back empty and read as unreachable.
    if (distance(player, candidate) <= HANDLER_STANDOFF + STANDOFF_SLACK) {
      return { entity: candidate, route: [] };
    }
    const route = findPath(player, candidate, {
      walkable: walkableFor(map, occupancy, PLAYER_ID),
      maxNodes: HUNT_NODES,
      stopAdjacent: true,
    });
    if (route.length > 0) return { entity: candidate, route };
  }
  return null;
}

/**
 * A step, when there is nothing to hunt and nothing to collect.
 *
 * Rare by design: it only runs when every monster in range is walled off or
 * boxed in. One tile at a time towards open ground, which is enough to break
 * whatever standoff hid the rest of the map, and slow enough that it never
 * looks like the Porter has somewhere better to be.
 */
function wander(state: GameState, map: WorldMap, occupancy: Occupancy, player: Entity, tick: number): void {
  if (player.path.length > 0 || tick % 8 !== 0) return;

  const monster = nearestMonster(state, player);
  const free: GridPoint[] = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const candidate = { x: player.x + dx, y: player.y + dy };
      if (isFree(map, occupancy, candidate, PLAYER_ID)) free.push(candidate);
    }
  }
  if (!free.length) return;

  // Towards whatever is out there, if any of these tiles is towards it — and
  // otherwise simply somewhere. Three fixed candidates were tried first and
  // are not enough: pressed against a wall between them and the monster, all
  // three are the wall, and the Porter stands against it indefinitely.
  const best = monster
    ? free.reduce((a, b) => (distance(b, monster) < distance(a, monster) ? b : a))
    : free[tick % free.length];
  player.path = [best];
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
        maxNodes: HUNT_NODES,
        stopAdjacent: true,
      });
      // A mark with no way to it is not a mark. Holding one is how the hunt
      // stopped: the Porter cannot kill, so a monster they cannot reach stays
      // alive, and a live target sent this function home every tick without
      // ever asking for another. Measured over fifty minutes of unattended
      // play, that left them standing for five and a half minutes at a stretch
      // — the game had simply stopped, which is the one thing an idle game
      // must never do.
      if (player.path.length === 0) player.targetId = null;
    }
    if (player.targetId) return;
  }

  const next = huntable(state, map, occupancy, player, HUNT_IN_SIGHT, HUNT_ATTEMPTS)
    ?? huntable(state, map, occupancy, player, HUNT_FURTHER, HUNT_ATTEMPTS_FAR);
  if (!next) {
    player.targetId = null;
    // Nothing they can walk to anywhere in sight: keep the caravan moving
    // rather than let it set as a statue while the world carries on.
    wander(state, map, occupancy, player, tick);
    return;
  }
  player.targetId = next.entity.id;
  player.path = next.route;
}
