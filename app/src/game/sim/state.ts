import type { Species } from "@/utils/portage";
import { creatureStats } from "@/utils/portage";
import { PLAYER_CHARACTER, creatureCharacterId } from "@/utils/world-art";
import type { GridPoint } from "../core/grid";
import type {
  Companion,
  Entity,
  GameState,
  LogEntry,
  LogTone,
  PlayerProgress,
  SpawnPoint,
} from "../core/types";
import { createWorldMap, type WorldMap } from "../world/map";
import { monsterTemplate, monstersOfZone, wardenOfZone, type MonsterTemplate } from "../world/monsters";
import { capacity, equipmentBonus, inventoryWeight } from "../world/items";

export const SAVE_VERSION = 2;
export const PLAYER_ID = "player";

/** Ten kills in a zone summon its Warden; the tenth spawn is the boss. */
export const WARDEN_EVERY = 10;

/**
 * Only one creature is in the field at a time.
 *
 * The Porter is a handler, not a fighter: they carry, direct and take the hits,
 * and the creature does the killing. A single companion is what makes the
 * choice of *which* creature matter.
 */
export const MAX_ACTIVE_COMPANIONS = 1;

const STARTER_COMPANIONS: Companion[] = [
  { id: "cinder", name: "Cinderling", species: "ember", rarity: "uncommon", stage: "adult", level: 5, exp: 0 },
  { id: "ripple", name: "Ripple", species: "creek", rarity: "common", stage: "hatchling", level: 4, exp: 12 },
  { id: "bramble", name: "Bramble", species: "grove", rarity: "rare", stage: "adult", level: 3, exp: 8 },
  { id: "shard", name: "Shard", species: "stone", rarity: "uncommon", stage: "hatchling", level: 2, exp: 5 },
  { id: "wisp", name: "Wisp", species: "mist", rarity: "rare", stage: "hatchling", level: 1, exp: 0 },
  { id: "aurora", name: "Aurora", species: "sky", rarity: "epic", stage: "hatchling", level: 1, exp: 0 },
];

export function expForLevel(level: number): number {
  return 100 + level * level * 28;
}

export function expForCompanionLevel(level: number): number {
  return 35 + level * level * 12;
}

/** Skill advance cost grows steeply, so high skill is genuinely earned. */
export function triesForSkill(level: number): number {
  return Math.round(14 * Math.pow(1.22, level));
}

export function playerMaxHp(progress: PlayerProgress): number {
  return 180 + progress.level * 26 + progress.skills.vitality * 18;
}

/**
 * What the Porter adds to their creature's attack.
 *
 * The Porter never swings — the handling skill and the weapon they carry are
 * passed to whatever is in the field, which is why equipment still matters.
 */
export function handlingBonus(state: GameState): number {
  const { progress, inventory } = state;
  return progress.level * 0.8 + progress.skills.melee * 1.8 + equipmentBonus(inventory).attack;
}

/** Total attack for the creature currently in the field. */
export function companionAttack(state: GameState, companion: Entity): number {
  return companion.stats.attack + handlingBonus(state);
}

export function playerDefense(state: GameState): number {
  const { progress, inventory } = state;
  return 2 + progress.skills.shielding * 1.6 + equipmentBonus(inventory).defense;
}

/** Over capacity, the Porter is slowed rather than stopped. */
export function isOverloaded(state: GameState): boolean {
  return inventoryWeight(state.inventory) > capacity(state.progress.level);
}

export function companionStats(companion: Companion) {
  const base = creatureStats(companion.species, companion.rarity, companion.stage);
  const scale = 1 + (companion.level - 1) * 0.085;
  return {
    health: Math.max(1, Math.round(base.health * scale)),
    attack: Math.max(1, Math.round(base.attack * scale)),
    defense: Math.round(base.defense * scale),
    speed: Math.max(1, Math.round(base.speed * scale)),
  };
}

export function makePlayer(progress: PlayerProgress, at: GridPoint): Entity {
  const maxHp = playerMaxHp(progress);
  return {
    id: PLAYER_ID,
    kind: "player",
    charId: PLAYER_CHARACTER,
    name: "Wayfarer_01",
    species: "ember",
    stage: "adult",
    x: at.x,
    y: at.y,
    direction: "south",
    hp: maxHp,
    maxHp,
    stats: { attack: 0, defense: 0, speed: 100 },
    level: progress.level,
    state: "idle",
    stateTicks: 0,
    moveCooldown: 0,
    attackCooldown: 0,
    path: [],
    targetId: null,
  };
}

