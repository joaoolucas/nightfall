import assert from "node:assert/strict";
import test from "node:test";

import type { GameState, GroundPile } from "../core/types";
import { capacity, inventoryWeight, itemDef } from "../world/items";
import {
  canReach,
  choosePotion,
  dropStack,
  putIntoPile,
  takeAllFromPile,
  takeFromPile,
  useStack,
} from "./actions";
import { createInitialState, playerOf } from "./state";

function baseState(): GameState {
  const state = createInitialState("ember", 0);
  return state;
}

/** The Porter starts with potions only, so tests that need loot bring their own. */
function withCarried(state: GameState, defId: string): GameState {
  return {
    ...state,
    inventory: {
      ...state.inventory,
      stacks: [...state.inventory.stacks, { instanceId: `carried:${defId}`, defId, count: 1 }],
    },
  };
}

/** A corpse on the Porter's own tile, so reach is never the thing under test. */
function withPile(state: GameState, items: GroundPile["items"]): GameState {
  const player = playerOf(state);
  const pile: GroundPile = {
    id: "corpse:1",
    x: player.x,
    y: player.y,
    items,
    corpseOf: "ash mite",
    decayTick: state.tick + 1000,
  };
  return { ...state, ground: [...state.ground, pile] };
}

test("a corpse is only reachable from an adjacent tile", () => {
  const state = withPile(baseState(), []);
  const pile = state.ground[0];
  assert.equal(canReach(state, pile), true);

  const player = playerOf(state);
  const walkedAway = {
    ...state,
    entities: state.entities.map((entity) =>
      entity.id === player.id ? { ...entity, x: player.x + 4 } : entity,
    ),
  };
  assert.equal(canReach(walkedAway, pile), false);
  // An unreachable corpse cannot be looted through the UI either.
  assert.equal(takeFromPile(walkedAway, pile.id, "a"), walkedAway, "taking from out of reach must be a no-op");
});

test("taking an item moves it from the corpse into the backpack", () => {
  const state = withPile(baseState(), [{ instanceId: "a", defId: "ash-carapace", count: 2 }]);
  const next = takeFromPile(state, "corpse:1", "a");

  assert.equal(next.ground[0].items.length, 0, "the corpse should be emptied");
  const carried = next.inventory.stacks.find((stack) => stack.defId === "ash-carapace");
  assert.ok(carried, "the item should be in the backpack");
  assert.equal(carried!.count, 2);
});

test("gold and shards go to their counters rather than occupying pack space", () => {
  const state = withPile(baseState(), [
    { instanceId: "g", defId: "gold", count: 40 },
    { instanceId: "s", defId: "shard", count: 3 },
  ]);
  const next = takeAllFromPile(state, "corpse:1");

  assert.equal(next.inventory.gold, state.inventory.gold + 40);
  assert.equal(next.inventory.shards, state.inventory.shards + 3);
  assert.ok(
    !next.inventory.stacks.some((stack) => stack.defId === "gold" || stack.defId === "shard"),
    "currency must not take a backpack slot",
  );
});

test("a full pack refuses the item instead of silently exceeding capacity", () => {
  let state = baseState();
  const plate = itemDef("porter-mail");
  const room = capacity(state.progress.level) - inventoryWeight(state.inventory);
  const count = Math.floor(room / plate.weight);
  state = {
    ...state,
    inventory: {
      ...state.inventory,
      stacks: [
        ...state.inventory.stacks,
        ...Array.from({ length: count }, (_, index) => ({
          instanceId: `plate-${index}`,
          defId: "porter-mail",
          count: 1,
        })),
      ],
    },
  };
  state = withPile(state, [{ instanceId: "heavy", defId: "porter-mail", count: 1 }]);

  const next = takeFromPile(state, "corpse:1", "heavy");
  assert.equal(next.ground[0].items.length, 1, "the item must stay on the ground");
  assert.ok(next.log[0].text.includes("cannot carry"), `the refusal should be explained, got "${next.log[0].text}"`);
  assert.ok(inventoryWeight(next.inventory) <= capacity(next.progress.level));
});

