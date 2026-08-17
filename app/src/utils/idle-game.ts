import type { Rarity, Species, Stage } from "./portage";
import { BASE_STATS, RARITY_MULT, SPECIES, STAGE_MULT } from "./portage";

export const GAME_SAVE_VERSION = 1;
export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;

export interface ZoneDefinition {
  id: Species;
  name: string;
  subtitle: string;
  requiredLevel: number;
  baseEnemyLevel: number;
  enemyNames: readonly string[];
  rewardGold: number;
  rewardXp: number;
}

export const IDLE_ZONES: readonly ZoneDefinition[] = [
  { id: "ember", name: "Cinderpath", subtitle: "Warm ruins and restless sparks", requiredLevel: 1, baseEnemyLevel: 1, enemyNames: ["Ash Mite", "Coalback", "Soot Skitter"], rewardGold: 7, rewardXp: 12 },
  { id: "creek", name: "Moon Creek", subtitle: "Silver currents beneath old bridges", requiredLevel: 5, baseEnemyLevel: 6, enemyNames: ["Reed Hopper", "Murkfin", "Current Crab"], rewardGold: 13, rewardXp: 21 },
  { id: "grove", name: "Rootwild", subtitle: "Living paths under an ancient canopy", requiredLevel: 10, baseEnemyLevel: 12, enemyNames: ["Thorn Pup", "Mossling", "Bark Beetle"], rewardGold: 23, rewardXp: 35 },
  { id: "stone", name: "Crystal Delve", subtitle: "Deep tunnels that remember every footstep", requiredLevel: 16, baseEnemyLevel: 19, enemyNames: ["Flint Mole", "Cavehorn", "Quartz Crawler"], rewardGold: 39, rewardXp: 55 },
  { id: "mist", name: "Whisper Fen", subtitle: "Fog, lanterns and things without shadows", requiredLevel: 24, baseEnemyLevel: 28, enemyNames: ["Veil Moth", "Gloom Wader", "Hush Bat"], rewardGold: 64, rewardXp: 84 },
  { id: "sky", name: "Aurora Reach", subtitle: "Islands carried by the high wind", requiredLevel: 34, baseEnemyLevel: 39, enemyNames: ["Gale Kite", "Prism Roc", "Cloud Ray"], rewardGold: 102, rewardXp: 126 },
] as const;

export interface IdleCreature {
  id: string;
  name: string;
  species: Species;
  rarity: Rarity;
  stage: Stage;
  level: number;
  xp: number;
}

export interface IdleEnemy {
  serial: number;
  name: string;
  species: Species;
  level: number;
  isBoss: boolean;
  hp: number;
  maxHp: number;
  attack: number;
}

export interface GameLogEntry {
  id: number;
  tone: "combat" | "loot" | "level" | "system";
  text: string;
}

export interface IdleGameState {
  version: number;
  playerLevel: number;
  playerXp: number;
  gold: number;
  shards: number;
  zoneId: Species;
  running: boolean;
  engaged: boolean;
  kills: number;
  zoneKills: number;
  partyHp: number;
  enemy: IdleEnemy;
  creatures: IdleCreature[];
  activeIds: string[];
  inventory: { tonics: number; crystals: number; relics: number };
  upgrades: { attack: number; armor: number; fortune: number };
  settings: { autoPotion: boolean; autoAdvance: boolean; autoRoam: boolean };
  rngSeed: number;
  log: GameLogEntry[];
  nextLogId: number;
  totalPlaySeconds: number;
  defeatStreak: number;
  recoveringUntil: number;
  lastUpdatedAt: number;
}

export interface OfflineReport {
  seconds: number;
  kills: number;
  gold: number;
  xp: number;
  shards: number;
}

