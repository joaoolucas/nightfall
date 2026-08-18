/**
 * Texture atlas loading.
 *
 * Every frame the renderer draws comes from a packed sheet rather than its own
 * file. A biome used to ask the browser for several hundred PNGs on a cold
 * load, which is invisible against a local cache and left the world rendering
 * as coloured blocks for many seconds over a real network. Sheets are built by
 * scripts/build-atlas.mjs and committed alongside the source frames.
 */

const ROOT = "/game-assets/world/atlas";

export interface Sprite {
  image: HTMLImageElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AtlasData {
  image: HTMLImageElement;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
}

const atlases = new Map<string, AtlasData | null>();
const pending = new Map<string, Promise<void>>();

/** `name` is the path under the atlas root, e.g. "characters/wayfarer". */
export function loadAtlas(name: string): Promise<void> {
  const existing = pending.get(name);
  if (existing) return existing;
  const task = (async () => {
    try {
      const [meta, image] = await Promise.all([
        fetch(`${ROOT}/${name}.json`).then((response) => (response.ok ? response.json() : null)),
        new Promise<HTMLImageElement | null>((resolve) => {
          const element = new Image();
          element.onload = () => resolve(element);
          element.onerror = () => resolve(null);
          element.src = `${ROOT}/${name}.png`;
        }),
      ]);
      atlases.set(name, meta && image ? { image, frames: meta.frames } : null);
    } catch {
      atlases.set(name, null);
    }
  })();
  pending.set(name, task);
  return task;
}

export function isAtlasReady(name: string): boolean {
  return Boolean(atlases.get(name));
}

export function getSprite(name: string, frame: string): Sprite | undefined {
  const atlas = atlases.get(name);
  if (!atlas) return undefined;
  const rect = atlas.frames[frame];
  if (!rect) return undefined;
  return { image: atlas.image, x: rect.x, y: rect.y, w: rect.w, h: rect.h };
}

/** Draw a packed frame. The last four arguments are the destination rectangle. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  ctx.drawImage(sprite.image, sprite.x, sprite.y, sprite.w, sprite.h, Math.round(dx), Math.round(dy), dw, dh);
}

/** The URL of a whole sheet, for DOM elements that show one frame via CSS. */
export function atlasUrl(name: string): string {
  return `${ROOT}/${name}.png`;
}