test("drinking a tonic heals the Porter and consumes exactly one", () => {
  let state = baseState();
  state = {
    ...state,
    entities: state.entities.map((entity) => (entity.kind === "player" ? { ...entity, hp: 20 } : entity)),
  };
  const tonic = state.inventory.stacks.find((stack) => stack.defId === "tonic")!;

  const next = useStack(state, tonic.instanceId);
  assert.ok(playerOf(next).hp > 20, "health should rise");
  assert.equal(next.inventory.stacks.find((stack) => stack.defId === "tonic")?.count, tonic.count - 1);
});

test("a tonic is not wasted at full health", () => {
  const state = baseState();
  const tonic = state.inventory.stacks.find((stack) => stack.defId === "tonic")!;
  const next = useStack(state, tonic.instanceId);
  assert.equal(
    next.inventory.stacks.find((stack) => stack.defId === "tonic")?.count,
    tonic.count,
    "no tonic should be consumed",
  );
});

test("dropping an item leaves it underfoot, and it can be taken back", () => {
  const state = withCarried(baseState(), "ash-carapace");
  const cloak = state.inventory.stacks.find((stack) => stack.defId === "ash-carapace")!;
  const player = playerOf(state);

  const dropped = dropStack(state, cloak.instanceId);
  const pile = dropped.ground.find((candidate) => candidate.x === player.x && candidate.y === player.y);
  assert.ok(pile, "a pile should appear underfoot");
  assert.equal(pile!.items[0].defId, "ash-carapace");
  assert.ok(!dropped.inventory.stacks.some((stack) => stack.instanceId === cloak.instanceId));

  const retrieved = takeFromPile(dropped, pile!.id, pile!.items[0].instanceId);
  assert.ok(retrieved.inventory.stacks.some((stack) => stack.defId === "ash-carapace"));
});

test("an item can be stored back into a corpse", () => {
  const state = withPile(withCarried(baseState(), "ash-carapace"), []);
  const cloak = state.inventory.stacks.find((stack) => stack.defId === "ash-carapace")!;
  const next = putIntoPile(state, cloak.instanceId, "corpse:1");

  assert.equal(next.ground[0].items[0].defId, "ash-carapace");
  assert.ok(!next.inventory.stacks.some((stack) => stack.instanceId === cloak.instanceId));
});

test("inventory actions never mutate the state they are given", () => {
  const state = withPile(baseState(), [{ instanceId: "a", defId: "ash-carapace", count: 1 }]);
  const snapshot = JSON.stringify(state);
  const tonic = state.inventory.stacks.find((stack) => stack.defId === "tonic")!;

  takeFromPile(state, "corpse:1", "a");
  dropStack(state, tonic.instanceId);
  useStack(state, tonic.instanceId);
  choosePotion(state, null);

  assert.equal(JSON.stringify(state), snapshot, "actions must be pure over their input");
});

test("the Porter drinks the potion they chose, and nothing when they choose none", () => {
  let state = baseState();
  state = {
    ...state,
    inventory: {
      ...state.inventory,
      stacks: [...state.inventory.stacks, { instanceId: "g1", defId: "greater-tonic", count: 2 }],
    },
  };

  assert.equal(state.settings.potionId, "tonic", "the starting kit picks the plain tonic");

  const switched = choosePotion(state, "greater-tonic");
  assert.equal(switched.settings.potionId, "greater-tonic");

  const declined = choosePotion(state, null);
  assert.equal(declined.settings.potionId, null, "choosing nothing is how you decline healing");
});

test("hunting and looting are not settings any more", () => {
  const state = createInitialState("ember", 0);
  assert.deepEqual(Object.keys(state.settings), ["potionId"], "the only choice left is which potion");
});
