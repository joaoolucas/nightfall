import { directionTowards, distance, samePoint } from "../core/grid";
import { nextFloat } from "../core/rng";
import { TICK_MS, type CombatEvent, type Entity, type GameState, type ItemStack, type SkillId } from "../core/types";
import { nearestWalkable } from "../core/pathfind";
import { Occupancy, isFree, type WorldMap } from "../world/map";
import { addToStacks, capacity, findStack, inventoryWeight, itemDef, removeFromStacks } from "../world/items";
import { monsterTemplate } from "../world/monsters";
import { planAutoHunt, planCompanion, planMonster } from "./ai";
import { ATTACK_WINDUP, applyDamage, canAct, isAlive, rollSwing } from "./combat";
import { makeCorpse, pileAt } from "./loot";
import {
  MAX_ACTIVE_COMPANIONS,
  PLAYER_ID,
  addLog,
  createInitialState,
  expForCompanionLevel,
  expForLevel,
  isOverloaded,
  makeCompanion,
  makeMonster,
  companionAttack,
  playerDefense,
  playerMaxHp,
  playerOf,
  triesForSkill,
} from "./state";

/**
 * The simulation reducer.
 *
 * One call advances the world by whole ticks and returns the events produced.
 * It touches no DOM and no React, so the identical function drives the live
 * client at 10 ticks per second and the offline catch-up in a tight loop.
 */

/** Ticks between the player's swings — a deliberate rhythm, not a damage rate. */
const PLAYER_ATTACK_TICKS = 20;
/**
 * Ticks between the Porter's steps, and the toll for hauling too much.
 *
 * Four ticks — four tenths of a second a tile. Three was tried and reads as
 * scurrying: at that pace a step lands before the eye has finished the last
 * one, and the walk stops looking like travel and starts looking like a
 * glitch. The speed the game actually gained came from coins no longer
 * weighing, which is what had every real save pinned at the overloaded rate.
 */
const PLAYER_STEP_TICKS = 4;
const OVERLOADED_STEP_TICKS = 8;
/** Below this fraction of health, auto-potion drinks. */
const AUTO_POTION_AT = 0.35;
/** Ticks the Porter is out of action after dying. */
const DEATH_RECOVERY_TICKS = 40;

export interface AdvanceOptions {
  /** Suppress auto-hunt while the player is steering manually. */
  manualControl?: boolean;
  /** Cap on events returned; offline runs discard most of them. */
  collectEvents?: boolean;
}

function stepCost(entity: Entity, overloaded: boolean): number {
  if (entity.kind === "player") return overloaded ? OVERLOADED_STEP_TICKS : PLAYER_STEP_TICKS;
  if (entity.kind === "monster") return entity.stats.speed;
  // Faster creatures step more often; the clamp stops a fast companion blurring.
  return Math.max(3, Math.round(9 - entity.stats.speed / 25));
}

function attackCost(entity: Entity): number {
  if (entity.kind === "player") return PLAYER_ATTACK_TICKS;
  if (entity.kind === "monster" && entity.templateId) return monsterTemplate(entity.templateId).attackSpeed;
  return 22;
}

/**
 * The Porter never appears here: they do not swing at all. Their creature
 * carries their handling skill and their weapon into the fight instead.
 */
function attackPowerOf(state: GameState, entity: Entity): number {
  return entity.kind === "companion" ? companionAttack(state, entity) : entity.stats.attack;
}

function defensePowerOf(state: GameState, entity: Entity): number {
  return entity.kind === "player" ? playerDefense(state) : entity.stats.defense;
}

/** Advance a skill by one use, returning true when it levelled. */
function trainSkill(state: GameState, skill: SkillId): boolean {
  const tries = state.progress.skillTries[skill] + 1;
  const needed = triesForSkill(state.progress.skills[skill]);
  if (tries < needed) {
    state.progress.skillTries = { ...state.progress.skillTries, [skill]: tries };
    return false;
  }
  state.progress.skills = { ...state.progress.skills, [skill]: state.progress.skills[skill] + 1 };
  state.progress.skillTries = { ...state.progress.skillTries, [skill]: 0 };
  return true;
}

