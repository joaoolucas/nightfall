import assert from "node:assert/strict";
import test from "node:test";

import type { GameState, GroundPile } from "../core/types";
import { capacity, inventoryWeight, itemDef } from "../world/items";
import {
  canReach,
  dropStack,
  equipStack,
  putIntoPile,
  takeAllFromPile,
  takeFromPile,
  unequipSlot,
  useStack,
} from "./actions";
import { createInitialState, playerAttack, playerDefense, playerOf } from "./state";

function baseState(): GameState {
  const state = createInitialState("ember", 0);
  return { ...state, settings: { ...state.settings, autoHunt: false, autoLoot: false } };
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
  const plate = itemDef("warden-plate");
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
          defId: "warden-plate",
          count: 1,
        })),
      ],
    },
  };
  state = withPile(state, [{ instanceId: "heavy", defId: "warden-plate", count: 1 }]);

  const next = takeFromPile(state, "corpse:1", "heavy");
  assert.equal(next.ground[0].items.length, 1, "the item must stay on the ground");
  assert.ok(next.log[0].text.includes("cannot carry"), `the refusal should be explained, got "${next.log[0].text}"`);
  assert.ok(inventoryWeight(next.inventory) <= capacity(next.progress.level));
});

test("equipping raises attack and unequipping returns the item to the pack", () => {
  const state = baseState();
  const blade = state.inventory.stacks.find((stack) => stack.defId === "worn-blade");
  assert.ok(blade, "the starting kit should include a blade");

  const before = playerAttack(state);
  const equipped = equipStack(state, blade!.instanceId);
  assert.ok(equipped.inventory.equipment.weapon, "the weapon slot should be filled");
  assert.ok(playerAttack(equipped) > before, "wearing a weapon must raise attack");
  assert.ok(
    !equipped.inventory.stacks.some((stack) => stack.instanceId === blade!.instanceId),
    "the blade should have left the backpack",
  );

  const removed = unequipSlot(equipped, "weapon");
  assert.equal(removed.inventory.equipment.weapon, undefined);
  assert.equal(playerAttack(removed), before, "attack should return to its base value");
  assert.ok(removed.inventory.stacks.some((stack) => stack.defId === "worn-blade"));
});

test("swapping a worn item returns the displaced one rather than destroying it", () => {
  let state = baseState();
  state = {
    ...state,
    inventory: {
      ...state.inventory,
      stacks: [...state.inventory.stacks, { instanceId: "sabre", defId: "caravan-sabre", count: 1 }],
    },
  };
  const blade = state.inventory.stacks.find((stack) => stack.defId === "worn-blade")!;

  const worn = equipStack(state, blade.instanceId);
  const swapped = equipStack(worn, "sabre");

  assert.equal(swapped.inventory.equipment.weapon?.defId, "caravan-sabre");
  assert.ok(
    swapped.inventory.stacks.some((stack) => stack.defId === "worn-blade"),
    "the previous weapon must come back to the pack",
  );
});

test("armour raises defense", () => {
  const state = baseState();
  const cloak = state.inventory.stacks.find((stack) => stack.defId === "travel-cloak")!;
  assert.ok(playerDefense(equipStack(state, cloak.instanceId)) > playerDefense(state));
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
  const state = baseState();
  const cloak = state.inventory.stacks.find((stack) => stack.defId === "travel-cloak")!;
  const player = playerOf(state);

  const dropped = dropStack(state, cloak.instanceId);
  const pile = dropped.ground.find((candidate) => candidate.x === player.x && candidate.y === player.y);
  assert.ok(pile, "a pile should appear underfoot");
  assert.equal(pile!.items[0].defId, "travel-cloak");
  assert.ok(!dropped.inventory.stacks.some((stack) => stack.instanceId === cloak.instanceId));

  const retrieved = takeFromPile(dropped, pile!.id, pile!.items[0].instanceId);
  assert.ok(retrieved.inventory.stacks.some((stack) => stack.defId === "travel-cloak"));
});

test("an item can be stored back into a corpse", () => {
  const state = withPile(baseState(), []);
  const cloak = state.inventory.stacks.find((stack) => stack.defId === "travel-cloak")!;
  const next = putIntoPile(state, cloak.instanceId, "corpse:1");

  assert.equal(next.ground[0].items[0].defId, "travel-cloak");
  assert.ok(!next.inventory.stacks.some((stack) => stack.instanceId === cloak.instanceId));
});

test("inventory actions never mutate the state they are given", () => {
  const state = withPile(baseState(), [{ instanceId: "a", defId: "ash-carapace", count: 1 }]);
  const snapshot = JSON.stringify(state);
  const blade = state.inventory.stacks.find((stack) => stack.defId === "worn-blade")!;

  takeFromPile(state, "corpse:1", "a");
  equipStack(state, blade.instanceId);
  dropStack(state, blade.instanceId);
  useStack(state, blade.instanceId);

  assert.equal(JSON.stringify(state), snapshot, "actions must be pure over their input");
});