const STARTER_CREATURES: IdleCreature[] = [
  { id: "cinder", name: "Cinderling", species: "ember", rarity: "uncommon", stage: "adult", level: 5, xp: 0 },
  { id: "ripple", name: "Ripple", species: "creek", rarity: "common", stage: "hatchling", level: 4, xp: 12 },
  { id: "bramble", name: "Bramble", species: "grove", rarity: "rare", stage: "adult", level: 3, xp: 8 },
  { id: "shard", name: "Shard", species: "stone", rarity: "uncommon", stage: "hatchling", level: 2, xp: 5 },
  { id: "wisp", name: "Wisp", species: "mist", rarity: "rare", stage: "hatchling", level: 1, xp: 0 },
  { id: "aurora", name: "Aurora", species: "sky", rarity: "epic", stage: "hatchling", level: 1, xp: 0 },
];

const INITIAL_ENEMY: IdleEnemy = {
  serial: 1,
  name: "Ash Mite",
  species: "ember",
  level: 1,
  isBoss: false,
  hp: 125,
  maxHp: 125,
  attack: 5,
};

export function createInitialGame(): IdleGameState {
  const base: IdleGameState = {
    version: GAME_SAVE_VERSION,
    playerLevel: 1,
    playerXp: 0,
    gold: 120,
    shards: 8,
    zoneId: "ember",
    running: true,
    engaged: false,
    kills: 0,
    zoneKills: 0,
    partyHp: 1,
    enemy: { ...INITIAL_ENEMY },
    creatures: STARTER_CREATURES.map((creature) => ({ ...creature })),
    activeIds: ["cinder", "ripple", "bramble"],
    inventory: { tonics: 3, crystals: 0, relics: 0 },
    upgrades: { attack: 0, armor: 0, fortune: 0 },
    settings: { autoPotion: true, autoAdvance: false, autoRoam: true },
    rngSeed: 0x51f15e,
    log: [{ id: 1, tone: "system", text: "The caravan entered Cinderpath. The hunt has begun." }],
    nextLogId: 2,
    totalPlaySeconds: 0,
    defeatStreak: 0,
    recoveringUntil: 0,
    lastUpdatedAt: 0,
  };
  base.partyHp = partyMaxHp(base);
  return base;
}

export function zoneFor(id: Species): ZoneDefinition {
  return IDLE_ZONES.find((zone) => zone.id === id) ?? IDLE_ZONES[0];
}

export function zoneIndex(id: Species): number {
  return Math.max(0, IDLE_ZONES.findIndex((zone) => zone.id === id));
}

export function xpForPlayerLevel(level: number): number {
  return 80 + level * level * 22;
}

export function xpForCreatureLevel(level: number): number {
  return 35 + level * level * 12;
}

export function creatureCombatStats(creature: IdleCreature) {
  const base = BASE_STATS[creature.species];
  const rarity = RARITY_MULT[creature.rarity] / 100;
  const stage = STAGE_MULT[creature.stage] / 100;
  const level = 1 + (creature.level - 1) * 0.085;
  return {
    health: Math.round(base.health * rarity * stage * level),
    attack: Math.round(base.attack * rarity * stage * level),
    defense: Math.round(base.defense * rarity * stage * level),
    speed: Math.round(base.speed * rarity * stage * level),
  };
}

export function activeCreatures(state: IdleGameState): IdleCreature[] {
  return state.activeIds.flatMap((id) => {
    const creature = state.creatures.find((candidate) => candidate.id === id);
    return creature ? [creature] : [];
  });
}

export function partyMaxHp(state: Pick<IdleGameState, "creatures" | "activeIds" | "upgrades">): number {
  const health = state.activeIds.reduce((sum, id) => {
    const creature = state.creatures.find((candidate) => candidate.id === id);
    return sum + (creature ? creatureCombatStats(creature).health : 0);
  }, 0);
  return Math.max(1, Math.round(health * (1 + state.upgrades.armor * 0.12)));
}

export function partyDps(state: Pick<IdleGameState, "creatures" | "activeIds" | "upgrades">): number {
  const power = state.activeIds.reduce((sum, id) => {
    const creature = state.creatures.find((candidate) => candidate.id === id);
    if (!creature) return sum;
    const stats = creatureCombatStats(creature);
    return sum + stats.attack + stats.speed * 0.32;
  }, 0);
  return Math.max(1, (power / 15) * (1 + state.upgrades.attack * 0.14));
}

