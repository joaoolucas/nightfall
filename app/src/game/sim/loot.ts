import { chance, derive, nextInt } from "../core/rng";
import type { Entity, GameState, GroundPile, ItemStack } from "../core/types";
import { monsterTemplate } from "../world/monsters";

/**
 * Corpse and loot generation.
 *
 * The draw is seeded from `(state.seed, killSerial)` rather than the running
 * stream, so a given kill always yields the same drop. That is what makes the
 * offline catch-up agree with live play, and it is the precondition for ever
 * committing a drop on chain and letting anyone recompute it.
 */

/** Ticks a corpse and its contents remain on the ground. */
export const CORPSE_DECAY_TICKS = 1200;

export function rollLoot(seed: number, killSerial: number, templateId: string): ItemStack[] {
  const template = monsterTemplate(templateId);
  const rng = derive(seed, killSerial);
  const stacks: ItemStack[] = [];
  let index = 0;
  for (const entry of template.loot) {
    if (!chance(rng, entry.chance)) continue;
    const count = nextInt(rng, entry.min, entry.max);
    if (count <= 0) continue;
    stacks.push({
      instanceId: `loot:${killSerial}:${index}`,
      defId: entry.defId,
      count,
    });
    index += 1;
  }
  return stacks;
}

export function makeCorpse(state: GameState, victim: Entity, killSerial: number): GroundPile {
  const items = victim.templateId ? rollLoot(state.seed, killSerial, victim.templateId) : [];
  return {
    id: `corpse:${killSerial}`,
    x: victim.x,
    y: victim.y,
    items,
    corpseOf: victim.name,
    corpseSpecies: victim.species,
    corpseStage: victim.stage,
    decayTick: state.tick + CORPSE_DECAY_TICKS,
  };
}

export function pileAt(state: GameState, x: number, y: number): GroundPile | undefined {
  return state.ground.find((pile) => pile.x === x && pile.y === y);
}
