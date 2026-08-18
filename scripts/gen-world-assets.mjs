// PixelLab v2 world-art pipeline for Portage.fun.
//
// Generates game-ready high top-down assets directly into app/public:
//   - 8-direction Porter, NPC and creature characters
//   - cardinal walking animations where gameplay needs them
//   - seamless biome terrain tiles
//   - biome-specific props, structures and combat effects
//
// Usage:
//   node --env-file=.env scripts/gen-world-assets.mjs --dry-run
//   node --env-file=.env scripts/gen-world-assets.mjs --group characters
//   node --env-file=.env scripts/gen-world-assets.mjs --group environment
//   node --env-file=.env scripts/gen-world-assets.mjs --all
//   node --env-file=.env scripts/gen-world-assets.mjs --only wayfarer,cinderling-adult
//
// The script is resumable. IDs and prompts are persisted in pixellab-state.json.
import fs from "node:fs";
import path from "node:path";

const API = "https://api.pixellab.ai/v2";
const KEY = process.env.PIXELLAB_API_KEY;
const ROOT = path.resolve("app/public/game-assets/world");
const STATE_PATH = path.join(ROOT, "pixellab-state.json");
const DIRECTIONS = ["south", "north", "east", "west", "south-east", "south-west", "north-east", "north-west"];
const CARDINAL = ["south", "north", "east", "west"];
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const estimate = args.includes("--estimate");
const runAll = args.includes("--all") || !args.some((arg) => arg.startsWith("--group") || arg.startsWith("--only"));
const option = (name) => {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
};
const groups = new Set((option("--group") ?? "").split(",").filter(Boolean));
const regenerate = new Set((option("--regenerate") ?? "").split(",").filter(Boolean));
const only = new Set((option("--only") ?? "").split(",").filter(Boolean));

if (!dryRun && !estimate && !KEY) {
  console.error("PIXELLAB_API_KEY not set. Use: node --env-file=.env scripts/gen-world-assets.mjs ...");
  process.exit(1);
}

const STYLE = "original Portage.fun game asset, crisp 16-bit pixel art, high top-down RPG camera, cozy dark-fantasy caravan aesthetic, deep violet shadows, warm amber highlights, limited harmonious palette, single dark plum outline, medium detail, clean readable silhouette, no text, no letters, no logo, no copyrighted character";
const CHARACTER_STYLE = `${STYLE}, centered full-body sprite, transparent background, game-ready directional character`;
const TILE_STYLE = `${STYLE}, seamless square terrain texture, orthographic top-down tile, edge-to-edge texture, no objects, no perspective, no border`;

const NPCS = [
  { id: "wayfarer", name: "Portage Wayfarer", desc: "young caravan explorer wearing a deep violet hooded travel cloak, warm amber scarf, leather satchel, sturdy boots, small glowing portal compass at belt, no weapon", template: "mannequin", animate: true, seed: 51021, existingId: "3ed4671b-ce5e-4b63-b4b7-af8b9e832bf1" },
  { id: "healer-mira", name: "Mira", desc: "kind caravan healer wearing cream and rose travel robes, small medicine satchel, silver hair, gentle teal healing charm", template: "mannequin", seed: 51031 },
  { id: "quartermaster-orin", name: "Orin", desc: "sturdy caravan quartermaster in brown leather apron and violet tunic, supply ledger at belt, short copper hair", template: "mannequin", seed: 51032 },
  { id: "pathfinder-tavi", name: "Tavi", desc: "agile caravan pathfinder in moss green hood and layered travel leathers, rolled route map, amber compass", template: "mannequin", seed: 51033 },
  { id: "scout-sable", name: "Sable", desc: "watchful Warden scout in charcoal cloak with violet trim, crystal spyglass, pale braided hair", template: "mannequin", seed: 51034 },
  { id: "wayfarer-blue", name: "Blue Wayfarer", desc: "caravan traveler in indigo blue hooded cloak, pale scarf and compact travel pack", template: "mannequin", seed: 51035 },
  { id: "wayfarer-green", name: "Green Wayfarer", desc: "caravan traveler in forest green hooded cloak, gold scarf and bedroll", template: "mannequin", seed: 51036 },
  { id: "wayfarer-red", name: "Red Wayfarer", desc: "caravan traveler in brick red hooded cloak, cream scarf and small satchel", template: "mannequin", seed: 51037 },
];

