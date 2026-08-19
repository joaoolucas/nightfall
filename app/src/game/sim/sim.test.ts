import assert from "node:assert/strict";
import test from "node:test";

import { distance } from "../core/grid";
import { findPath, nearestWalkable } from "../core/pathfind";
import { derive, nextFloat } from "../core/rng";
import type { GameState } from "../core/types";
import { Occupancy, createWorldMap, isWalkable, walkableFor } from "../world/map";
import { monsterTemplate, monstersOfZone, wardenOfZone } from "../world/monsters";
import { capacity, inventoryWeight, itemDef } from "../world/items";
import { rollLoot } from "./loot";
import { rollSwing } from "./combat";
import { summonCompanion } from "./actions";
import { MAX_ACTIVE_COMPANIONS, createInitialState, makeMonster, playerOf, travelTo, PLAYER_ID } from "./state";
import { advance } from "./tick";

const MAP = createWorldMap("ember");

/**
 * Hunting is no longer a setting, so a test that wants to drive the Porter
 * itself passes { manualControl: true } to advance instead.
 */
function freshState(): GameState {
  return createInitialState("ember", 0);
}

/**
 * The Porter alone, with no companions and no spawns.
 *
 * Tests about one-on-one behaviour need this: with a full caravan the party
 * kills an ordinary monster in about ten ticks, which is correct in play but
 * hides whatever the test is actually measuring.
 */
function soloState(): GameState {
  const state = freshState();
  return {
    ...state,
    entities: state.entities.filter((entity) => entity.kind === "player"),
    activeCompanionIds: [],
    spawns: [],
  };
}

/**
 * A spawn id that is deliberately not in `state.spawns`, so the monster has no
 * home tile and is therefore never leashed away mid-test. Using a real spawn id
 * here would place the monster far from its den and the leash rule — correctly —
 * would send it walking home instead of fighting.
 */
const UNLEASHED = "test-spawn";

/** Drop a monster next to the player and return the updated state. */
function withMonsterBeside(state: GameState, templateId: string, offset = { x: 1, y: 0 }): GameState {
  const player = playerOf(state);
  const template = monsterTemplate(templateId);
  const at = { x: player.x + offset.x, y: player.y + offset.y };
  assert.ok(isWalkable(MAP, at), "test fixture must place the monster on walkable ground");
  return { ...state, entities: [...state.entities, makeMonster(template, at, 1, UNLEASHED)] };
}

test("pathfinding returns a shortest 8-directional route without cutting corners", () => {
  const start = nearestWalkable({ x: 26, y: 21 }, (p) => isWalkable(MAP, p));
  const goal = nearestWalkable({ x: 30, y: 25 }, (p) => isWalkable(MAP, p));
  assert.ok(start && goal);
  const path = findPath(start, goal, { walkable: (p) => isWalkable(MAP, p) });
  assert.ok(path.length > 0, "a route should exist between two open tiles");
  // Every step is one tile away from the previous one.
  let cursor = start;
  for (const step of path) {
    assert.equal(distance(cursor, step), 1, "steps must be adjacent");
    assert.ok(isWalkable(MAP, step), "steps must be walkable");
    cursor = step;
  }
  assert.deepEqual(cursor, goal);
  // Chebyshev distance is the floor on step count for 8-directional movement.
  assert.ok(path.length >= distance(start, goal));
});

test("an unreachable goal fails fast instead of burning the node budget", () => {
  const start = { x: MAP.start.x, y: MAP.start.y };
  const path = findPath(start, { x: 0, y: 0 }, { walkable: (p) => isWalkable(MAP, p) });
  assert.equal(path.length, 0, "map edges are never walkable, so there is no route");
});

test("a swing is discrete: it either lands a number, is blocked, or misses", () => {
  const rng = { seed: 12345 };
  const outcomes = new Set<string>();
  for (let index = 0; index < 400; index += 1) {
    const swing = rollSwing(rng, 30, 12);
    outcomes.add(swing.outcome);
    assert.ok(swing.damage >= 0);
    assert.ok(swing.damage <= 30, "damage never exceeds the attacker's power");
    if (swing.outcome === "hit") assert.ok(swing.damage > 0);
    else assert.equal(swing.damage, 0);
  }
  assert.ok(outcomes.has("hit"), "hits must be possible");
  assert.ok(outcomes.has("block"), "armour must be able to absorb a hit entirely");
});