function nextRandom(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return [next / 0x100000000, next];
}

function addLog(state: IdleGameState, text: string, tone: GameLogEntry["tone"]): IdleGameState {
  return {
    ...state,
    log: [{ id: state.nextLogId, text, tone }, ...state.log].slice(0, 30),
    nextLogId: state.nextLogId + 1,
  };
}

function grantLevels(state: IdleGameState, xp: number): IdleGameState {
  let playerLevel = state.playerLevel;
  let playerXp = state.playerXp + xp;
  let leveled = false;
  while (playerXp >= xpForPlayerLevel(playerLevel)) {
    playerXp -= xpForPlayerLevel(playerLevel);
    playerLevel += 1;
    leveled = true;
  }

  const share = Math.max(1, Math.floor(xp / Math.max(1, state.activeIds.length)));
  const creatures = state.creatures.map((creature) => {
    if (!state.activeIds.includes(creature.id)) return creature;
    let nextXp = creature.xp + share;
    let level = creature.level;
    while (nextXp >= xpForCreatureLevel(level)) {
      nextXp -= xpForCreatureLevel(level);
      level += 1;
    }
    return { ...creature, xp: nextXp, level };
  });
  let next = { ...state, playerLevel, playerXp, creatures };
  if (leveled) next = addLog(next, `Porter level ${playerLevel} reached. New routes may be available.`, "level");
  return next;
}

function spawnEnemy(state: IdleGameState): IdleGameState {
  const zone = zoneFor(state.zoneId);
  const index = zoneIndex(state.zoneId);
  const nextZoneKill = state.zoneKills + 1;
  const isBoss = nextZoneKill % 10 === 0;
  const [roll, rngSeed] = nextRandom(state.rngSeed);
  const name = isBoss ? `${zone.name} Warden` : zone.enemyNames[Math.floor(roll * zone.enemyNames.length) % zone.enemyNames.length];
  // Difficulty follows Porter mastery, never an unbounded kill counter. Returning
  // players therefore cannot make their current route permanently unwinnable.
  const mastery = Math.max(0, state.playerLevel - zone.requiredLevel);
  const level = zone.baseEnemyLevel + Math.min(10, Math.floor(mastery / 4));
  const scale = 1 + index * 0.5 + Math.min(0.5, mastery * 0.025);
  const maxHp = Math.round((100 + level * 16) * scale * (isBoss ? 4.2 : 1));
  const attack = Math.round((3 + level * 0.72) * (1 + index * 0.14) * (isBoss ? 1.7 : 1));
  return {
    ...state,
    rngSeed,
    engaged: false,
    enemy: { serial: state.enemy.serial + 1, name, species: state.zoneId, level, isBoss, hp: maxHp, maxHp, attack },
  };
}