const SPECIES = [
  { id: "cinderling", template: "dog", desc: "smoldering salamander companion, glowing ember scales, broad lizard head, little flames along its back, on all fours" },
  { id: "ripple", template: "bear", desc: "round water frog companion, translucent blue body, huge kind eyes, rippling water collar, squat on all fours" },
  { id: "bramble", template: "dog", desc: "leafy fox companion, green leaf fur, cream face, curling living vine tail, on all fours" },
  { id: "shard", template: "bear", desc: "round geode bear companion, stone plates and violet crystal growths, on all fours" },
  { id: "wisp", template: "cat", desc: "small shadow moth companion, smoky purple round body, luminous gold eyes, tiny mist wings, hovering just above ground" },
  { id: "aurora", template: "mannequin", desc: "mystical feathered kite companion, pearly body, wide iridescent aurora wings, floating above ground" },
];
const STAGES = [
  { id: "hatchling", detail: "tiny cute baby form with simple rounded proportions", seed: 1 },
  { id: "adult", detail: "fully grown animal with a heavy readable silhouette", seed: 2 },
  { id: "legend", detail: "majestic evolved form with radiant elemental crown and larger silhouette", seed: 3 },
];
/**
 * Beast species need this spelled out. "on all fours" alone was not enough:
 * the generator still produced upright, bearded, human-faced figures for the
 * salamander and the geode bear, because nothing in the prompt ruled a person
 * out. Aurora is deliberately exempt — it is built on the humanoid skeleton.
 */
const BEAST_CLAUSE = "a four-legged animal seen from above, all four feet on the ground, animal head with a muzzle, no human face, no beard, no arms, no hands, not anthropomorphic, not bipedal, not humanoid, not a person";

const CREATURES = SPECIES.flatMap((species, speciesIndex) => STAGES.map((stage) => ({
  id: `${species.id}-${stage.id}`,
  name: `${species.id} ${stage.id}`,
  desc: species.template === "mannequin"
    ? `${stage.detail}, ${species.desc}`
    : `${stage.detail}, ${species.desc}, ${BEAST_CLAUSE}`,
  template: species.template,
  animate: true,
  seed: 52000 + speciesIndex * 20 + stage.seed,
})));
const CHARACTERS = [...NPCS, ...CREATURES].map((entry) => ({ ...entry, group: "characters", description: `${entry.desc}, ${CHARACTER_STYLE}` }));

/**
 * What each character needs to animate for tile combat.
 *
 * Animation templates are per skeleton, not global — probed against the live
 * API, these are the sets actually on offer:
 *
 *   mannequin  cross-punch, taking-punch, falling-back-death, breathing-idle, walking-4-frames
 *   dog        bark, idle, sneaking, fast-walk, walk-4-frames        (no attack, no death)
 *   bear       attack-left, attack-right, jump-attack, angry, idle-long, walk-4-frames
 *   cat        angry, jump, idle, licking, walk-4-frames             (no attack, no death)
 *
 * So beasts borrow a lunge — `bark` for dogs, `angry` for cats — as their
 * attack. None of them get a death clip, which is authentic rather than a
 * compromise: in this genre a slain creature is simply replaced by its corpse.
 */
const SKELETON_ANIMATIONS = {
  mannequin: { walk: ["walking-4-frames", "walk"], attack: ["cross-punch", "lead-jab"], hurt: ["taking-punch"], death: ["falling-back-death"] },
  dog: { walk: ["walk-4-frames"], attack: ["bark"], hurt: [], death: [] },
  bear: { walk: ["walk-4-frames"], attack: ["attack-left", "jump-attack"], hurt: ["angry"], death: [] },
  cat: { walk: ["walk-4-frames"], attack: ["angry", "jump"], hurt: [], death: [] },
};

/**
 * State written before animations were generalised only recorded `walk_complete`.
 * Honouring it keeps a resumed run from re-billing 16 frames per character.
 */
function isAnimationComplete(record, name) {
  if (!record) return false;
  if (record.animations?.[name]?.complete) return true;
  return name === "walk" && record.walk_complete === true;
}