function grantExp(state: GameState, amount: number, events: CombatEvent[]): void {
  state.progress.exp += amount;
  while (state.progress.exp >= expForLevel(state.progress.level)) {
    state.progress.exp -= expForLevel(state.progress.level);
    state.progress.level += 1;
    events.push({ type: "levelUp", tick: state.tick, amount: state.progress.level });
  }
  const share = Math.max(1, Math.floor(amount / Math.max(1, state.activeCompanionIds.length)));
  state.companions = state.companions.map((companion) => {
    if (!state.activeCompanionIds.includes(companion.id)) return companion;
    let exp = companion.exp + share;
    let level = companion.level;
    while (exp >= expForCompanionLevel(level)) {
      exp -= expForCompanionLevel(level);
      level += 1;
    }
    return { ...companion, exp, level };
  });
}

/**
 * Take what fits, and report what does not.
 *
 * Currency is always taken: it is the point of hunting and it has no slot to
 * fill. Everything else has to pass the same capacity check the player faces
 * when looting a corpse by hand — without it, auto-loot hauled the Porter to
 * three times their capacity and the capacity bar stopped meaning anything.
 */
function pickUp(state: GameState, stacks: ItemStack[], events: CombatEvent[]): ItemStack[] {
  const refused: ItemStack[] = [];
  let took = false;

  for (const stack of stacks) {
    if (stack.defId === "gold") {
      state.inventory = { ...state.inventory, gold: state.inventory.gold + stack.count };
    } else if (stack.defId === "shard") {
      state.inventory = { ...state.inventory, shards: state.inventory.shards + stack.count };
    } else {
      const def = itemDef(stack.defId);
      const room = capacity(state.progress.level) - inventoryWeight(state.inventory);
      if (def.weight * stack.count > room) {
        refused.push(stack);
        continue;
      }
      state.inventory = { ...state.inventory, stacks: addToStacks(state.inventory.stacks, stack) };
    }
    took = true;
    events.push({ type: "loot", tick: state.tick, amount: stack.count, text: itemDef(stack.defId).name });
  }

  // The refusal is only worth saying on the pass that emptied the rest of the
  // pile. The Porter keeps standing on what they could not lift, so announcing
  // it every tick would bury the log ten lines a second.
  if (took) {
    for (const stack of refused) {
      events.push({ type: "refused", tick: state.tick, amount: stack.count, text: itemDef(stack.defId).name });
    }
  }

  return refused;
}

/** Drink the potion the Porter chose, if they are carrying any. */
function drinkPotion(state: GameState, player: Entity, events: CombatEvent[]): boolean {
  const chosen = state.settings.potionId;
  if (!chosen) return false;
  const stack = findStack(state.inventory.stacks, chosen);
  if (!stack) return false;
  const def = itemDef(stack.defId);
  const healed = Math.round(player.maxHp * (def.heal ?? 0.4));
  player.hp = Math.min(player.maxHp, player.hp + healed);
  state.inventory = { ...state.inventory, stacks: removeFromStacks(state.inventory.stacks, stack.instanceId, 1) };
  events.push({ type: "heal", tick: state.tick, targetId: player.id, amount: healed, at: { x: player.x, y: player.y } });
  return true;
}

function killPlayer(state: GameState, player: Entity, events: CombatEvent[]): void {
  // Dying costs experience, which is what gives a tile RPG its stakes. Nothing
  // is dropped yet; that lands with the full container UI.
  const lost = Math.round(state.progress.exp * 0.1 + expForLevel(state.progress.level) * 0.05);
  state.progress.exp = Math.max(0, state.progress.exp - lost);
  state.deaths += 1;
  events.push({ type: "say", tick: state.tick, text: `You are dead. You lose ${lost} experience.` });
}