test("heavy armour blocks more often than light armour", () => {
  const count = (defense: number) => {
    const rng = { seed: 99 };
    let blocked = 0;
    for (let index = 0; index < 600; index += 1) if (rollSwing(rng, 20, defense).outcome === "block") blocked += 1;
    return blocked;
  };
  assert.ok(count(18) > count(3), "defense should measurably reduce damage taken");
});

test("the Porter never swings — only the creature does", () => {
  const state = withMonsterBeside(freshState(), "coalback");
  const monsterId = state.entities.at(-1)!.id;
  playerOf(state).targetId = monsterId;

  const result = advance(state, MAP, 120, { manualControl: true });
  const fromPorter = result.events.filter(
    (event) => event.sourceId === PLAYER_ID && (event.type === "hit" || event.type === "block" || event.type === "miss"),
  );
  assert.equal(fromPorter.length, 0, "the Porter is a handler and must land no blows at all");

  const fromCreature = result.events.filter(
    (event) => event.sourceId?.startsWith("companion:") && (event.type === "hit" || event.type === "block" || event.type === "miss"),
  );
  assert.ok(fromCreature.length > 0, "the creature must be the one fighting");
});

test("a creature trades blows on a cooldown rather than continuously", () => {
  // Put the creature next to the monster so the very first tick is a swing.
  const withMonster = withMonsterBeside(freshState(), "coalback");
  const monster = withMonster.entities.at(-1)!;
  const state = {
    ...withMonster,
    entities: withMonster.entities.map((entity) =>
      entity.kind === "companion"
        ? { ...entity, x: monster.x, y: monster.y + 1, targetId: monster.id, attackCooldown: 0 }
        : entity,
    ),
  };

  // A swing resolves as exactly one of hit, block or miss, so count all three.
  const swings = (events: ReturnType<typeof advance>["events"]) =>
    events.filter(
      (event) =>
        event.sourceId?.startsWith("companion:") &&
        (event.type === "hit" || event.type === "block" || event.type === "miss"),
    ).length;

  const first = advance(state, MAP, 1, { manualControl: true });
  assert.equal(swings(first.events), 1, "the first tick lands exactly one swing");

  // The next several ticks must be silent: the swing is on cooldown.
  const during = advance(first.state, MAP, 8, { manualControl: true });
  assert.equal(swings(during.events), 0, "nothing may resolve while the attack is cooling down");

  const later = advance(during.state, MAP, 24, { manualControl: true });
  assert.ok(swings(later.events) >= 1, "the swing must come back up");
});

test("only one creature is ever in the field", () => {
  const state = createInitialState("ember", 0);
  const inField = state.entities.filter((entity) => entity.kind === "companion");
  assert.equal(inField.length, MAX_ACTIVE_COMPANIONS);
  assert.equal(state.activeCompanionIds.length, MAX_ACTIVE_COMPANIONS);
  assert.ok(state.companions.length > 1, "the rest of the roster stays available to swap in");

  // And it stays that way through play.
  const result = advance(state, MAP, 600);
  assert.equal(result.state.entities.filter((entity) => entity.kind === "companion").length, MAX_ACTIVE_COMPANIONS);
});

test("a monster with line of sight chases the player and one behind a wall does not", () => {
  const state = soloState();
  const player = playerOf(state);
  const template = monsterTemplate("ash-mite");
  const seen = { x: player.x + 4, y: player.y };
  assert.ok(isWalkable(MAP, seen));
  const chaser = makeMonster(template, seen, 7, UNLEASHED);
  const withSeen = { ...state, entities: [...state.entities, chaser] };

  const result = advance(withSeen, MAP, 30, { manualControl: true });
  // Track this monster by id: the zone repopulates itself, so "the first
  // monster in the list" is not necessarily the one placed above.
  const monster = result.state.entities.find((entity) => entity.id === chaser.id);
  assert.ok(monster, "the monster should still exist");
  const after = distance(playerOf(result.state), monster!);
  assert.ok(after <= 1, `the monster should have closed to melee range, got ${after}`);
  assert.equal(monster!.targetId, PLAYER_ID, "and it should have acquired the Porter");
});

