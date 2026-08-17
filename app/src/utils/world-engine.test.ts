import assert from "node:assert/strict";
import test from "node:test";
import { createWorldMap, findPath, isWalkable, nearestWalkable, pathToAdjacent, worldDistance } from "./world-engine";
import { SPECIES_LIST } from "./portage";

test("every biome builds a deterministic, populated tile world", () => {
  for (const species of SPECIES_LIST) {
    const first = createWorldMap(species);
    const second = createWorldMap(species);
    assert.deepEqual(first, second);
    assert.equal(first.tiles.length, first.width * first.height);
    assert.ok(first.props.length > 35, `${species} needs environmental props`);
    assert.equal(first.spawns.length, 8);
    assert.ok(first.npcs.length >= 4);
    assert.ok(first.structures.length >= 2);
    assert.ok(isWalkable(first, first.start));
  }
});

test("the outpost can pathfind to every creature spawn", () => {
  for (const species of SPECIES_LIST) {
    const map = createWorldMap(species);
    for (const spawn of map.spawns) {
      const path = pathToAdjacent(map, map.start, spawn);
      assert.ok(path.length > 0, `${species}:${spawn.id} is unreachable`);
      assert.equal(worldDistance(path.at(-1)!, spawn), 1);
      assert.ok(path.every((point) => isWalkable(map, point)));
      let previous = map.start;
      for (const step of path) {
        assert.equal(worldDistance(previous, step), 1, "paths may never jump across collision tiles");
        previous = step;
      }
    }
  }
});

test("pathfinding never walks through solid props or structures", () => {
  const map = createWorldMap("grove");
  const goal = map.spawns[3];
  const path = findPath(map, map.start, goal);
  assert.ok(path.length > 0);
  const solid = new Set(map.props.filter((prop) => prop.solid).map((prop) => `${prop.x},${prop.y}`));
  for (const structure of map.structures) {
    for (let y = structure.y; y < structure.y + structure.height; y += 1) {
      for (let x = structure.x; x < structure.x + structure.width; x += 1) solid.add(`${x},${y}`);
    }
  }
  assert.ok(path.every((point) => !solid.has(`${point.x},${point.y}`)));
});

test("blocked destinations resolve to a nearby walkable tile", () => {
  const map = createWorldMap("creek");
  const blocked = map.tiles.find((tile) => !tile.walkable)!;
  const safe = nearestWalkable(map, blocked);
  assert.ok(isWalkable(map, safe));
});