/**
 * Keep the roster and the field in agreement.
 *
 * This is an invariant, not a convenience. The Porter cannot swing: everything
 * that dies is killed by the creature they sent out. So a roster that names a
 * creature with no entity on the map does not degrade the game, it stops it —
 * auto-hunt walks the Porter to within three tiles of a monster and holds them
 * there, waiting for a kill that nothing can deliver, until the player clicks.
 *
 * Two paths used to produce exactly that: travelling to another zone rebuilt
 * the world with the starter creature while the roster still named whichever
 * one you had sent out, and loading that save then dropped the mismatched
 * entity as stale. Both are fixed at their source; this stands behind them so
 * no future path can strand the Porter alone again.
 *
 * A roster that names nobody is left alone: it is consistent — nothing chosen,
 * nothing out — and repairing it belongs to whoever produced it. A save that
 * arrives that way is corrected on load instead.
 */
function ensureFieldCreature(
  state: GameState,
  map: WorldMap,
  occupancy: Occupancy,
  player: Entity,
  events: CombatEvent[],
): void {
  const chosen = state.activeCompanionIds
    .filter((id) => state.companions.some((companion) => companion.id === id))
    .slice(0, MAX_ACTIVE_COMPANIONS);
  const wanted = new Set(chosen.map((id) => `companion:${id}`));
  const present = new Set(
    state.entities.filter((entity) => entity.kind === "companion").map((entity) => entity.id),
  );

  const sameRoster = chosen.length === state.activeCompanionIds.length
    && chosen.every((id, index) => id === state.activeCompanionIds[index]);
  const sameField = present.size === wanted.size && [...wanted].every((id) => present.has(id));
  if (sameRoster && sameField) return;

  state.activeCompanionIds = chosen;
  for (const entity of state.entities) {
    if (entity.kind === "companion" && !wanted.has(entity.id)) occupancy.remove(entity);
  }
  state.entities = state.entities.filter(
    (entity) => entity.kind !== "companion" || wanted.has(entity.id),
  );

  for (const id of chosen) {
    if (present.has(`companion:${id}`)) continue;
    const companion = state.companions.find((candidate) => candidate.id === id);
    if (!companion) continue;
    // Beside the Porter if there is room, and on their tile if there is not:
    // a creature standing awkwardly is recoverable, a missing one is not.
    const spot = nearestWalkable(
      { x: player.x, y: player.y },
      (point) => isFree(map, occupancy, point, `companion:${id}`),
      5,
    ) ?? { x: player.x, y: player.y };
    const entity = makeCompanion(companion, spot, 0);
    state.entities = [...state.entities, entity];
    occupancy.add(entity.id, entity);
    events.push({ type: "say", tick: state.tick, text: `${companion.name} steps forward.`, targetId: entity.id });
  }
}

function respawnMonsters(state: GameState, map: WorldMap, occupancy: Occupancy): CombatEvent[] {
  const events: CombatEvent[] = [];
  const rng = state;
  state.spawns = state.spawns.map((spawn) => {
    const alive = state.entities.filter(
      (entity) => entity.kind === "monster" && entity.spawnId === spawn.id && isAlive(entity),
    ).length;
    if (alive >= spawn.maxAlive || state.tick < spawn.nextSpawnTick) return spawn;

    const templateId = spawn.monsterIds[Math.floor(nextFloat(rng) * spawn.monsterIds.length) % spawn.monsterIds.length];
    const template = monsterTemplate(templateId);
    // Place inside the spawn radius, never on top of something else.
    let placed: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 12 && !placed; attempt += 1) {
      const candidate = {
        x: spawn.x + Math.round((nextFloat(rng) * 2 - 1) * spawn.radius),
        y: spawn.y + Math.round((nextFloat(rng) * 2 - 1) * spawn.radius),
      };
      if (isFree(map, occupancy, candidate)) placed = candidate;
    }
    if (!placed) return spawn;

    // Ids must come from a monotonic counter. Deriving one from the entity
    // count and the tick collided with a live monster's id, which silently
    // teleported the existing creature across the map.
    state.nextEntitySerial += 1;
    const monster = makeMonster(template, placed, state.nextEntitySerial, spawn.id);
    state.entities = [...state.entities, monster];
    occupancy.add(monster.id, monster);
    events.push({ type: "spawn", tick: state.tick, targetId: monster.id, at: placed });
    return { ...spawn, nextSpawnTick: state.tick + spawn.respawnTicks };
  });
  return events;
}