test("a monster gives up and returns home once it is leashed away from its spawn", () => {
  const state = freshState();
  const spawn = state.spawns[1];
  const template = monsterTemplate("ash-mite");
  const far = nearestWalkable({ x: spawn.x, y: spawn.y }, (p) => isWalkable(MAP, p));
  assert.ok(far);
  const monster = makeMonster(template, far!, 3, spawn.id);
  // Place the player far outside the leash radius.
  const withBoth = { ...state, entities: state.entities.map((entity) => entity.id === PLAYER_ID ? { ...entity, x: MAP.start.x, y: MAP.start.y } : entity).concat(monster) };
  const result = advance(withBoth, MAP, 40, { manualControl: true });
  const after = result.state.entities.find((entity) => entity.kind === "monster");
  assert.ok(after);
  assert.equal(after!.targetId, null, "a distant player must not be acquired as a target");
});

test("killing a monster leaves a corpse whose loot is reproducible from the seed", () => {
  let state = withMonsterBeside(freshState(), "ash-mite");
  const monsterId = state.entities.at(-1)!.id;
  playerOf(state).targetId = monsterId;

  let result = advance(state, MAP, 1, { manualControl: true });
  for (let round = 0; round < 400 && result.state.entities.some((e) => e.id === monsterId); round += 1) {
    result = advance(result.state, MAP, 5, { manualControl: true });
  }
  assert.ok(!result.state.entities.some((entity) => entity.id === monsterId), "the monster should be dead and removed");
  assert.ok(result.state.kills >= 1, "the kill should be counted");

  // The same (seed, killSerial, template) always yields the same drop.
  const a = rollLoot(result.state.seed, result.state.killSerial, "ash-mite");
  const b = rollLoot(result.state.seed, result.state.killSerial, "ash-mite");
  assert.deepEqual(a, b, "loot must be reproducible for on-chain commit/reveal");
  const c = rollLoot(result.state.seed, result.state.killSerial + 1, "ash-mite");
  assert.notDeepEqual(a, c, "a different kill should roll a different drop");
});

test("every loot entry names a real item", () => {
  for (const template of [...monstersOfZone("ember"), wardenOfZone("sky")]) {
    for (const entry of template.loot) {
      assert.doesNotThrow(() => itemDef(entry.defId), `${template.id} drops unknown item ${entry.defId}`);
      assert.ok(entry.min <= entry.max, `${template.id}: ${entry.defId} has an inverted range`);
      assert.ok(entry.chance > 0 && entry.chance <= 1, `${template.id}: ${entry.defId} has an impossible chance`);
    }
  }
});

test("defeating monsters grants experience and can raise the Porter's level", () => {
  let state = freshState();
  state = { ...state, progress: { ...state.progress, exp: 0 } };
  let result = { state, events: [] as ReturnType<typeof advance>["events"] };

  for (let round = 0; round < 6; round += 1) {
    const withMonster = withMonsterBeside(result.state, "ash-mite");
    const monsterId = withMonster.entities.at(-1)!.id;
    playerOf(withMonster).targetId = monsterId;
    let step = { state: withMonster, events: [] as ReturnType<typeof advance>["events"] };
    for (let guard = 0; guard < 300 && step.state.entities.some((e) => e.id === monsterId); guard += 1) {
      step = advance(step.state, MAP, 5, { manualControl: true });
    }
    result = step;
  }
  assert.ok(result.state.kills >= 6, `expected 6 kills, got ${result.state.kills}`);
  assert.ok(result.state.progress.exp > 0 || result.state.progress.level > 1, "experience must accrue");
});