function defeatEnemy(state: IdleGameState): IdleGameState {
  const zone = zoneFor(state.zoneId);
  const index = zoneIndex(state.zoneId);
  const boss = state.enemy.isBoss;
  const fortune = 1 + state.upgrades.fortune * 0.12;
  const gold = Math.round(zone.rewardGold * fortune * (boss ? 7 : 1));
  const xp = Math.round(zone.rewardXp * (boss ? 5 : 1));
  const shardReward = Math.max(1, Math.floor((1 + index * 0.5) * (boss ? 8 : 1)));
  let next: IdleGameState = {
    ...state,
    gold: state.gold + gold,
    shards: state.shards + shardReward,
    kills: state.kills + 1,
    zoneKills: state.zoneKills + 1,
  };
  next = grantLevels(next, xp);
  // Victories restore a small amount of vitality so a well-matched route can
  // remain genuinely idle; Wardens create a larger recovery checkpoint.
  next.partyHp = Math.min(partyMaxHp(next), next.partyHp + partyMaxHp(next) * (boss ? 0.3 : 0.08));

  let roll: number;
  [roll, next.rngSeed] = nextRandom(next.rngSeed);
  const tonicChance = 0.07 + state.upgrades.fortune * 0.012;
  const foundTonic = roll < tonicChance;
  [roll, next.rngSeed] = nextRandom(next.rngSeed);
  const foundCrystal = boss || roll < 0.018 + index * 0.004;
  [roll, next.rngSeed] = nextRandom(next.rngSeed);
  const foundRelic = boss && roll < 0.12 + state.upgrades.fortune * 0.025;
  next.inventory = {
    tonics: next.inventory.tonics + (foundTonic ? 1 : 0),
    crystals: next.inventory.crystals + (foundCrystal ? 1 : 0),
    relics: next.inventory.relics + (foundRelic ? 1 : 0),
  };
  const loot = [foundTonic ? "tonic" : "", foundCrystal ? "crystal" : "", foundRelic ? "relic" : ""].filter(Boolean);
  next = addLog(next, `${boss ? "Warden defeated! " : ""}+${gold} gold, +${xp} EXP${loot.length ? `, found ${loot.join(" + ")}` : ""}.`, boss || loot.length ? "loot" : "combat");

  if (next.settings.autoAdvance && next.zoneKills >= 25) {
    const currentIndex = zoneIndex(next.zoneId);
    const candidate = IDLE_ZONES[currentIndex + 1];
    if (candidate && next.playerLevel >= candidate.requiredLevel) {
      next = changeZone(next, candidate.id);
      return addLog(next, `The caravan advanced to ${candidate.name}.`, "system");
    }
  }
  return spawnEnemy(next);
}

export function advanceGame(state: IdleGameState, now: number): IdleGameState {
  if (!state.running || !state.engaged) return state.lastUpdatedAt === now ? state : { ...state, lastUpdatedAt: now };
  if (state.recoveringUntil > now) return { ...state, lastUpdatedAt: now };
  const elapsed = state.lastUpdatedAt > 0 ? Math.min(1, Math.max(0, (now - state.lastUpdatedAt) / 1000)) : 0;
  if (elapsed <= 0) return { ...state, recoveringUntil: 0, lastUpdatedAt: now };

  let next = { ...state, recoveringUntil: 0, totalPlaySeconds: state.totalPlaySeconds + elapsed, lastUpdatedAt: now };
  let partyHp = next.partyHp - next.enemy.attack * elapsed;
  const enemyHp = next.enemy.hp - partyDps(next) * elapsed;

  // Never waste a tonic after lethal damage has already landed.
  if (partyHp > 0 && next.settings.autoPotion && partyHp / partyMaxHp(next) <= 0.3 && next.inventory.tonics > 0) {
    partyHp = Math.min(partyMaxHp(next), partyHp + partyMaxHp(next) * 0.42);
    next = { ...next, inventory: { ...next.inventory, tonics: next.inventory.tonics - 1 } };
    next = addLog(next, "Auto-tonic restored 42% caravan vitality.", "system");
  }

  if (partyHp <= 0) {
    const lostGold = Math.min(next.gold, Math.max(1, zoneIndex(next.zoneId) + 1));
    const defeatStreak = next.defeatStreak + 1;
    next = {
      ...next,
      gold: next.gold - lostGold,
      defeatStreak,
      recoveringUntil: now + 5_000,
      partyHp: partyMaxHp(next),
      enemy: { ...next.enemy, hp: next.enemy.maxHp },
    };
    next = addLog(next, `The caravan retreated to recover and lost ${lostGold} gold.`, "system");
    if (defeatStreak >= 3) {
      const currentIndex = zoneIndex(next.zoneId);
      if (currentIndex > 0) {
        next = changeZone(next, IDLE_ZONES[currentIndex - 1].id);
        next = addLog(next, "After three defeats, the caravan fell back to a safer route.", "system");
      } else {
        next = setRunning({ ...next, defeatStreak: 0 }, false, now);
        next = addLog(next, "After three defeats, the caravan made camp. Train or use a tonic before resuming.", "system");
      }
    }
    return next;
  }

  next = { ...next, partyHp, enemy: { ...next.enemy, hp: enemyHp } };
  if (enemyHp <= 0) next = defeatEnemy({ ...next, defeatStreak: 0 });
  return next;
}

