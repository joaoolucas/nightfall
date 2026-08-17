import type { Species } from "./portage";
import type { GroundKind } from "./world-engine";

export interface WangTile {
  id: string;
  name: string;
  corners: { NW: "lower" | "upper"; NE: "lower" | "upper"; SW: "lower" | "upper"; SE: "lower" | "upper" };
  imagePath: string;
}

export interface TilesetData {
  terrainTypes: ["lower", "upper"];
  tiles: WangTile[];
  tileSize: { width: number; height: number };
}

/**
 * A Wang set only carries two terrains, so it expresses the natural
 * ground↔trail transition. Plaza, water and hazard get their own seamless
 * textures overlaid on top (see OVERLAY_GROUND in world-art.ts) — mapping them
 * to "upper" here is what made every biome read as one flat paved surface.
 */
const TERRAIN_MAP: Record<GroundKind, "lower" | "upper"> = {
  ground: "lower",
  path: "upper",
  plaza: "upper",
  water: "lower",
  hazard: "lower",
};

function cornerKey(corners: WangTile["corners"]): string {
  return `${corners.NW}${corners.NE}${corners.SW}${corners.SE}`;
}

const CORNER_LOOKUP: Record<string, string> = {
  "lowerlowerlowerlower": "0",
  "upperlowerlowerlower": "1",
  "lowerupperlowerlower": "2",
  "upperupperlowerlower": "3",
  "lowerlowerupperlower": "4",
  "upperlowerupperlower": "5",
  "lowerupperupperlower": "6",
  "upperupperupperlower": "7",
  "lowerlowerlowerupper": "8",
  "upperlowerlowerupper": "9",
  "lowerupperlowerupper": "10",
  "upperupperlowerupper": "11",
  "lowerlowerupperupper": "12",
  "upperlowerupperupper": "13",
  "lowerupperupperupper": "14",
  "upperupperupperupper": "15",
};

const tilesetCache: Map<Species, TilesetData> = new Map();
const imageCache: Map<string, HTMLImageElement> = new Map();
/** In-flight loads, so concurrent callers share one request rather than racing. */
const tilesetPending: Map<Species, Promise<TilesetData>> = new Map();

export function loadTileset(zoneId: Species): Promise<TilesetData> {
  const ready = tilesetCache.get(zoneId);
  if (ready) return Promise.resolve(ready);
  const inFlight = tilesetPending.get(zoneId);
  if (inFlight) return inFlight;
  const task = fetchTileset(zoneId).finally(() => tilesetPending.delete(zoneId));
  tilesetPending.set(zoneId, task);
  return task;
}

async function fetchTileset(zoneId: Species): Promise<TilesetData> {
  const response = await fetch(`/game-assets/world/tilesets/${zoneId}/metadata.json`);
  if (!response.ok) throw new Error(`Failed to load tileset for ${zoneId}`);
  const data = await response.json();

  const tiles: WangTile[] = data.tiles.map((tile: any) => ({
    id: tile.id,
    name: tile.name,
    corners: tile.corners,
    imagePath: `/game-assets/world/tilesets/${zoneId}/wang_${tile.id}.png`,
  }));

  const tileset: TilesetData = {
    terrainTypes: data.terrainTypes,
    tiles,
    tileSize: data.tile_size,
  };

  tilesetCache.set(zoneId, tileset);

  // Sixteen tiles in parallel rather than one after another: loading them
  // sequentially made first paint of the ground wait on a full round-trip
  // chain, which is barely noticeable locally and very noticeable over a
  // real network.
  await Promise.all(
    tiles.map((tile) =>
      new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => { imageCache.set(tile.imagePath, image); resolve(); };
        image.onerror = () => resolve();
        image.src = tile.imagePath;
      }),
    ),
  );

  return tileset;
}

export function getTileImage(path: string): HTMLImageElement | undefined {
  return imageCache.get(path);
}

export function selectWangTile(
  tileset: TilesetData,
  map: { width: number; height: number; tiles: Array<{ kind: GroundKind }> },
  x: number,
  y: number
): WangTile | null {
  const getTerrain = (tx: number, ty: number): "lower" | "upper" => {
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return "lower";
    const tile = map.tiles[ty * map.width + tx];
    return TERRAIN_MAP[tile.kind] ?? "lower";
  };

  // Sample the 4 corners of this tile position
  // Each Wang tile covers a 2x2 corner grid
  const NW = getTerrain(x - 1, y - 1);
  const NE = getTerrain(x, y - 1);
  const SW = getTerrain(x - 1, y);
  const SE = getTerrain(x, y);

  const key = `${NW}${NE}${SW}${SE}`;
  const tileId = CORNER_LOOKUP[key] ?? "0";

  return tileset.tiles.find((t) => t.id === tileId) ?? tileset.tiles[0] ?? null;
}

export function preloadAllTilesets(zones: Species[]): Promise<TilesetData[]> {
  return Promise.all(zones.map((z) => loadTileset(z)));
}