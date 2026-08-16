// PixelLab asset generator for Portage.fun creatures (STRK20).
// Usage: node --env-file=.env scripts/gen-assets.mjs [name...]
//   - no args: generates the full manifest
//   - name(s): generates only matching assets (e.g. `cinderling`, `background`)
import fs from "node:fs";
import path from "node:path";

const API = "https://api.pixellab.ai/v2";
const KEY = process.env.PIXELLAB_API_KEY;
const OUT_DIR = path.resolve("game-assets");

if (!KEY) {
  console.error("PIXELLAB_API_KEY not set (use: node --env-file=.env ...)");
  process.exit(1);
}

async function call(endpoint, body) {
  const res = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${endpoint} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`${endpoint} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

function saveBase64(image, outPath) {
  const b64 = String(image.base64 || "").replace(/^data:image\/\w+;base64,/, "");
  if (!b64) throw new Error("empty image base64");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
  const bytes = fs.statSync(outPath).size;
  console.log(`  saved ${outPath} (${bytes} bytes)`);
  return { base64: image.base64, format: image.format || "png" };
}

// ---- model helpers (all synchronous, return {image: base64}) ----

async function pixen({ description, size = [128, 128], noBackground = true, seed }) {
  const r = await call("/create-image-pixen", {
    description,
    image_size: { width: size[0], height: size[1] },
    no_background: noBackground,
    ...(seed != null ? { seed } : {}),
  });
  return r.image;
}

async function bitforge({ description, size = [128, 128], noBackground = true, styleImage, styleStrength = 60, negative }) {
  const r = await call("/create-image-bitforge", {
    description,
    image_size: { width: size[0], height: size[1] },
    no_background: noBackground,
    ...(negative ? { negative_description: negative } : {}),
    ...(styleImage ? { style_image: styleImage, style_strength: styleStrength } : {}),
  });
  return r.image;
}

async function pixfluxBackground({ description, size = [320, 180] }) {
  const r = await call("/create-image-pixflux-background", {
    description,
    image_size: { width: size[0], height: size[1] },
  });
  const jobId = r.background_job_id;
  if (!jobId) throw new Error("no background_job_id in response: " + JSON.stringify(r).slice(0, 300));
  // poll until completed
  for (let i = 0; i < 60; i++) {
    await new Promise((res) => setTimeout(res, 3000));
    const st = await fetch(`${API}/background-jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    }).then((x) => x.json());
    if (st.status === "completed") {
      return st.last_response?.image;
    }
    if (st.status === "failed") {
      throw new Error("background job failed: " + JSON.stringify(st).slice(0, 400));
    }
  }
  throw new Error("background job timed out: " + jobId);
}

// ---- manifest ----

const STYLE = "pixel art, 16-bit cozy creature, flat colors, bold clean silhouette, centered composition, crisp pixels, game asset, no text, no letters, soft rounded shapes, cute";

const CREATURES = [
  { id: "cinderling", biome: "Ember", desc: `small smoldering lizard creature, glowing ember scales, tiny flames on its back, ${STYLE}` },
  { id: "ripple", biome: "Creek", desc: `round droplet frog creature, translucent blue, rippling water swirl, ${STYLE}` },
  { id: "bramble", biome: "Grove", desc: `leafy fox creature, fur made of green leaves, curling vine tail, ${STYLE}` },
  { id: "shard", biome: "Stone", desc: `geode bear creature, rocky body with glowing crystal shards, ${STYLE}` },
  { id: "wisp", biome: "Mist", desc: `wispy moth creature, smoky purple body, glowing eyes, ${STYLE}` },
  { id: "aurora", biome: "Sky", desc: `feathered kite creature, iridescent aurora wings, ${STYLE}` },
];

// Evolution stages (Ember biome — Cinderling only, for v0)
const EVOLUTIONS = [
  { id: "cinderling-hatchling", desc: `tiny round baby smoldering lizard creature, glowing ember scales, cute, ${STYLE}` },
  { id: "cinderling-adult", desc: `small smoldering lizard creature, glowing ember scales, tiny flames on its back, ${STYLE}` },
  { id: "cinderling-legend", desc: `large majestic smoldering lizard creature, glowing ember scales, flames on its back, glowing crown and radiant aura, ${STYLE}` },
];

const ASSETS = [
  ...CREATURES.map((c) => ({
    id: c.id,
    kind: "pixen",
    out: path.join(OUT_DIR, "creatures", `${c.id}.png`),
    params: { description: c.desc, size: [128, 128], noBackground: true },
  })),
  ...EVOLUTIONS.map((c) => ({
    id: c.id,
    kind: "pixen",
    out: path.join(OUT_DIR, "creatures", `${c.id}.png`),
    params: { description: c.desc, size: [128, 128], noBackground: true },
  })),
  {
    id: "background",
    kind: "pixflux",
    out: path.join(OUT_DIR, "backgrounds", "portal-meadow.png"),
    params: {
      description: "pixel art cozy portal in a glowing meadow, swirling violet portal ring, fireflies, 16-bit game background",
      size: [320, 180],
    },
  },
];

async function runOne(asset) {
  console.log(`\n== ${asset.id} (${asset.kind}) ==`);
  console.log(`  prompt: ${asset.params.description.slice(0, 120)}...`);
  let image;
  if (asset.kind === "pixen") image = await pixen(asset.params);
  else if (asset.kind === "pixflux") image = await pixfluxBackground(asset.params);
  else if (asset.kind === "bitforge") image = await bitforge(asset.params);
  else throw new Error(`unknown kind ${asset.kind}`);
  return saveBase64(image, asset.out);
}

const filter = process.argv.slice(2).map((a) => a.toLowerCase());
const selected = filter.length ? ASSETS.filter((a) => filter.includes(a.id)) : ASSETS;

if (selected.length === 0) {
  console.error("No assets matched. Available:", ASSETS.map((a) => a.id).join(", "));
  process.exit(1);
}

console.log(`Generating ${selected.length} asset(s)...`);
let failed = 0;
for (const asset of selected) {
  try {
    await runOne(asset);
  } catch (e) {
    failed++;
    console.error(`  FAILED ${asset.id}: ${e.message}`);
  }
}
console.log(`\nDone. ${selected.length - failed}/${selected.length} ok.`);
process.exit(failed ? 1 : 0);
