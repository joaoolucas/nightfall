// Packs the generated world art into texture atlases.
//
// A character is up to ~61 individual PNGs and a biome shows a dozen
// characters, so a cold load asked the browser for several hundred files and
// the world rendered as coloured blocks for many seconds. One sheet per
// character turns that into one request each.
//
// Usage:
//   node scripts/build-atlas.mjs            # rebuild everything
//   node scripts/build-atlas.mjs --check    # report staleness, write nothing
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// sharp is a dependency of the app workspace, not of the repo root.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { default: sharp } = await import(pathToFileURL(path.join(REPO, "app/node_modules/sharp/dist/index.mjs")).href);

const ROOT = path.join(REPO, "app/public/game-assets/world");
const OUT = path.join(ROOT, "atlas");
const checkOnly = process.argv.includes("--check");

const CLIP_ORDER = ["idle", "walk", "attack", "hurt", "death"];

/** Every frame file in a character folder, in a stable order. */
function characterFrames(dir) {
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".png"));
  return files.sort((a, b) => {
    const rank = (name) => {
      const clip = CLIP_ORDER.findIndex((prefix) => name.startsWith(`${prefix}-`));
      return clip < 0 ? CLIP_ORDER.length : clip;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
  });
}

/**
 * Lay frames out in a square-ish grid. Frames are uniform for a given source,
 * so a fixed cell size is enough and no bin packing is needed.
 */
async function pack(name, entries, outDir) {
  if (!entries.length) return null;
  const first = await sharp(entries[0].file).metadata();
  const cell = Math.max(first.width ?? 0, first.height ?? 0);
  if (!cell) throw new Error(`${name}: could not read frame size`);

  const columns = Math.ceil(Math.sqrt(entries.length));
  const rows = Math.ceil(entries.length / columns);
  const frames = {};
  const composite = [];

  for (const [index, entry] of entries.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    composite.push({ input: entry.file, left: column * cell, top: row * cell });
    frames[entry.key] = { x: column * cell, y: row * cell, w: cell, h: cell };
  }

  fs.mkdirSync(outDir, { recursive: true });
  const imagePath = path.join(outDir, `${name}.png`);
  await sharp({
    create: { width: columns * cell, height: rows * cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composite)
    .png({ compressionLevel: 9 })
    .toFile(imagePath);

  fs.writeFileSync(
    path.join(outDir, `${name}.json`),
    `${JSON.stringify({ cell, columns, rows, count: entries.length, frames }, null, 0)}\n`,
  );
  return { imagePath, count: entries.length, bytes: fs.statSync(imagePath).size };
}

async function buildCharacters() {
  const base = path.join(ROOT, "characters");
  const ids = fs.readdirSync(base).filter((name) => fs.statSync(path.join(base, name)).isDirectory());
  let packed = 0;
  let frames = 0;
  for (const id of ids) {
    const dir = path.join(base, id);
    const entries = characterFrames(dir).map((file) => ({
      // Key is the frame's basename, which is exactly what the renderer asks for.
      key: file.replace(/\.png$/, ""),
      file: path.join(dir, file),
    }));
    if (checkOnly) { packed += 1; frames += entries.length; continue; }
    const result = await pack(id, entries, path.join(OUT, "characters"));
    if (result) { packed += 1; frames += result.count; }
  }
  console.log(`  characters: ${packed} atlases, ${frames} frames`);
}

async function buildItems() {
  const dir = path.join(ROOT, "items");
  if (!fs.existsSync(dir)) return console.log("  items: none");
  const entries = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((file) => ({ key: file.replace(/\.png$/, ""), file: path.join(dir, file) }));
  if (checkOnly) return console.log(`  items: ${entries.length} frames`);
  const result = await pack("items", entries, OUT);
  console.log(`  items: 1 atlas, ${result?.count ?? 0} frames`);
}

async function buildTiles() {
  const base = path.join(ROOT, "tilesets");
  if (!fs.existsSync(base)) return console.log("  tilesets: none");
  const biomes = fs.readdirSync(base).filter((name) => fs.statSync(path.join(base, name)).isDirectory());
  let packed = 0;
  for (const biome of biomes) {
    const dir = path.join(base, biome);
    const entries = fs.readdirSync(dir)
      .filter((name) => /^wang_\d+\.png$/.test(name))
      // Numeric order, so wang_10 does not sort between wang_1 and wang_2.
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
      .map((file) => ({ key: file.replace(/\.png$/, ""), file: path.join(dir, file) }));
    if (checkOnly) { packed += 1; continue; }
    await pack(biome, entries, path.join(OUT, "tilesets"));
    packed += 1;
  }
  console.log(`  tilesets: ${packed} atlases`);
}

console.log(checkOnly ? "Atlas check:" : "Building atlases...");
await buildCharacters();
await buildItems();
await buildTiles();
if (!checkOnly) {
  const total = fs.readdirSync(path.join(OUT, "characters")).filter((f) => f.endsWith(".png")).length;
  console.log(`\nDone. ${total} character sheets in ${path.relative(process.cwd(), OUT)}.`);
}