/**
 * Turn this tick's events into console lines, in the plain second-person voice
 * the genre uses — "You lose 12 hitpoints due to an attack by a rat" — rather
 * than the marketing copy the old hunt log carried.
 */
function narrate(state: GameState, events: CombatEvent[]): void {
  const fresh = events.filter((event) => event.tick === state.tick);
  if (!fresh.length) return;
  const lines: Array<{ text: string; tone: "combat" | "loot" | "level" | "system" | "damage" }> = [];
  let takenThisTick = 0;
  let lootedGold = 0;
  let attacker = "";

  for (const event of fresh) {
    if (event.type === "hit" && event.targetId === PLAYER_ID) {
      takenThisTick += event.amount ?? 0;
      attacker = state.entities.find((entity) => entity.id === event.sourceId)?.name ?? attacker;
    } else if (event.type === "loot") {
      if (event.text === "gold coin") lootedGold += event.amount ?? 0;
      else lines.push({ text: `You found ${event.amount} ${event.text}.`, tone: "loot" });
    } else if (event.type === "refused") {
      lines.push({ text: `You cannot carry ${event.text}: your pack is full.`, tone: "system" });
    } else if (event.type === "levelUp") {
      lines.push({ text: `You advanced to level ${event.amount}.`, tone: "level" });
    } else if (event.type === "skillUp") {
      lines.push({ text: `You advanced to ${event.text} level ${event.amount}.`, tone: "level" });
    } else if (event.type === "say" && event.text) {
      lines.push({ text: event.text, tone: event.text.startsWith("You are dead") ? "damage" : "combat" });
    }
  }
  if (takenThisTick > 0) {
    const unit = takenThisTick === 1 ? "hitpoint" : "hitpoints";
    const by = attacker ? ` due to an attack by ${attacker}` : "";
    lines.push({ text: `You lose ${takenThisTick} ${unit}${by}.`, tone: "damage" });
  }
  if (lootedGold > 0) {
    lines.push({ text: `You found ${lootedGold} gold ${lootedGold === 1 ? "coin" : "coins"}.`, tone: "loot" });
  }
  if (!lines.length) return;

  const entries = lines.map((line, index) => ({
    id: state.nextLogId + index,
    tone: line.tone,
    text: line.text,
  }));
  state.nextLogId += entries.length;
  state.log = [...entries.reverse(), ...state.log].slice(0, 60);
}