export function advanceGameTo(state: IdleGameState, now: number): IdleGameState {
  if (state.lastUpdatedAt <= 0 || now <= state.lastUpdatedAt) return advanceGame(state, now);
  let next = state;
  let cursor = state.lastUpdatedAt;
  // Catch up ordinary foreground stalls exactly in one-second combat slices.
  while (cursor < now) {
    cursor = Math.min(now, cursor + 1_000);
    next = advanceGame(next, cursor);
  }
  return next;
}

export function changeZone(state: IdleGameState, zoneId: Species): IdleGameState {
  const zone = zoneFor(zoneId);
  if (state.playerLevel < zone.requiredLevel) return state;
  // Travelling resets the encounter, not vitality; this prevents free-heal hopping.
  const sameRoute = state.zoneId === zoneId;
  let next: IdleGameState = {
    ...state,
    zoneId,
    zoneKills: 0,
    defeatStreak: sameRoute ? state.defeatStreak : 0,
    recoveringUntil: sameRoute ? state.recoveringUntil : 0,
  };
  next.partyHp = Math.min(next.partyHp, partyMaxHp(next));
  next = spawnEnemy(next);
  return addLog(next, sameRoute ? `The ${zone.name} hunt was reset.` : `Route changed: ${zone.name}.`, "system");
}

export function setRunning(state: IdleGameState, running: boolean, now: number): IdleGameState {
  return addLog({ ...state, running, engaged: running ? state.engaged : false, lastUpdatedAt: now }, running ? "The hunt resumed." : "The caravan made camp.", "system");
}

export function setEngaged(state: IdleGameState, engaged: boolean, now: number): IdleGameState {
  if (state.engaged === engaged) return state;
  return { ...state, engaged, lastUpdatedAt: now };
}

export function setGameSetting(state: IdleGameState, key: keyof IdleGameState["settings"], value: boolean): IdleGameState {
  return { ...state, settings: { ...state.settings, [key]: value } };
}

export type UpgradeKey = keyof IdleGameState["upgrades"];
export function upgradeCost(state: IdleGameState, key: UpgradeKey): number {
  return Math.round(90 * Math.pow(1.82, state.upgrades[key]));
}

export function buyUpgrade(state: IdleGameState, key: UpgradeKey): IdleGameState {
  const cost = upgradeCost(state, key);
  if (state.gold < cost) return state;
  const maxHpBefore = partyMaxHp(state);
  const next = { ...state, gold: state.gold - cost, upgrades: { ...state.upgrades, [key]: state.upgrades[key] + 1 } };
  if (key === "armor") {
    const ratio = state.partyHp / maxHpBefore;
    next.partyHp = Math.round(partyMaxHp(next) * ratio);
  }
  return addLog(next, `${key[0].toUpperCase()}${key.slice(1)} training improved to rank ${next.upgrades[key]}.`, "level");
}

export function useTonic(state: IdleGameState): IdleGameState {
  if (state.inventory.tonics <= 0 || state.partyHp >= partyMaxHp(state)) return state;
  return {
    ...state,
    partyHp: Math.min(partyMaxHp(state), state.partyHp + partyMaxHp(state) * 0.42),
    inventory: { ...state.inventory, tonics: state.inventory.tonics - 1 },
  };
}