function animationPlan(asset) {
  const set = SKELETON_ANIMATIONS[asset.template] ?? SKELETON_ANIMATIONS.mannequin;
  // Hurt and death play facing the camera only: a four-direction clip costs
  // four times as much and is barely readable at this sprite size.
  const steps = [
    { name: "walk", seedOffset: 1, directions: CARDINAL, templates: set.walk },
    { name: "attack", seedOffset: 2, directions: CARDINAL, templates: set.attack },
    { name: "hurt", seedOffset: 3, directions: ["south"], templates: set.hurt },
    { name: "death", seedOffset: 4, directions: ["south"], templates: set.death },
  ];
  return steps.filter((step) => step.templates.length > 0);
}

const BIOMES = [
  { id: "ember", terrain: "charcoal volcanic earth with burnt umber stones and faint orange ember flecks", path: "worn warm brown ash trail with small charcoal pebbles", plaza: "orderly burgundy stone pavers with subtle brass seams", liquid: "slow glowing red-orange lava surface with dark cooling crust", hazard: "black obsidian fissure with hot orange cracks", palette: "charcoal, burnt umber, burgundy, ember orange" },
  { id: "creek", terrain: "lush teal riverbank grass with tiny wet leaves", path: "smooth mossy stepping stones and packed river silt", plaza: "pale blue-gray ferry-station pavers with water-worn edges", liquid: "clear flowing blue creek water with soft white ripples", hazard: "deep navy fast current with pale foam", palette: "teal, river blue, moss green, pale stone" },
  { id: "grove", terrain: "dense emerald forest floor with clover and scattered leaves", path: "warm ochre woodland dirt with roots and leaf litter", plaza: "living root-woven wooden pavers with green moss seams", liquid: "dark green woodland pond water with small lily reflections", hazard: "thorny root tangle covering dark soil", palette: "emerald, moss, bark brown, firefly gold" },
  { id: "stone", terrain: "cool gray cave floor with tiny violet mineral specks", path: "flattened slate trail with pale worn edges", plaza: "precise geode-cut stone pavers with violet crystal seams", liquid: "deep underground cobalt pool with mineral shimmer", hazard: "bottomless dark chasm edged by fractured slate", palette: "slate gray, violet crystal, cobalt, silver" },
  { id: "mist", terrain: "dusky blue-gray marsh grass under thin lavender fog", path: "raised weathered timber and muted gray mud trail", plaza: "moonlit violet stone pavers with fog-softened seams", liquid: "inky indigo marsh water with pale ghostly wisps", hazard: "dense magical violet fog vortex over black marsh", palette: "indigo, lavender, blue gray, ghostlight" },
  { id: "sky", terrain: "soft turquoise floating-island grass with tiny golden flowers", path: "pale sunlit sandstone trail with wind-swept edges", plaza: "ivory and blue celestial pavers with gold seams", liquid: "bright reflective sky pool with aurora colors", hazard: "deep starry blue open sky void with drifting cloud edges", palette: "turquoise, ivory, aurora violet, sunlight gold" },
];
const TILE_DESCRIPTIONS = [
  ["ground", "terrain"], ["path", "path"], ["plaza", "plaza"], ["water", "liquid"], ["hazard", "hazard"],
];
const PROP_DESCRIPTIONS = {
  tree: "biome tree with trunk and broad canopy, readable from high top-down, transparent background",
  rock: "cluster of natural biome rocks, readable from high top-down, transparent background",
  crystal: "glowing elemental waypoint crystal on a small stone base, transparent background",
  shrub: "small biome shrub and ground foliage cluster, transparent background",
  lantern: "caravan trail lantern on a short dark metal post, warm amber glow, transparent background",
  ruin: "small broken ancient portal-stone ruin, weathered and mossy, transparent background",
};
const STRUCTURE_DESCRIPTIONS = {
  lodge: "complete Portage caravan lodge building seen from high top-down, violet timber walls, warm windows, amber roof trim, central dark doorway, transparent background, isolated building",
  tent: "small caravan supply tent seen from high top-down, burgundy canvas, amber support pole, travel crates, transparent background, isolated structure",
};