export function makeCompanion(companion: Companion, at: GridPoint, index: number): Entity {
  const stats = companionStats(companion);
  return {
    id: `companion:${companion.id}`,
    kind: "companion",
    charId: creatureCharacterId(companion.species, companion.stage),
    name: companion.name,
    species: companion.species,
    stage: companion.stage,
    x: at.x,
    y: at.y,
    direction: "south",
    hp: stats.health,
    maxHp: stats.health,
    stats: { attack: stats.attack, defense: stats.defense, speed: stats.speed },
    level: companion.level,
    state: "idle",
    stateTicks: 0,
    moveCooldown: index,
    attackCooldown: index * 3,
    path: [],
    targetId: null,
    tokenId: companion.tokenId,
  };
}

export function makeMonster(template: MonsterTemplate, at: GridPoint, serial: number, spawnId: string): Entity {
  return {
    id: `monster:${serial}`,
    kind: "monster",
    charId: template.charId,
    name: template.name,
    species: template.species,
    stage: template.stage,
    x: at.x,
    y: at.y,
    direction: "south",
    hp: template.hp,
    maxHp: template.hp,
    stats: { attack: template.attack, defense: template.defense, speed: template.moveSpeed },
    level: template.level,
    state: "idle",
    stateTicks: 0,
    moveCooldown: serial % 4,
    attackCooldown: template.attackSpeed,
    path: [],
    targetId: null,
    spawnId,
    templateId: template.id,
    leash: template.leash,
  };
}

function buildSpawns(map: WorldMap, zoneId: Species): SpawnPoint[] {
  const ordinary = monstersOfZone(zoneId).map((template) => template.id);
  const warden = wardenOfZone(zoneId).id;
  return map.spawns.map((spawn, index) => ({
    id: spawn.id,
    x: spawn.x,
    y: spawn.y,
    // One point per zone hosts the Warden, so the boss has a known lair.
    monsterIds: index === 0 ? [warden] : ordinary,
    radius: spawn.radius,
    maxAlive: index === 0 ? 1 : 3,
    respawnTicks: index === 0 ? 900 : 220,
    nextSpawnTick: 0,
  }));
}

export function addLog(state: GameState, text: string, tone: LogTone): GameState {
  return {
    ...state,
    log: [{ id: state.nextLogId, text, tone } satisfies LogEntry, ...state.log].slice(0, 60),
    nextLogId: state.nextLogId + 1,
  };
}

export function createInitialState(zoneId: Species = "ember", now = 0): GameState {
  const map = createWorldMap(zoneId);
  const progress: PlayerProgress = {
    level: 1,
    exp: 0,
    skills: { melee: 1, shielding: 1, vitality: 1 },
    skillTries: { melee: 0, shielding: 0, vitality: 0 },
  };
  const start = { x: map.start.x, y: map.start.y };
  const companions = STARTER_COMPANIONS.map((companion) => ({ ...companion }));
  const activeCompanionIds = ["cinder"];
  const entities: Entity[] = [makePlayer(progress, start)];
  activeCompanionIds.forEach((id, index) => {
    const companion = companions.find((candidate) => candidate.id === id);
    if (!companion) return;
    entities.push(makeCompanion(companion, { x: start.x - 1 - index, y: start.y + 1 }, index));
  });

  return {
    version: SAVE_VERSION,
    tick: 0,
    zoneId,
    seed: 0x51f15e,
    killSerial: 0,
    entities,
    ground: [],
    spawns: buildSpawns(map, zoneId),
    progress,
    companions,
    activeCompanionIds,
    inventory: {
      stacks: [
        { instanceId: "i1", defId: "tonic", count: 5 },
        { instanceId: "i2", defId: "worn-blade", count: 1 },
        { instanceId: "i3", defId: "travel-cloak", count: 1 },
      ],
      equipment: {},
      gold: 120,
      shards: 8,
    },
    settings: { autoHunt: true, autoPotion: true, autoLoot: true },
    kills: 0,
    deaths: 0,
    playSeconds: 0,
    log: [{ id: 1, tone: "system", text: "You enter Cinderpath. The hunt has begun." }],
    nextLogId: 2,
    nextInstance: 4,
    nextEntitySerial: 1000,
    lastUpdatedAt: now,
    chain: { checkpointedTick: 0, pendingActions: [] },
  };
}

export function playerOf(state: GameState): Entity {
  const player = state.entities.find((entity) => entity.id === PLAYER_ID);
  if (!player) throw new Error("Player entity missing from state");
  return player;
}

export function entityById(state: GameState, id: string | null): Entity | undefined {
  if (!id) return undefined;
  return state.entities.find((entity) => entity.id === id);
}

export { monsterTemplate };