/** Advance exactly one tick. Mutates `state` in place for speed; callers clone. */
function tickOnce(state: GameState, map: WorldMap, options: AdvanceOptions, events: CombatEvent[]): void {
  state.tick += 1;

  // One occupancy index per tick, mutated as creatures step. Rebuilding it per
  // lookup made every A* expansion scan the whole entity list.
  const occupancy = new Occupancy(state.entities);

  // Corpses rot away, keeping the ground readable during long sessions.
  if (state.ground.length) {
    state.ground = state.ground.filter((pile) => pile.decayTick > state.tick && (pile.items.length > 0 || pile.corpseOf));
  }

  for (const event of respawnMonsters(state, map, occupancy)) events.push(event);

  const player = playerOf(state);
  const overloaded = isOverloaded(state);

  // Cooldowns and non-interruptible states tick down first so an entity that
  // became free this tick can act immediately.
  for (const entity of state.entities) {
    if (entity.stateTicks > 0) entity.stateTicks -= 1;
    if (entity.moveCooldown > 0) entity.moveCooldown -= 1;
    if (entity.attackCooldown > 0) entity.attackCooldown -= 1;
    if (entity.state === "dead" && entity.stateTicks <= 0 && entity.kind === "monster") continue;
    if (entity.stateTicks <= 0 && entity.state !== "dead" && entity.state !== "idle" && entity.state !== "walking") {
      entity.state = "idle";
    }
  }

  // A fallen companion recovers beside the Porter rather than being lost for
  // good: they are the collection, not consumables.
  for (const entity of state.entities) {
    if (entity.kind !== "companion" || entity.state !== "dead" || entity.stateTicks > 0) continue;
    const spot = nearestWalkable({ x: player.x, y: player.y }, (point) => isFree(map, occupancy, point, entity.id), 4);
    if (!spot) continue;
    entity.hp = Math.max(1, Math.round(entity.maxHp * 0.5));
    entity.state = "idle";
    entity.targetId = null;
    entity.path = [];
    entity.x = spot.x;
    entity.y = spot.y;
    events.push({ type: "say", tick: state.tick, text: `${entity.name} recovers and rejoins you.`, targetId: entity.id });
  }

  // Whatever else happened, the Porter is not left standing alone.
  ensureFieldCreature(state, map, occupancy, player, events);

  // Bodies become corpses once the death clip has played.
  const fallen = state.entities.filter((entity) => entity.state === "dead" && entity.stateTicks <= 0);
  if (fallen.length) {
    for (const victim of fallen) {
      if (victim.kind === "monster") {
        occupancy.remove(victim);
        state.killSerial += 1;
        state.kills += 1;
        state.ground = [...state.ground, makeCorpse(state, victim, state.killSerial)];
        if (victim.templateId) {
          const template = monsterTemplate(victim.templateId);
          grantExp(state, template.exp, events);
          events.push({ type: "say", tick: state.tick, text: `You defeated ${template.name}.` });
        }
      }
    }
    state.entities = state.entities.filter((entity) => !(entity.kind === "monster" && entity.state === "dead" && entity.stateTicks <= 0));
  }

  if (!isAlive(player)) {
    if (player.stateTicks <= 0) {
      player.hp = player.maxHp;
      player.state = "idle";
      player.stateTicks = 0;
      player.targetId = null;
      player.path = [];
      player.x = map.start.x;
      player.y = map.start.y;
    }
    return;
  }

  // Keep derived player values in step with progression and equipment.
  const maxHp = playerMaxHp(state.progress);
  if (player.maxHp !== maxHp) {
    const ratio = player.hp / player.maxHp;
    player.maxHp = maxHp;
    player.hp = Math.max(1, Math.round(maxHp * ratio));
  }
  player.level = state.progress.level;

  if (player.hp / player.maxHp <= AUTO_POTION_AT) drinkPotion(state, player, events);

  // --- planning -----------------------------------------------------------
  // Hunting is the game, not a setting; only manual steering suspends it.
  if (!options.manualControl) planAutoHunt(state, map, occupancy, state.tick);

  let companionIndex = 0;
  for (const entity of state.entities) {
    if (!isAlive(entity)) continue;
    if (entity.kind === "monster") planMonster(state, map, occupancy, entity, state.tick);
    else if (entity.kind === "companion") planCompanion(state, map, occupancy, entity, companionIndex++, state.tick);
  }

  // --- execution ----------------------------------------------------------
  for (const entity of state.entities) {
    if (!isAlive(entity) || !canAct(entity)) continue;
    if (entity.kind === "npc") continue;

    const target = state.entities.find((candidate) => candidate.id === entity.targetId);
    const hostile =
      target &&
      isAlive(target) &&
      (entity.kind === "monster"
        ? target.kind === "player" || target.kind === "companion"
        : target.kind === "monster");

    if (hostile && distance(entity, target) <= 1) {
      entity.path = [];
      entity.direction = directionTowards(entity, target);
      // The Porter is a handler: they hold the target and take the blows, but
      // the killing is the creature's. Facing the enemy is as far as it goes.
      if (entity.kind === "player") continue;
      if (entity.attackCooldown > 0) continue;
      entity.state = "attacking";
      entity.stateTicks = ATTACK_WINDUP;
      entity.attackCooldown = attackCost(entity);

      const swing = rollSwing(state, attackPowerOf(state, entity), defensePowerOf(state, target));
      if (swing.outcome === "hit") {
        for (const event of applyDamage(target, swing.damage, entity.id, state.tick)) events.push(event);
        // Settle a lethal blow to the Porter here, at the moment it lands.
        // applyDamage has already flagged the entity dead, so a trailing
        // "hp <= 0 && state !== dead" check can never fire.
        if (target.kind === "player" && target.state === "dead") {
          target.stateTicks = DEATH_RECOVERY_TICKS;
          killPlayer(state, target, events);
        }
        // Directing a creature to land a blow is what advances handling.
        if (entity.kind === "companion" && trainSkill(state, "melee")) {
          events.push({ type: "skillUp", tick: state.tick, text: "handling", amount: state.progress.skills.melee });
        }
      } else {
        events.push({
          type: swing.outcome === "block" ? "block" : "miss",
          tick: state.tick,
          sourceId: entity.id,
          targetId: target.id,
          at: { x: target.x, y: target.y },
        });
      }
      // Being attacked trains defence, whether or not the blow lands.
      if (target.kind === "player") {
        if (trainSkill(state, "shielding")) {
          events.push({ type: "skillUp", tick: state.tick, text: "shielding", amount: state.progress.skills.shielding });
        }
        if (swing.outcome === "hit" && trainSkill(state, "vitality")) {
          events.push({ type: "skillUp", tick: state.tick, text: "vitality", amount: state.progress.skills.vitality });
        }
      }
      continue;
    }

    // Step along the planned route.
    if (entity.moveCooldown > 0 || entity.path.length === 0) {
      if (entity.path.length === 0 && entity.state === "walking") entity.state = "idle";
      continue;
    }
    const next = entity.path[0];
    if (!isFree(map, occupancy, next, entity.id)) {
      // Something moved into the way; drop the stale route and re-plan next tick.
      entity.path = [];
      continue;
    }
    entity.path = entity.path.slice(1);
    entity.direction = directionTowards(entity, next);
    occupancy.move(entity.id, entity, next);
    entity.x = next.x;
    entity.y = next.y;
    entity.state = "walking";
    entity.moveCooldown = stepCost(entity, overloaded);
  }

  // Loot underfoot is always picked up: walking over a corpse and leaving the
  // gold behind was never a decision anyone wanted to make.
  //
  // Every body in reach, not the first one found. Taking only the first was a
  // deadlock waiting for a full pack: standing between a corpse holding armour
  // too heavy to lift and one holding loose coins, the Porter would try the
  // armour, fail, and never reach the coins — and since auto-hunt holds them
  // still while there is loot they can take, they held there for good.
  const reachable = state.ground.filter(
    (candidate) => distance(player, candidate) <= 1 && candidate.items.length > 0,
  );
  if (reachable.length) {
    const left = new Map(reachable.map((pile) => [pile.id, pickUp(state, pile.items, events)]));
    state.ground = state.ground.map((candidate) =>
      left.has(candidate.id) ? { ...candidate, items: left.get(candidate.id)! } : candidate,
    );
  }

  state.playSeconds += TICK_MS / 1000;
  narrate(state, events);
}

/**
 * Advance the world by `ticks`. Returns a new state; the input is not mutated.
 */
export function advance(state: GameState, map: WorldMap, ticks: number, options: AdvanceOptions = {}): { state: GameState; events: CombatEvent[] } {
  const next: GameState = {
    ...state,
    entities: state.entities.map((entity) => ({ ...entity, path: [...entity.path] })),
    ground: state.ground.map((pile) => ({ ...pile, items: [...pile.items] })),
    spawns: state.spawns.map((spawn) => ({ ...spawn })),
    progress: { ...state.progress, skills: { ...state.progress.skills }, skillTries: { ...state.progress.skillTries } },
    inventory: { ...state.inventory, stacks: [...state.inventory.stacks] },
    companions: state.companions.map((companion) => ({ ...companion })),
    log: [...state.log],
  };
  const events: CombatEvent[] = [];
  const collect = options.collectEvents !== false;
  for (let index = 0; index < ticks; index += 1) {
    tickOnce(next, map, options, collect ? events : []);
  }
  return { state: next, events };
}

export { createInitialState, playerOf, PLAYER_ID, addLog, pileAt, samePoint };