const ENVIRONMENT = [];
for (const [biomeIndex, biome] of BIOMES.entries()) {
  for (const [id, field] of TILE_DESCRIPTIONS) ENVIRONMENT.push({ id: `${biome.id}-tile-${id}`, group: "environment", kind: "pixen", out: `tiles/${biome.id}/${id}.png`, size: [32, 32], noBackground: false, seed: 53000 + biomeIndex * 100 + TILE_DESCRIPTIONS.findIndex(([key]) => key === id), description: `${biome[field]}, palette ${biome.palette}, ${TILE_STYLE}` });
  Object.entries(PROP_DESCRIPTIONS).forEach(([id, description], index) => ENVIRONMENT.push({ id: `${biome.id}-prop-${id}`, group: "environment", kind: "pixen", out: `props/${biome.id}/${id}.png`, size: [64, 64], noBackground: true, seed: 54000 + biomeIndex * 100 + index, description: `${description}, adapted to ${biome.id} biome, palette ${biome.palette}, ${STYLE}` }));
  Object.entries(STRUCTURE_DESCRIPTIONS).forEach(([id, description], index) => ENVIRONMENT.push({ id: `${biome.id}-structure-${id}`, group: "environment", kind: "pixen", out: `structures/${biome.id}/${id}.png`, size: id === "lodge" ? [224, 128] : [96, 96], noBackground: true, seed: 55000 + biomeIndex * 100 + index, description: `${description}, adapted to ${biome.id} biome, palette ${biome.palette}, ${STYLE}` }));
  ENVIRONMENT.push({ id: `${biome.id}-impact`, group: "environment", kind: "pixen", out: `effects/${biome.id}-impact.png`, size: [64, 64], noBackground: true, seed: 56000 + biomeIndex, description: `single elemental combat impact burst for ${biome.id} biome, four-frame feeling condensed into one effect sprite, transparent background, palette ${biome.palette}, ${STYLE}` });
}

// Carryable items, drawn from directly overhead so they read on a floor tile
// and in an inventory slot alike. Ids mirror the `sprite` field in
// app/src/game/world/items.ts.
const ITEM_STYLE = `${STYLE}, single small object seen from directly above, centered, transparent background, inventory icon, no shadow on the ground, no scene`;
const ITEM_DESCRIPTIONS = [
  ["gold", "a small heap of gold coins"],
  ["shard", "a glowing violet portal shard crystal"],
  ["tonic", "a small round flask of warm amber healing tonic with a cork"],
  ["greater-tonic", "a large ornate flask of bright rose healing tonic with a gold collar"],
  ["worn-blade", "a short chipped iron shortsword with a leather-wrapped grip"],
  ["caravan-sabre", "a curved steel sabre with a brass guard and violet cord"],
  ["warden-glaive", "an ornate glaive with a long dark haft and a glowing amber blade"],
  ["travel-cloak", "a folded deep violet hooded travel cloak"],
  ["porter-mail", "a folded set of riveted steel chain mail"],
  ["warden-plate", "a polished ornate breastplate with amber trim"],
  ["ember-charm", "a small amber amulet on a dark cord, faintly glowing"],
  ["evolution-crystal", "a bright faceted evolution crystal, radiant violet"],
  ["warden-relic", "an ancient carved stone relic disc with glowing runes"],
  ["ash-carapace", "a charred insect carapace plate, dark grey with ember cracks"],
  ["creek-pearl", "a smooth iridescent river pearl"],
  ["root-heart", "a knotted green root bulb with a faint golden glow"],
  ["geode-core", "a split grey geode with violet crystal inside"],
  ["veil-dust", "a tiny stoppered vial of glowing lavender dust"],
  ["aurora-quill", "a long iridescent feather quill with aurora colours"],
];
const ITEMS = ITEM_DESCRIPTIONS.map(([id, description], index) => ({
  id: `item-${id}`,
  group: "items",
  kind: "pixen",
  out: `items/${id}.png`,
  size: [32, 32],
  noBackground: true,
  seed: 57000 + index,
  description: `${description}, ${ITEM_STYLE}`,
}));

const CATALOG = [...CHARACTERS, ...ENVIRONMENT, ...ITEMS];
const selected = CATALOG.filter((asset) => {
  if (regenerate.size) return regenerate.has(asset.id);
  if (only.size) return only.has(asset.id);
  if (runAll) return true;
  return groups.has(asset.group);
});

