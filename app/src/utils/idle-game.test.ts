import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_OFFLINE_SECONDS,
  advanceGame,
  advanceGameTo,
  applyOfflineProgress,
  buyUpgrade,
  changeZone,
  createInitialGame,
  hydrateGame,
  partyDps,
  partyMaxHp,
  togglePartyMember,
  upgradeCost,
} from "./idle-game";

test("initial game has a playable three-creature party", () => {
  const game = createInitialGame();
  assert.equal(game.activeIds.length, 3);
  assert.equal(game.creatures.length, 6);
  assert.ok(partyDps(game) > 0);
  assert.equal(game.partyHp, partyMaxHp(game));
  assert.equal(game.enemy.species, "ember");
});

test("live combat defeats enemies and grants persistent rewards", () => {
  let game = { ...createInitialGame(), lastUpdatedAt: 1_000 };
  const initialGold = game.gold;
  for (let second = 2; second <= 30 && game.kills === 0; second += 1) {
    game = advanceGame(game, second * 1_000);
  }
  assert.equal(game.kills, 1);
  assert.ok(game.gold > initialGold);
  assert.ok(game.zoneKills > 0);
  assert.ok(game.enemy.hp > 0);
});

test("locked routes cannot be selected", () => {
  const game = createInitialGame();
  assert.equal(changeZone(game, "sky"), game);
  const unlocked = { ...game, playerLevel: 40 };
  const moved = changeZone(unlocked, "sky");
  assert.equal(moved.zoneId, "sky");
  assert.equal(moved.zoneKills, 0);
  assert.equal(moved.enemy.species, "sky");
});

test("training spends gold exactly once and raises the selected rank", () => {
  const game = createInitialGame();
  const cost = upgradeCost(game, "attack");
  const trained = buyUpgrade(game, "attack");
  assert.equal(trained.gold, game.gold - cost);
  assert.equal(trained.upgrades.attack, 1);
  assert.ok(partyDps(trained) > partyDps(game));
});

test("offline progress is rewarded and capped at eight hours", () => {
  const game = { ...createInitialGame(), lastUpdatedAt: 10_000, running: true };
  const result = applyOfflineProgress(game, 10_000 + (MAX_OFFLINE_SECONDS + 9_000) * 1_000);
  assert.ok(result.report);
  assert.equal(result.report?.seconds, MAX_OFFLINE_SECONDS);
  assert.ok((result.report?.kills ?? 0) > 0);
  assert.ok(result.state.gold > game.gold);
  assert.ok(result.state.kills > game.kills);
});

test("maximum offline progress leaves the current route beatable", () => {
  const game = { ...createInitialGame(), lastUpdatedAt: 10_000, running: true };
  const result = applyOfflineProgress(game, 10_000 + MAX_OFFLINE_SECONDS * 1_000);
  const killSeconds = result.state.enemy.maxHp / partyDps(result.state);
  const survivalSeconds = result.state.partyHp / result.state.enemy.attack;
  assert.ok(killSeconds < 60, `ordinary enemy took ${killSeconds.toFixed(1)} seconds`);
  assert.ok(survivalSeconds > killSeconds, "returned party must survive long enough to win immediately");
});

test("three consecutive defeats stop an unsafe first-route hunt", () => {
  let game = {
    ...createInitialGame(),
    gold: 100,
    partyHp: 1,
    enemy: { ...createInitialGame().enemy, attack: 10_000 },
    lastUpdatedAt: 1_000,
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    game = { ...game, partyHp: 1, recoveringUntil: 0, lastUpdatedAt: 1_000 + attempt * 10_000 };
    game = advanceGame(game, 2_000 + attempt * 10_000);
  }
  assert.equal(game.running, false);
  assert.equal(game.defeatStreak, 0);
  assert.ok(game.gold >= 97, "defeats must not drain the full wallet");
});

test("party changes preserve vitality ratio instead of granting a free heal", () => {
  let game = { ...createInitialGame(), partyHp: 35 };
  const before = game.partyHp / partyMaxHp(game);
  game = togglePartyMember(game, "bramble");
  game = togglePartyMember(game, "bramble");
  const after = game.partyHp / partyMaxHp(game);
  assert.ok(Math.abs(after - before) < 0.01);
});

test("ordinary foreground stalls are simulated instead of discarded", () => {
  const start = { ...createInitialGame(), lastUpdatedAt: 1_000 };
  const settled = advanceGameTo(start, 11_000);
  assert.equal(settled.lastUpdatedAt, 11_000);
  assert.ok(settled.enemy.hp < start.enemy.hp || settled.kills > 0);
});

test("an impossible offline fight safely camps without fabricated victories", () => {
  const game = {
    ...createInitialGame(),
    partyHp: 1,
    inventory: { ...createInitialGame().inventory, tonics: 0 },
    enemy: { ...createInitialGame().enemy, attack: 100_000 },
    lastUpdatedAt: 1_000,
  };
  const result = applyOfflineProgress(game, 3_601_000);
  assert.equal(result.report, null);
  assert.equal(result.state.running, false);
  assert.equal(result.state.kills, 0);
});

test("invalid or obsolete saves safely restart", () => {
  const now = 50_000;
  const result = hydrateGame({ version: 999, creatures: [], activeIds: [] }, now);
  assert.equal(result.state.version, 1);
  assert.equal(result.state.activeIds.length, 3);
  assert.equal(result.state.lastUpdatedAt, now);
});

test("combat stays deterministic after a JSON save round-trip", () => {
  let first = { ...createInitialGame(), lastUpdatedAt: 1_000 };
  let second = JSON.parse(JSON.stringify(first)) as typeof first;
  for (let tick = 2; tick <= 50; tick += 1) {
    first = advanceGame(first, tick * 1_000);
    second = advanceGame(second, tick * 1_000);
  }
  assert.deepEqual(first, second);
});
