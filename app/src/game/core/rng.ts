/**
 * Seeded PRNG.
 *
 * Every random decision in the simulation draws from this so a save can be
 * replayed exactly — the property that lets offline catch-up agree with live
 * play, and that a future on-chain commit/reveal of loot depends on.
 */

export interface Rng {
  seed: number;
}

/** Advance the stream and return a float in [0, 1). */
export function nextFloat(rng: Rng): number {
  rng.seed = (Math.imul(rng.seed, 1664525) + 1013904223) >>> 0;
  return rng.seed / 0x100000000;
}

/** Integer in [min, max], inclusive. */
export function nextInt(rng: Rng, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

export function chance(rng: Rng, probability: number): boolean {
  return nextFloat(rng) < probability;
}

export function pick<T>(rng: Rng, values: readonly T[]): T {
  return values[Math.min(values.length - 1, Math.floor(nextFloat(rng) * values.length))];
}

/**
 * A stream derived from a base seed and a label. Used to draw loot from
 * `(seed, killSerial)` without disturbing the main stream's ordering, so a
 * drop stays reproducible even if unrelated systems consume randomness.
 */
export function derive(seed: number, salt: number): Rng {
  let value = (seed ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0xc2b2ae35) >>> 0;
  return { seed: (value ^ (value >>> 13)) >>> 0 };
}