export function togglePartyMember(state: IdleGameState, creatureId: string): IdleGameState {
  const vitalityRatio = state.partyHp / partyMaxHp(state);
  if (state.activeIds.includes(creatureId)) {
    if (state.activeIds.length <= 1) return state;
    const next = { ...state, activeIds: state.activeIds.filter((id) => id !== creatureId) };
    next.partyHp = Math.max(1, Math.round(partyMaxHp(next) * vitalityRatio));
    return next;
  }
  if (state.activeIds.length >= 3 || !state.creatures.some((creature) => creature.id === creatureId)) return state;
  const next = { ...state, activeIds: [...state.activeIds, creatureId] };
  next.partyHp = Math.max(1, Math.round(partyMaxHp(next) * vitalityRatio));
  return next;
}

export function evolveCreature(state: IdleGameState, creatureId: string): IdleGameState {
  const creature = state.creatures.find((candidate) => candidate.id === creatureId);
  if (!creature || creature.stage === "legend") return state;
  const crystalCost = creature.stage === "hatchling" ? 3 : 8;
  const levelRequired = creature.stage === "hatchling" ? 10 : 25;
  if (creature.level < levelRequired || state.inventory.crystals < crystalCost) return state;
  const stage: Stage = creature.stage === "hatchling" ? "adult" : "legend";
  const vitalityRatio = state.partyHp / partyMaxHp(state);
  const next = {
    ...state,
    creatures: state.creatures.map((candidate) => candidate.id === creatureId ? { ...candidate, stage } : candidate),
    inventory: { ...state.inventory, crystals: state.inventory.crystals - crystalCost },
  };
  next.partyHp = Math.max(1, Math.round(partyMaxHp(next) * vitalityRatio));
  return addLog(next, `${creature.name} evolved into ${stage === "adult" ? "Adult" : "Legend"} form!`, "level");
}

export function applyOfflineProgress(state: IdleGameState, now: number): { state: IdleGameState; report: OfflineReport | null } {
  const elapsed = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, Math.floor((now - state.lastUpdatedAt) / 1000)));
  if (!state.running || !state.settings.autoRoam || state.lastUpdatedAt <= 0 || elapsed < 5) {
    return { state: { ...state, lastUpdatedAt: now }, report: null };
  }
  const zone = zoneFor(state.zoneId);
  const index = zoneIndex(state.zoneId);
  // Estimate regular encounters even if the save happened during a Warden.
  const enemyHp = state.enemy.maxHp / (state.enemy.isBoss ? 4.2 : 1);
  const enemyAttack = state.enemy.attack / (state.enemy.isBoss ? 1.7 : 1);
  const killSeconds = Math.max(1.2, enemyHp / partyDps(state) + 0.55);
  const maxHp = partyMaxHp(state);
  const damagePerKill = enemyAttack * killSeconds;
  if (state.partyHp + maxHp * 0.42 * state.inventory.tonics <= damagePerKill) {
    const camped = addLog({ ...state, running: false, partyHp: maxHp, lastUpdatedAt: now }, "The offline hunt met overwhelming danger, so the caravan safely made camp.", "system");
    return { state: camped, report: null };
  }
  const theoreticalKills = Math.min(5000, Math.floor((elapsed / killSeconds) * 0.9));
  const netDamagePerKill = damagePerKill - maxHp * 0.08;
  const tonicHealing = maxHp * 0.42;
  const sustainableKills = netDamagePerKill <= 0 ? theoreticalKills : Math.floor((state.partyHp + tonicHealing * state.inventory.tonics - 1) / netDamagePerKill);
  const kills = Math.max(0, Math.min(theoreticalKills, sustainableKills));
  if (kills <= 0) return { state: { ...state, lastUpdatedAt: now }, report: null };
  const tonicDeficit = Math.max(0, netDamagePerKill * kills - state.partyHp + maxHp * 0.15);
  const tonicsUsed = Math.min(state.inventory.tonics, Math.ceil(tonicDeficit / tonicHealing));
  // A successful return never opens directly into an unavoidable death tick.
  const endingHp = Math.max(maxHp * 0.15, Math.min(maxHp, state.partyHp + tonicsUsed * tonicHealing - netDamagePerKill * kills));
  const bossCount = Math.floor((state.zoneKills + kills) / 10) - Math.floor(state.zoneKills / 10);
  const gold = Math.round((kills + bossCount * 6) * zone.rewardGold * (1 + state.upgrades.fortune * 0.12));
  const xp = Math.round((kills + bossCount * 4) * zone.rewardXp);
  const shards = Math.max(kills, Math.floor(kills * (1 + index * 0.45))) + bossCount * 7;
  let next: IdleGameState = {
    ...state,
    gold: state.gold + gold,
    shards: state.shards + shards,
    kills: state.kills + kills,
    zoneKills: state.zoneKills + kills,
    partyHp: endingHp,
    inventory: {
      tonics: state.inventory.tonics - tonicsUsed + Math.floor(kills / 16),
      crystals: state.inventory.crystals + bossCount,
      relics: state.inventory.relics + Math.floor(bossCount / 8),
    },
    totalPlaySeconds: state.totalPlaySeconds + elapsed,
    lastUpdatedAt: now,
  };
  next = grantLevels(next, xp);
  next = spawnEnemy(next);
  next.partyHp = Math.min(partyMaxHp(next), endingHp);
  next = addLog(next, `Offline hunt: ${kills} victories during ${formatDuration(elapsed)}.`, "loot");
  return { state: next, report: { seconds: elapsed, kills, gold, xp, shards } };
}