test("skills advance by use, not by purchase", () => {
  let state = withMonsterBeside(freshState(), "cinderpath-warden");
  const before = state.progress.skills.melee;
  playerOf(state).targetId = state.entities.at(-1)!.id;
  // The Warden survives long enough to swing at many times.
  const result = advance(state, MAP, 900, { manualControl: true });
  assert.ok(
    result.state.progress.skills.melee > before || result.state.progress.skillTries.melee > 0,
    "landing hits must make progress toward the next melee level",
  );
});

test("the simulation is deterministic across a JSON save round-trip", () => {
  const start = withMonsterBeside(freshState(), "coalback");
  playerOf(start).targetId = start.entities.at(-1)!.id;

  const direct = advance(start, MAP, 120, { manualControl: true }).state;
  const revived = JSON.parse(JSON.stringify(start)) as GameState;
  const replayed = advance(revived, MAP, 120, { manualControl: true }).state;

  assert.equal(replayed.seed, direct.seed, "the rng stream must land in the same place");
  assert.equal(replayed.kills, direct.kills);
  assert.equal(replayed.progress.exp, direct.progress.exp);
  assert.deepEqual(
    replayed.entities.map((entity) => [entity.id, entity.x, entity.y, entity.hp]),
    direct.entities.map((entity) => [entity.id, entity.x, entity.y, entity.hp]),
  );
});

test("advancing in one call matches advancing in several", () => {
  const start = withMonsterBeside(freshState(), "coalback");
  playerOf(start).targetId = start.entities.at(-1)!.id;

  const once = advance(start, MAP, 60, { manualControl: true }).state;
  let chunked = start;
  for (let index = 0; index < 6; index += 1) chunked = advance(chunked, MAP, 10, { manualControl: true }).state;

  assert.equal(chunked.tick, once.tick, "tick counts must agree");
  assert.equal(chunked.kills, once.kills);
  assert.deepEqual(
    chunked.entities.map((entity) => [entity.id, entity.hp]),
    once.entities.map((entity) => [entity.id, entity.hp]),
    "offline catch-up must produce the same world as live play",
  );
});

test("advance never mutates the state it was given", () => {
  const start = withMonsterBeside(freshState(), "coalback");
  playerOf(start).targetId = start.entities.at(-1)!.id;
  const snapshot = JSON.stringify(start);
  advance(start, MAP, 50, { manualControl: true });
  assert.equal(JSON.stringify(start), snapshot, "the reducer must be pure over its input");
});

test("a lethal blow costs the Porter experience and returns them to the outpost", () => {
  let state = soloState();
  state = {
    ...state,
    progress: { ...state.progress, level: 3, exp: 500 },
    // Carrying no potion is now how you decline to be healed.
    settings: { ...state.settings, potionId: null },
    inventory: { ...state.inventory, stacks: [] },
  };
  const player = playerOf(state);
  player.hp = 4;
  // A Warden beside a nearly dead Porter will finish the job.
  state = withMonsterBeside(state, "cinderpath-warden");

  let result = { state, events: [] as ReturnType<typeof advance>["events"] };
  for (let guard = 0; guard < 200 && result.state.deaths === 0; guard += 1) {
    result = advance(result.state, MAP, 5, { manualControl: true });
  }
  assert.equal(result.state.deaths, 1, "the Porter should have died");
  assert.ok(result.state.progress.exp < 500, "dying must cost experience");

  const recovered = advance(result.state, MAP, 60, { manualControl: true }).state;
  const back = playerOf(recovered);
  assert.ok(back.hp > 0, "the Porter should be revived");
  assert.deepEqual({ x: back.x, y: back.y }, { x: MAP.start.x, y: MAP.start.y }, "and returned to the outpost");
});

test("spawn points repopulate over time up to their cap", () => {
  const state = freshState();
  const result = advance(state, MAP, 400, { manualControl: true });
  const monsters = result.state.entities.filter((entity) => entity.kind === "monster");
  assert.ok(monsters.length > 0, "the zone must populate itself");
  for (const spawn of result.state.spawns) {
    const alive = monsters.filter((monster) => monster.spawnId === spawn.id).length;
    assert.ok(alive <= spawn.maxAlive, `spawn ${spawn.id} exceeded its cap with ${alive}`);
  }
});

