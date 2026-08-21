import { TICK_MS } from "../core/types";
import { MAX_SIMULATED_SECONDS } from "./save";

/**
 * What the client owes the world, and how to pay it.
 *
 * The clock is a fixed timestep with an accumulator, which is ordinary. What
 * is not ordinary is how badly a browser tab lies to it: backgrounded, a tab
 * is throttled to a timer a second, and once the browser decides it is idle,
 * to one a minute — while wall-clock time, and therefore the debt, keeps
 * running. Come back and the accumulator holds minutes of world.
 *
 * The old rule drained a fixed forty ticks per frame and carried the rest
 * forward. Forty ticks is four seconds of world, and a frame is a tenth of a
 * second, so the backlog played out at forty times speed for as long as it
 * lasted: the caravan tore across the map, monsters died in bursts, and the
 * log scrolled a minute of hunting in a second. Nothing was wrong with the
 * simulation — it was the replay.
 *
 * So: a debt is paid in the frame it is noticed, in full, and never carried.
 * How it is paid depends only on its size.
 */
export type ClockPlan =
  /** Nothing owed: not even a whole tick has passed. */
  | { kind: "idle"; ticks: 0; carryMs: number }
  /** Short enough to watch. Played out with events, as live play. */
  | { kind: "play"; ticks: number; carryMs: number }
  /** Run at once with the events discarded: the world is found, not replayed. */
  | { kind: "settle"; ticks: number; carryMs: number }
  /** Too much for one frame; the chunked catch-up runs it behind a progress bar. */
  | { kind: "catchUp"; ticks: number; carryMs: number };

/**
 * The most that is ever replayed on screen — two seconds.
 *
 * It covers an ordinary hitch, a slow frame or a garbage collection, where
 * playing the gap out is smoother than snapping through it. Anything longer is
 * an absence, and snapping is the only honest way to show one.
 */
export const PLAYABLE_TICKS = 20;

/**
 * The most that is settled in one blocking call — five minutes of world.
 *
 * The reducer runs at roughly five thousand ticks a second, so this is about a
 * tenth of a second of work: a hitch on return, not a freeze.
 */
export const SETTLE_LIMIT = 3_000;

/** The offline rule in ticks: the caravan hunts for an hour, then makes camp. */
export const MAX_SETTLE_TICKS = MAX_SIMULATED_SECONDS * (1000 / TICK_MS);

export function planFrame(carryMs: number): ClockPlan {
  const owed = Math.floor(Math.max(0, carryMs) / TICK_MS);
  // Whatever is owed leaves the clock now; only the sub-tick remainder stays,
  // and it is what keeps the timestep honest between frames.
  const carry = Math.max(0, carryMs) - owed * TICK_MS;

  if (owed <= 0) return { kind: "idle", ticks: 0, carryMs: carry };
  if (owed <= PLAYABLE_TICKS) return { kind: "play", ticks: owed, carryMs: carry };
  if (owed <= SETTLE_LIMIT) return { kind: "settle", ticks: owed, carryMs: carry };
  return { kind: "catchUp", ticks: Math.min(owed, MAX_SETTLE_TICKS), carryMs: carry };
}