export function hydrateGame(value: unknown, now: number): { state: IdleGameState; report: OfflineReport | null } {
  const initial = createInitialGame();
  if (!value || typeof value !== "object") return { state: { ...initial, lastUpdatedAt: now }, report: null };
  const saved = value as Partial<IdleGameState>;
  if (saved.version !== GAME_SAVE_VERSION || !Array.isArray(saved.creatures) || !Array.isArray(saved.activeIds)) {
    return { state: { ...initial, lastUpdatedAt: now }, report: null };
  }
  const finite = (value: unknown, fallback: number, minimum = 0) => typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, value) : fallback;
  const creatures = saved.creatures.filter((creature): creature is IdleCreature => Boolean(creature && typeof creature.id === "string" && creature.id));
  const validIds = new Set(creatures.map((creature) => creature.id));
  const activeIds = saved.activeIds.filter((id): id is string => typeof id === "string" && validIds.has(id)).slice(0, 3);
  const merged: IdleGameState = {
    ...initial,
    ...saved,
    playerLevel: finite(saved.playerLevel, initial.playerLevel, 1),
    playerXp: finite(saved.playerXp, initial.playerXp),
    gold: finite(saved.gold, initial.gold),
    shards: finite(saved.shards, initial.shards),
    kills: finite(saved.kills, initial.kills),
    zoneKills: finite(saved.zoneKills, initial.zoneKills),
    partyHp: finite(saved.partyHp, initial.partyHp),
    lastUpdatedAt: finite(saved.lastUpdatedAt, now),
    enemy: { ...initial.enemy, ...saved.enemy },
    inventory: { ...initial.inventory, ...saved.inventory },
    upgrades: { ...initial.upgrades, ...saved.upgrades },
    settings: { ...initial.settings, ...saved.settings },
    creatures: creatures.length ? creatures : initial.creatures,
    activeIds: activeIds.length ? activeIds : initial.activeIds,
    log: Array.isArray(saved.log) ? saved.log.slice(0, 30) : initial.log,
  };
  merged.enemy.hp = finite(merged.enemy.hp, initial.enemy.hp);
  merged.enemy.maxHp = finite(merged.enemy.maxHp, initial.enemy.maxHp, 1);
  merged.enemy.attack = finite(merged.enemy.attack, initial.enemy.attack);
  merged.partyHp = Math.min(merged.partyHp, partyMaxHp(merged));
  return applyOfflineProgress(merged, now);
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export function zoneProgress(state: IdleGameState): number {
  return state.zoneKills % 10;
}

export function speciesDisplayName(species: Species): string {
  return SPECIES[species].example;
}