function loadState() {
  fs.mkdirSync(ROOT, { recursive: true });
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); } catch { return { version: 1, generated_at: null, characters: {}, assets: {} }; }
}
const state = loadState();
function saveState() {
  state.generated_at = new Date().toISOString();
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

async function api(endpoint, body, method = "POST") {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(`${API}${endpoint}`, {
        method,
        headers: { Authorization: `Bearer ${KEY}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`${endpoint} HTTP ${response.status}: ${text.slice(0, 300)}`); }
      if (response.ok) return data;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 6) throw new Error(`${endpoint} HTTP ${response.status}: ${JSON.stringify(data).slice(0, 600)}`);
      lastError = new Error(`${endpoint} HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 6) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(20_000, 2_000 * attempt)));
  }
  throw lastError;
}

async function pollJobs(jobIds, label, maxMinutes = 25) {
  const pending = new Set(jobIds.filter(Boolean));
  const failed = [];
  const started = Date.now();
  while (pending.size && Date.now() - started < maxMinutes * 60_000) {
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    for (const id of [...pending]) {
      const job = await api(`/background-jobs/${id}`, null, "GET");
      if (job.status === "completed") pending.delete(id);
      if (job.status === "failed") { pending.delete(id); failed.push({ id, error: job.error ?? job.last_response }); }
    }
    process.stdout.write(`\r  ${label}: ${jobIds.length - pending.size}/${jobIds.length} complete`);
  }
  process.stdout.write("\n");
  if (pending.size) throw new Error(`${label}: timed out with ${pending.size} jobs pending`);
  if (failed.length) throw new Error(`${label}: ${failed.length} failed: ${JSON.stringify(failed).slice(0, 800)}`);
}

