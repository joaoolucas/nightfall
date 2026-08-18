import { distance } from "../core/grid";
import { nearestWalkable } from "../core/pathfind";
import { Occupancy, createWorldMap, isFree } from "../world/map";
import type { GameState, GroundPile, ItemStack } from "../core/types";
import { addToStacks, capacity, inventoryWeight, itemDef, removeFromStacks } from "../world/items";
import { PLAYER_ID, makeCompanion, playerOf } from "./state";

/**
 * Player-driven inventory actions.
 *
 * Every one is a pure transition over the world state, like the tick reducer,
 * so looting and equipping stay replayable and could later be checkpointed
 * alongside combat rather than living only in the client.
 */

/** How far the Porter can reach to open or take from a pile. */
export const REACH = 1;

function log(state: GameState, text: string, tone: "loot" | "system"): GameState {
  return {
    ...state,
    log: [{ id: state.nextLogId, tone, text }, ...state.log].slice(0, 60),
    nextLogId: state.nextLogId + 1,
  };
}

export function pileById(state: GameState, pileId: string): GroundPile | undefined {
  return state.ground.find((pile) => pile.id === pileId);
}

/** A pile is reachable when it is on or beside the Porter's tile. */
export function canReach(state: GameState, pile: GroundPile): boolean {
  return distance(playerOf(state), pile) <= REACH;
}

function remainingCapacity(state: GameState): number {
  return capacity(state.progress.level) - inventoryWeight(state.inventory);
}

/**
 * Move one stack from a ground pile into the backpack.
 *
 * Gold and shards go straight to their counters; everything else occupies real
 * weight, and a Porter already at capacity simply cannot lift it.
 */
export function takeFromPile(state: GameState, pileId: string, instanceId: string, count?: number): GameState {
  const pile = pileById(state, pileId);
  if (!pile || !canReach(state, pile)) return state;
  const stack = pile.items.find((candidate) => candidate.instanceId === instanceId);
  if (!stack) return state;

  const taken = Math.max(1, Math.min(count ?? stack.count, stack.count));
  const def = itemDef(stack.defId);

  if (def.id === "gold" || def.id === "shard") {
    const next: GameState = {
      ...state,
      inventory: {
        ...state.inventory,
        gold: state.inventory.gold + (def.id === "gold" ? taken : 0),
        shards: state.inventory.shards + (def.id === "shard" ? taken : 0),
      },
      ground: state.ground.map((candidate) =>
        candidate.id === pileId ? { ...candidate, items: removeFromStacks(candidate.items, instanceId, taken) } : candidate,
      ),
    };
    return next;
  }

  if (def.weight * taken > remainingCapacity(state)) {
    return log(state, `You cannot carry ${def.name}: your pack is full.`, "system");
  }

  const moved: ItemStack = { ...stack, count: taken };
  let next: GameState = {
    ...state,
    inventory: { ...state.inventory, stacks: addToStacks(state.inventory.stacks, moved) },
    ground: state.ground.map((candidate) =>
      candidate.id === pileId ? { ...candidate, items: removeFromStacks(candidate.items, instanceId, taken) } : candidate,
    ),
  };
  next = log(next, `You take ${taken > 1 ? `${taken} ` : ""}${def.name}.`, "loot");
  return next;
}

/** Take everything reachable in one go, stopping at capacity. */
export function takeAllFromPile(state: GameState, pileId: string): GameState {
  const pile = pileById(state, pileId);
  if (!pile) return state;
  let next = state;
  for (const stack of [...pile.items]) {
    next = takeFromPile(next, pileId, stack.instanceId);
  }
  return next;
}

/** Put a carried stack down on the Porter's own tile. */
export function dropStack(state: GameState, instanceId: string, count?: number): GameState {
  const stack = state.inventory.stacks.find((candidate) => candidate.instanceId === instanceId);
  if (!stack) return state;
  const player = playerOf(state);
  const dropped = Math.max(1, Math.min(count ?? stack.count, stack.count));

  const existing = state.ground.find((pile) => pile.x === player.x && pile.y === player.y);
  const moved: ItemStack = { ...stack, instanceId: `drop:${state.nextInstance}`, count: dropped };
  const ground = existing
    ? state.ground.map((pile) => (pile === existing ? { ...pile, items: addToStacks(pile.items, moved) } : pile))
    : [
        ...state.ground,
        {
          id: `pile:${state.nextInstance}`,
          x: player.x,
          y: player.y,
          items: [moved],
          decayTick: state.tick + 6000,
        } satisfies GroundPile,
      ];

  return {
    ...state,
    nextInstance: state.nextInstance + 1,
    inventory: { ...state.inventory, stacks: removeFromStacks(state.inventory.stacks, instanceId, dropped) },
    ground,
  };
}

/** Drink a carried potion. Anything else is loot, and doing nothing is correct. */
export function useStack(state: GameState, instanceId: string): GameState {
  const stack = state.inventory.stacks.find((candidate) => candidate.instanceId === instanceId);
  if (!stack) return state;
  const def = itemDef(stack.defId);
  if (!def.heal) return state;

  const player = playerOf(state);
  if (player.hp >= player.maxHp) return log(state, "You are already at full health.", "system");

  const healed = Math.min(player.maxHp - player.hp, Math.round(player.maxHp * def.heal));
  return log(
    {
      ...state,
      entities: state.entities.map((entity) =>
        entity.id === PLAYER_ID ? { ...entity, hp: entity.hp + healed } : entity,
      ),
      inventory: { ...state.inventory, stacks: removeFromStacks(state.inventory.stacks, instanceId, 1) },
    },
    `You drink ${def.name} and recover ${healed} hitpoints.`,
    "loot",
  );
}

/** Move a carried stack into a reachable pile — the inverse of looting. */
export function putIntoPile(state: GameState, instanceId: string, pileId: string): GameState {
  const pile = pileById(state, pileId);
  if (!pile || !canReach(state, pile)) return state;
  const stack = state.inventory.stacks.find((candidate) => candidate.instanceId === instanceId);
  if (!stack) return state;
  return {
    ...state,
    inventory: { ...state.inventory, stacks: removeFromStacks(state.inventory.stacks, instanceId) },
    ground: state.ground.map((candidate) =>
      candidate.id === pileId ? { ...candidate, items: addToStacks(candidate.items, stack) } : candidate,
    ),
  };
}

/**
 * Put a different creature in the field.
 *
 * Only one is out at a time, so this is a swap, not an addition: the one on the
 * ground is recalled and the chosen one takes its place beside the Porter. A
 * creature recovering from defeat cannot be sent back out immediately.
 */
export function summonCompanion(state: GameState, companionId: string): GameState {
  const companion = state.companions.find((candidate) => candidate.id === companionId);
  if (!companion) return state;
  if (state.activeCompanionIds.includes(companionId)) return state;

  const player = playerOf(state);
  const spot = nearestWalkable(
    { x: player.x, y: player.y },
    (point) => isFree(createWorldMap(state.zoneId), new Occupancy(state.entities), point, `companion:${companionId}`),
    4,
  );
  if (!spot) return state;

  // Recall whoever is out, keeping their remaining health for when they return.
  const entities = state.entities.filter((entity) => entity.kind !== "companion");
  const summoned = makeCompanion(companion, spot, 0);

  return log(
    {
      ...state,
      activeCompanionIds: [companionId],
      entities: [...entities, summoned],
    },
    `${companion.name} steps forward.`,
    "system",
  );
}

/** Choose which potion the Porter reaches for when hurt. */
export function choosePotion(state: GameState, defId: string | null): GameState {
  return { ...state, settings: { ...state.settings, potionId: defId } };
}
