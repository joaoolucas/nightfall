import type { Species, Stage } from "@/utils/portage";
import { worldSpriteStem } from "@/utils/world-sprites";

/**
 * Monster templates.
 *
 * Every biome fields two ordinary creatures and one Warden. `charId` names the
 * sprite folder; until the dedicated monster art batch lands they borrow the
 * biome's creature sprites, which is why the field is explicit rather than
 * derived at the call site — swapping in new art is a one-line change per row.
 */

export interface LootEntry {
  defId: string;
  chance: number;
  min: number;
  max: number;
}

export interface MonsterTemplate {
  id: string;
  name: string;
  species: Species;
  stage: Stage;
  charId: string;
  level: number;
  hp: number;
  attack: number;
  defense: number;
  /** Ticks between swings; lower is faster. */
  attackSpeed: number;
  /** Ticks between steps. */
  moveSpeed: number;
  exp: number;
  /** Tiles at which it notices the Porter. */
  vision: number;
  /** Tiles from its spawn it will chase before turning back. */
  leash: number;
  isBoss: boolean;
  loot: readonly LootEntry[];
}

const GOLD = (chance: number, min: number, max: number): LootEntry => ({ defId: "gold", chance, min, max });

interface BiomeMonsters {
  species: Species;
  trophy: string;
  common: Array<{ id: string; name: string; stage: Stage }>;
  warden: { id: string; name: string };
}

const BIOMES: readonly BiomeMonsters[] = [
  {
    species: "ember", trophy: "ash-carapace",
    common: [{ id: "ash-mite", name: "ash mite", stage: "hatchling" }, { id: "coalback", name: "coalback", stage: "adult" }],
    warden: { id: "cinderpath-warden", name: "Cinderpath Warden" },
  },
  {
    species: "creek", trophy: "creek-pearl",
    common: [{ id: "reed-hopper", name: "reed hopper", stage: "hatchling" }, { id: "murkfin", name: "murkfin", stage: "adult" }],
    warden: { id: "moon-creek-warden", name: "Moon Creek Warden" },
  },
  {
    species: "grove", trophy: "root-heart",
    common: [{ id: "thorn-pup", name: "thorn pup", stage: "hatchling" }, { id: "mossling", name: "mossling", stage: "adult" }],
    warden: { id: "rootwild-warden", name: "Rootwild Warden" },
  },
  {
    species: "stone", trophy: "geode-core",
    common: [{ id: "flint-mole", name: "flint mole", stage: "hatchling" }, { id: "cavehorn", name: "cavehorn", stage: "adult" }],
    warden: { id: "crystal-delve-warden", name: "Crystal Delve Warden" },
  },
  {
    species: "mist", trophy: "veil-dust",
    common: [{ id: "veil-moth", name: "veil moth", stage: "hatchling" }, { id: "gloom-wader", name: "gloom wader", stage: "adult" }],
    warden: { id: "whisper-fen-warden", name: "Whisper Fen Warden" },
  },
  {
    species: "sky", trophy: "aurora-quill",
    common: [{ id: "gale-kite", name: "gale kite", stage: "hatchling" }, { id: "prism-roc", name: "prism roc", stage: "adult" }],
    warden: { id: "aurora-reach-warden", name: "Aurora Reach Warden" },
  },
];

/** Difficulty ramp per biome index, mirroring the old zone progression. */
const TIER = [
  { level: 2, hp: 48, attack: 7, defense: 2, exp: 14 },
  { level: 8, hp: 95, attack: 13, defense: 5, exp: 32 },
  { level: 15, hp: 165, attack: 21, defense: 9, exp: 62 },
  { level: 23, hp: 260, attack: 31, defense: 14, exp: 108 },
  { level: 32, hp: 400, attack: 45, defense: 21, exp: 178 },
  { level: 43, hp: 610, attack: 63, defense: 30, exp: 285 },
];

function build(): MonsterTemplate[] {
  const templates: MonsterTemplate[] = [];
  BIOMES.forEach((biome, index) => {
    const tier = TIER[index];
    const stem = worldSpriteStem(biome.species);
    biome.common.forEach((monster, order) => {
      // The second creature of each biome is the tougher one.
      const scale = order === 0 ? 0.72 : 1;
      templates.push({
        id: monster.id,
        name: monster.name,
        species: biome.species,
        stage: monster.stage,
        charId: `${stem}-${monster.stage}`,
        level: Math.max(1, Math.round(tier.level * scale)),
        hp: Math.round(tier.hp * scale),
        attack: Math.round(tier.attack * scale),
        defense: Math.round(tier.defense * scale),
        attackSpeed: order === 0 ? 20 : 24,
        moveSpeed: order === 0 ? 5 : 7,
        exp: Math.round(tier.exp * scale),
        vision: 6,
        leash: 12,
        isBoss: false,
        loot: [
          GOLD(0.85, 2 + index * 4, 12 + index * 14),
          { defId: biome.trophy, chance: 0.3, min: 1, max: 1 },
          { defId: "tonic", chance: 0.06, min: 1, max: 1 },
          { defId: "shard", chance: 0.22, min: 1, max: 1 + index },
        ],
      });
    });
    templates.push({
      id: biome.warden.id,
      name: biome.warden.name,
      species: biome.species,
      stage: "legend",
      charId: `${stem}-legend`,
      level: tier.level + 6,
      hp: Math.round(tier.hp * 4.2),
      attack: Math.round(tier.attack * 1.7),
      defense: Math.round(tier.defense * 1.6),
      attackSpeed: 26,
      moveSpeed: 8,
      exp: Math.round(tier.exp * 6),
      vision: 8,
      leash: 18,
      isBoss: true,
      loot: [
        GOLD(1, 60 + index * 90, 180 + index * 260),
        { defId: biome.trophy, chance: 1, min: 2, max: 4 },
        { defId: "evolution-crystal", chance: 1, min: 1, max: 1 },
        { defId: "warden-relic", chance: 0.14, min: 1, max: 1 },
        { defId: "greater-tonic", chance: 0.4, min: 1, max: 2 },
        { defId: index === 0 ? "caravan-sabre" : index < 3 ? "porter-mail" : "warden-glaive", chance: 0.12, min: 1, max: 1 },
      ],
    });
  });
  return templates;
}

const TEMPLATES = build();
const BY_ID = new Map(TEMPLATES.map((template) => [template.id, template]));

export const MONSTERS: readonly MonsterTemplate[] = TEMPLATES;

export function monsterTemplate(id: string): MonsterTemplate {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown monster: ${id}`);
  return found;
}

export function monstersOfZone(species: Species): MonsterTemplate[] {
  return TEMPLATES.filter((template) => template.species === species && !template.isBoss);
}

export function wardenOfZone(species: Species): MonsterTemplate {
  const found = TEMPLATES.find((template) => template.species === species && template.isBoss);
  if (!found) throw new Error(`No warden for ${species}`);
  return found;
}
