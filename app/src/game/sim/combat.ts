import { nextInt, type Rng } from "../core/rng";
import type { CombatEvent, Entity } from "../core/types";

/**
 * Discrete hit resolution.
 *
 * This is the change that turns the game from an incremental into an RPG: a
 * swing is a single event on a cooldown that produces a number, not a rate
 * subtracted continuously from a pool. Every hit is a `CombatEvent`, which is
 * what the renderer floats over the target and what the console narrates.
 */

/** Ticks a swing occupies. The sprite plays its attack clip over this window. */
export const ATTACK_WINDUP = 4;
/** Ticks an entity flinches after taking damage. */
export const HURT_TICKS = 3;
/** Ticks a death animation plays before the body becomes a corpse. */
export const DEATH_TICKS = 6;

export interface Swing {
  damage: number;
  outcome: "hit" | "block" | "miss";
}

/**
 * Roll one swing.
 *
 * Damage spreads from 20% to 100% of the attacker's power, then armour absorbs
 * a random slice up to the defender's defense. A fully absorbed hit reads as a
 * block, which is why heavy armour feels different from simply more health.
 *
 * The low end of the spread matters: with a floor at 40% of power, armour could
 * only ever fully absorb when defense exceeded almost half the attacker's
 * strength, so blocks were vanishingly rare and armour was just a flat damage
 * discount. Starting at 20% gives light hits something to be stopped by.
 */
export function rollSwing(rng: Rng, attack: number, defense: number): Swing {
  if (attack <= 0) return { damage: 0, outcome: "miss" };
  const power = Math.max(1, Math.round(attack));
  const raw = nextInt(rng, Math.max(1, Math.floor(power * 0.2)), power);
  const absorbed = nextInt(rng, 0, Math.max(0, Math.round(defense)));
  const damage = raw - absorbed;
  if (damage <= 0) return { damage: 0, outcome: "block" };
  return { damage, outcome: "hit" };
}

/** Apply damage and return the events it produced. */
export function applyDamage(
  target: Entity,
  amount: number,
  sourceId: string,
  tick: number,
): CombatEvent[] {
  const events: CombatEvent[] = [];
  target.hp = Math.max(0, target.hp - amount);
  events.push({
    type: "hit",
    tick,
    sourceId,
    targetId: target.id,
    amount,
    at: { x: target.x, y: target.y },
  });
  if (target.hp <= 0) {
    target.state = "dead";
    target.stateTicks = DEATH_TICKS;
    target.path = [];
    target.targetId = null;
    events.push({ type: "death", tick, sourceId, targetId: target.id, at: { x: target.x, y: target.y } });
  } else if (target.state !== "attacking") {
    target.state = "hurt";
    target.stateTicks = HURT_TICKS;
  }
  return events;
}

export function canAct(entity: Entity): boolean {
  return entity.state !== "dead" && entity.stateTicks <= 0;
}

export function isAlive(entity: Entity): boolean {
  return entity.state !== "dead" && entity.hp > 0;
}