async function download(url, destination) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`download ${response.status}: ${url}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
    }
  }
  throw lastError;
}

async function createCharacter(asset) {
  // A regenerated character must forget its stored id and every frame on disk,
  // or the API hands back the same sprite and the new prompt does nothing.
  if (regenerate.has(asset.id)) {
    delete state.characters[asset.id];
    fs.rmSync(path.join(ROOT, "characters", asset.id), { recursive: true, force: true });
    asset = { ...asset, existingId: undefined, seed: asset.seed + 900 };
    saveState();
  }
  const previous = state.characters[asset.id];
  const localMeta = path.join(ROOT, "characters", asset.id, "pixellab.json");
  let characterId = previous?.character_id ?? asset.existingId;
  if (!characterId && fs.existsSync(localMeta)) characterId = JSON.parse(fs.readFileSync(localMeta, "utf8")).character_id;
  if (!characterId) {
    const result = await api("/create-character-v3", {
      description: asset.description,
      image_size: { width: 48, height: 48 },
      view: "high top-down",
      template_id: asset.template,
      name: asset.name,
      seed: asset.seed,
      no_background: true,
      outline: "single color dark plum outline",
      detail: "medium detail",
      enhance_prompt: false,
    });
    characterId = result.character_id;
    state.characters[asset.id] = { character_id: characterId, create_job_id: result.background_job_id, prompt: asset.description, template: asset.template, seed: asset.seed, status: "pending" };
    saveState();
    return { asset, characterId, jobId: result.background_job_id, created: true };
  }
  state.characters[asset.id] = { ...previous, character_id: characterId, prompt: asset.description, template: asset.template, seed: asset.seed };
  saveState();
  return { asset, characterId, jobId: previous?.status === "pending" ? previous.create_job_id : null, created: false };
}

async function syncCharacter({ asset, characterId }) {
  const detail = await api(`/characters/${characterId}`, null, "GET");
  if (detail.status !== "completed" || !detail.rotation_urls) throw new Error(`${asset.id}: character not complete (${detail.status})`);
  const out = path.join(ROOT, "characters", asset.id);
  for (const direction of DIRECTIONS) if (detail.rotation_urls[direction]) await download(detail.rotation_urls[direction], path.join(out, `idle-${direction}.png`));
  state.characters[asset.id] = { ...state.characters[asset.id], character_id: characterId, status: "completed", size: detail.size, view: detail.view };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "pixellab.json"), `${JSON.stringify({ character_id: characterId, name: detail.name, prompt: detail.prompt, size: detail.size, view: detail.view }, null, 2)}\n`);
  saveState();

  if (!asset.animate) return;
  await syncAnimations(asset, characterId, detail, out);
}

/**
 * Generate and download every animation in the character's plan.
 *
 * `templates` is a preference list because template availability depends on the
 * character's skeleton — `cross-punch` exists for humanoids, `attack` for
 * quadrupeds — and the API only rejects the mismatch at submit time.
 */
async function syncAnimations(asset, characterId, detail, out) {
  const plan = animationPlan(asset);
  const record = state.characters[asset.id];
  record.animations = record.animations ?? {};
  let current = detail;

  for (const step of plan) {
    if (isAnimationComplete(record, step.name)) continue;
    let clip = current.animations?.find((animation) => step.templates.includes(animation.animation_type));
    if (!clip) {
      const template = await submitAnimation(asset, characterId, step);
      if (!template) {
        console.warn(`  ! ${asset.id}: no usable template for "${step.name}" (tried ${step.templates.join(", ")})`);
        record.animations[step.name] = { complete: false, skipped: true };
        saveState();
        continue;
      }
      current = await api(`/characters/${characterId}`, null, "GET");
      clip = current.animations?.find((animation) => animation.animation_type === template);
    }
    if (!clip) {
      record.animations[step.name] = { complete: false, skipped: true };
      saveState();
      continue;
    }
    for (const direction of clip.directions) {
      for (let index = 0; index < direction.frames.length; index += 1) {
        await download(direction.frames[index], path.join(out, `${step.name}-${direction.direction}-${index}.png`));
      }
    }
    record.animations[step.name] = {
      complete: true,
      template: clip.animation_type,
      directions: clip.directions.map((direction) => direction.direction),
      frames: clip.directions[0]?.frames.length ?? 0,
    };
    // The walk cycle keeps its historical flag so older state files stay valid.
    if (step.name === "walk") record.walk_complete = true;
    saveState();
    writeManifest(asset, out);
  }
  writeManifest(asset, out);
}

/**
 * Frame counts differ per template — `cross-punch` yields six frames where
 * `walk-4-frames` yields four — so the client reads them from the character's
 * own manifest instead of assuming a fixed length.
 */
function writeManifest(asset, out) {
  const record = state.characters[asset.id] ?? {};
  const metaPath = path.join(out, "pixellab.json");
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(metaPath, "utf8")); } catch { /* first write */ }
  const animations = {};
  for (const [name, entry] of Object.entries(record.animations ?? {})) {
    if (!entry.complete) continue;
    animations[name] = { directions: entry.directions, frames: entry.frames, template: entry.template };
  }
  if (record.walk_complete && !animations.walk) {
    animations.walk = { directions: CARDINAL, frames: 4, template: "walk-4-frames" };
  }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(metaPath, `${JSON.stringify({ ...meta, animations }, null, 2)}\n`);
}

async function submitAnimation(asset, characterId, step) {
  for (const template of step.templates) {
    try {
      const animation = await api("/characters/animations", {
        character_id: characterId,
        animation_name: step.name,
        template_animation_id: template,
        mode: "template",
        directions: step.directions,
        async_mode: true,
        seed: asset.seed + step.seedOffset,
      });
      await pollJobs(animation.background_job_ids, `${asset.id} ${step.name}`, 20);
      return template;
    } catch (error) {
      // A skeleton mismatch is expected while walking the preference list.
      if (!/template|skeleton|not supported|invalid/i.test(String(error.message))) throw error;
    }
  }
  return null;
}

async function createStatic(asset) {
  const destination = path.join(ROOT, asset.out);
  if (fs.existsSync(destination) && state.assets[asset.id]?.status === "completed") return console.log(`  skip ${asset.id}`);
  const result = await api("/create-image-pixen", {
    description: asset.description,
    image_size: { width: asset.size[0], height: asset.size[1] },
    no_background: asset.noBackground,
    seed: asset.seed,
  });
  const raw = String(result.image?.base64 ?? "").replace(/^data:image\/\w+;base64,/, "");
  if (!raw) throw new Error(`${asset.id}: PixelLab returned no image`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(raw, "base64"));
  state.assets[asset.id] = { status: "completed", prompt: asset.description, seed: asset.seed, size: asset.size, output: asset.out };
  saveState();
  console.log(`  saved ${asset.out}`);
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await fn(items[index], index); }
  });
  await Promise.all(workers);
  return results;
}

console.log(`PixelLab world pipeline: ${selected.length}/${CATALOG.length} assets selected${dryRun ? " (dry run)" : ""}.`);
for (const asset of selected) console.log(`  ${asset.group.padEnd(11)} ${asset.id}`);

if (args.includes("--manifests")) {
  // Rewrite pixellab.json from persisted state. Costs nothing and repairs
  // manifests for characters generated before they were introduced.
  let written = 0;
  for (const asset of selected) {
    if (asset.group !== "characters") continue;
    if (!state.characters[asset.id]) continue;
    writeManifest(asset, path.join(ROOT, "characters", asset.id));
    written += 1;
  }
  console.log(`\nRewrote ${written} character manifests.`);
  process.exit(0);
}

if (estimate) {
  // Measured against the live balance: generating the Wayfarer's attack
  // (4 directions x 6 frames) plus hurt (1 x 6) produced 30 images and cost
  // 5 generations. The plan bills per direction-clip, not per frame.
  let rotations = 0;
  let clips = 0;
  let statics = 0;
  for (const asset of selected) {
    if (asset.group !== "characters") { statics += 1; continue; }
    const known = state.characters[asset.id];
    if (!known?.character_id && !asset.existingId) rotations += DIRECTIONS.length;
    if (!asset.animate) continue;
    for (const step of animationPlan(asset)) {
      if (isAnimationComplete(known, step.name)) continue;
      clips += step.directions.length;
    }
  }
  const total = rotations + clips + statics;
  console.log(`\nEstimated generations`);
  console.log(`  character rotations  ${rotations}`);
  console.log(`  animation clips      ${clips}`);
  console.log(`  static assets        ${statics}`);
  console.log(`  TOTAL                ${total}`);
  if (KEY) {
    const balance = await api("/balance", null, "GET");
    const left = balance.subscription?.generations ?? 0;
    console.log(`  remaining on plan    ${left}`);
    console.log(total > left ? `  ⚠ short by ${Math.ceil(total - left)} generations` : `  ✓ fits, ${Math.floor(left - total)} left over`);
  }
  process.exit(0);
}
if (dryRun) process.exit(0);

const characterAssets = selected.filter((asset) => asset.group === "characters");
const environmentAssets = selected.filter((asset) => asset.group === "environment" || asset.group === "items");
if (characterAssets.length) {
  console.log(`\nCreating/resuming ${characterAssets.length} directional characters...`);
  // Tier 1 allows eight background jobs. Clear jobs left by an interrupted run,
  // then submit rotation batches below that ceiling.
  const resumedJobs = characterAssets.map((asset) => state.characters[asset.id]?.status === "pending" ? state.characters[asset.id]?.create_job_id : null).filter(Boolean);
  if (resumedJobs.length) await pollJobs(resumedJobs, "resumed character rotations", 30);
  const characters = [];
  for (let offset = 0; offset < characterAssets.length; offset += 6) {
    const batch = await mapLimit(characterAssets.slice(offset, offset + 6), 3, createCharacter);
    const createJobs = batch.map((entry) => entry.jobId).filter(Boolean);
    if (createJobs.length) await pollJobs(createJobs, `character rotations ${offset + 1}-${offset + batch.length}`, 30);
    characters.push(...batch);
  }
  console.log("Downloading rotations and generating cardinal walk cycles...");
  // Two characters × four cardinal animation jobs = the eight-job plan cap.
  await mapLimit(characters, 2, async (entry) => {
    console.log(`  sync ${entry.asset.id}`);
    await syncCharacter(entry);
  });
}
if (environmentAssets.length) {
  console.log(`\nGenerating ${environmentAssets.length} environment assets...`);
  await mapLimit(environmentAssets, 3, createStatic);
}
const balance = await api("/balance", null, "GET");
console.log(`\nDone. Remaining PixelLab balance: ${JSON.stringify(balance)}`);
