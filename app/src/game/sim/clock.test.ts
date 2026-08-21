import assert from "node:assert/strict";
import test from "node:test";

import { TICK_MS } from "../core/types";
import { MAX_SETTLE_TICKS, PLAYABLE_TICKS, SETTLE_LIMIT, planFrame } from "./clock";

test("an ordinary frame is simply played out", () => {
  const plan = planFrame(TICK_MS * 3);
  assert.equal(plan.kind, "play");
  assert.equal(plan.ticks, 3);
});

test("a partial tick is kept, not spent", () => {
  const plan = planFrame(TICK_MS * 2.5);
  assert.equal(plan.ticks, 2);
  assert.equal(plan.carryMs, TICK_MS * 0.5, "the remainder is what keeps the timestep honest");
});

/**
 * The fast-forward, in one assertion.
 *
 * A backgrounded tab is throttled to a timer a minute while the clock keeps
 * running, so returning to one found minutes of world owed. The old rule paid
 * a fixed forty ticks — four seconds of world — per hundred-millisecond frame
 * and carried the rest, so the backlog played out at forty times speed until
 * it ran dry: the caravan tore across the map and a minute of hunting scrolled
 * past in a second. Whatever is owed has to leave the clock in the frame that
 * noticed it.
 */
test("a minute spent on another tab is settled at once, never replayed", () => {
  const plan = planFrame(60_000);
  assert.equal(plan.kind, "settle", "an absence is found, not watched");
  assert.equal(plan.ticks, 600, "and all of it is credited");
  assert.ok(plan.carryMs < TICK_MS, `${plan.carryMs}ms was carried into the next frame`);
});

test("no debt outlives the frame that noticed it", () => {
  for (const owedMs of [0, 99, 100, 2_000, 60_000, 5 * 60_000, 3 * 60 * 60_000]) {
    const plan = planFrame(owedMs);
    assert.ok(
      plan.carryMs < TICK_MS,
      `${owedMs}ms owed left ${plan.carryMs}ms on the clock, which is a backlog to replay`,
    );
    // And the next frame, arriving on time, has nothing left over to speed through.
    const next = planFrame(plan.carryMs + TICK_MS);
    assert.ok(next.ticks <= PLAYABLE_TICKS, `the frame after paid ${next.ticks} ticks`);
  }
});

test("a long absence goes behind the progress bar rather than into one frame", () => {
  const plan = planFrame((SETTLE_LIMIT + 1) * TICK_MS);
  assert.equal(plan.kind, "catchUp");
});

test("nothing past the hour the caravan hunts is credited", () => {
  const plan = planFrame(8 * 60 * 60 * 1000);
  assert.equal(plan.kind, "catchUp");
  assert.equal(plan.ticks, MAX_SETTLE_TICKS, "the offline rule holds however the player came back");
});