test("auto-hunt drives the real combat model, not a separate formula", () => {
  const state = createInitialState("ember", 0);
  const result = advance(state, MAP, 2500);
  assert.ok(result.state.kills > 0, "auto-hunt should actually kill something");
  assert.ok(
    result.events.some((event) => event.type === "hit"),
    "and it should do so by landing ordinary discrete hits",
  );
});

test("derived rng streams are stable and independent", () => {
  const a = derive(1234, 7);
  const b = derive(1234, 7);
  assert.equal(nextFloat(a), nextFloat(b), "the same salt must give the same stream");
  const c = derive(1234, 8);
  assert.notEqual(nextFloat(a), nextFloat(c), "a different salt must diverge");
});

test("entity occupancy blocks pathing through another creature", () => {
  const state = withMonsterBeside(freshState(), "coalback", { x: 1, y: 0 });
  const player = playerOf(state);
  const blocker = state.entities.at(-1)!;

  // From the Porter's point of view, the monster's tile is solid but its own is not.
  const forPlayer = walkableFor(MAP, new Occupancy(state.entities), PLAYER_ID);
  assert.equal(forPlayer({ x: blocker.x, y: blocker.y }), false, "a living creature occupies its tile");
  assert.equal(forPlayer({ x: player.x, y: player.y }), true, "a mover never blocks itself");

  // From the monster's point of view, the Porter's tile is solid.
  const forMonster = walkableFor(MAP, new Occupancy(state.entities), blocker.id);
  assert.equal(forMonster({ x: player.x, y: player.y }), false, "the Porter blocks other creatures");
  assert.equal(forMonster({ x: blocker.x, y: blocker.y }), true);
});

test("auto-loot never carries the Porter past their capacity", () => {
  let state = freshState();
  const player = playerOf(state);
  const plate = itemDef("porter-mail");

  // Fill the pack to the brim, then drop a corpse underfoot holding gold and
  // one more plate than there is room for.
  const room = capacity(state.progress.level) - inventoryWeight(state.inventory);
  state = {
    ...state,
    inventory: {
      ...state.inventory,
      stacks: [
        ...state.inventory.stacks,
        ...Array.from({ length: Math.floor(room / plate.weight) }, (_, index) => ({
          instanceId: `plate-${index}`,
          defId: "porter-mail",
          count: 1,
        })),
      ],
    },
    ground: [
      ...state.ground,
      {
        id: "corpse:full",
        x: player.x,
        y: player.y,
        items: [
          { instanceId: "g", defId: "gold", count: 5 },
          { instanceId: "heavy", defId: "porter-mail", count: 1 },
        ],
        corpseOf: "ash mite",
        decayTick: 10_000,
      },
    ],
  };

  const gold = state.inventory.gold;
  const { state: after } = advance(state, MAP, 1, { manualControl: true });

  assert.equal(after.inventory.gold, gold + 5, "currency is always taken");
  const pile = after.ground.find((candidate) => candidate.id === "corpse:full")!;
  assert.equal(pile.items.length, 1, "what does not fit stays on the corpse");
  assert.equal(pile.items[0].defId, "porter-mail");
  assert.ok(
    inventoryWeight(after.inventory) <= capacity(after.progress.level),
    `auto-loot must respect capacity, carried ${inventoryWeight(after.inventory)}`,
  );
});

/**
 * The Porter stops dead without a creature.
 *
 * This is the shape of a real regression: with the roster naming a creature
 * that had no entity on the map, auto-hunt walked the Porter to three tiles
 * from a monster and held them there forever, because nothing could land the
 * kill that would release the target. The game looked broken in the only way
 * an idle game can be — it stopped being idle, and only moved when clicked.
 */
test("a roster naming a creature with no entity puts that creature back in the field", () => {
  const state = freshState();
  const stranded: GameState = {
    ...state,
    activeCompanionIds: ["ripple"],
    entities: state.entities.filter((entity) => entity.kind !== "companion"),
  };

  const { state: after } = advance(stranded, MAP, 1);
  const field = after.entities.filter((entity) => entity.kind === "companion");
  assert.equal(field.length, 1, "the named creature must be put back out");
  assert.equal(field[0].id, "companion:ripple", "and it must be the one the roster names");
  assert.ok(distance(playerOf(after), field[0]) <= 5, "beside the Porter, not across the map");
});

test("a creature in the field that the roster does not name is recalled", () => {
  const state = freshState();
  const mismatched: GameState = { ...state, activeCompanionIds: ["wisp"] };

  const { state: after } = advance(mismatched, MAP, 1);
  const field = after.entities.filter((entity) => entity.kind === "companion");
  assert.equal(field.length, MAX_ACTIVE_COMPANIONS);
  assert.equal(field[0].id, "companion:wisp");
});

test("the Porter keeps hunting on their own — the world moves without a click", () => {
  let state = freshState();
  const start = playerOf(state);
  let moved = 0;
  let previous = { x: start.x, y: start.y };

  // Long enough to cross the standoff, kill something and move on, but short
  // enough that a stalled Porter cannot fake it by drifting.
  for (let tick = 0; tick < 1200; tick += 1) {
    state = advance(state, MAP, 1).state;
    const player = playerOf(state);
    if (player.x !== previous.x || player.y !== previous.y) moved += 1;
    previous = { x: player.x, y: player.y };
  }

  assert.ok(moved > 60, `the Porter must hunt unattended, only stepped ${moved} times in 1200 ticks`);
  assert.ok(state.kills > 0, "and their creature must actually be killing things");
});

test("travelling to another zone brings the creature you had out with you", () => {
  const state = freshState();
  const withWisp = summonCompanion(state, "wisp");
  assert.deepEqual(withWisp.activeCompanionIds, ["wisp"]);

  const travelled = travelTo(withWisp, "creek", 0);
  const field = travelled.entities.filter((entity) => entity.kind === "companion");
  assert.equal(travelled.zoneId, "creek");
  assert.equal(field.length, 1, "the Porter does not arrive alone");
  assert.equal(field[0].id, "companion:wisp", "and not with a creature the roster never named");
  assert.equal(travelled.inventory.gold, state.inventory.gold, "the pack travels with them");
  assert.equal(travelled.progress.level, state.progress.level, "and so does who they are");
});

/**
 * The other way the hunt used to stop.
 *
 * Auto-hunt holds the Porter still while there is loot underfoot, which is
 * right until they are too loaded to lift it: auto-loot then refuses the items,
 * the items stay on the corpse, and the Porter waits beside a body they can
 * never empty. An overloaded Porter has to keep hunting, not stand guard over
 * loot they cannot take.
 */
test("an overloaded Porter does not stand guard over loot they cannot lift", () => {
  const state = freshState();
  const player = playerOf(state);
  const laden: GameState = {
    ...state,
    // Well past capacity, so nothing further can possibly be picked up.
    inventory: {
      ...state.inventory,
      stacks: [...state.inventory.stacks, { instanceId: "ballast", defId: "warden-plate", count: 20 }],
    },
    ground: [
      {
        id: "corpse:immovable",
        x: player.x,
        y: player.y,
        items: [{ instanceId: "heavy", defId: "porter-mail", count: 1 }],
        corpseOf: "ash mite",
        decayTick: 10_000,
      },
    ],
  };
  assert.ok(inventoryWeight(laden.inventory) > capacity(laden.progress.level), "the fixture must be overloaded");

  let after = laden;
  let moved = 0;
  let previous = { x: player.x, y: player.y };
  for (let tick = 0; tick < 400; tick += 1) {
    after = advance(after, MAP, 1).state;
    const now = playerOf(after);
    if (now.x !== previous.x || now.y !== previous.y) moved += 1;
    previous = { x: now.x, y: now.y };
  }

  assert.ok(moved > 0, "the Porter must walk away and keep hunting rather than wait for a body to rot");
  const pile = after.ground.find((candidate) => candidate.id === "corpse:immovable");
  if (pile) assert.equal(pile.items.length, 1, "and the loot they could not carry is still there");
});
