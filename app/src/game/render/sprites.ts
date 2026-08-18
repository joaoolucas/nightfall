import {
  characterIdlePath,
  getImage,
  loadAll,
  loadImage,
  type CharacterId,
} from "@/utils/world-art";
import type { Direction8 } from "../core/grid";
import { cardinalOf } from "../core/grid";
import type { EntityState } from "../core/types";

/**
 * Animation lookup driven by each character's generated manifest.
 *
 * Frame counts differ per template — `cross-punch` yields six frames where
 * `walk-4-frames` yields four — and beasts have no attack or death clip at all,
 * because their skeletons do not offer one. Reading the manifest instead of
 * assuming a shape is what keeps the renderer correct as art lands
 * incrementally, and what lets it fall back cleanly where a clip is missing.
 */

export type ClipName = "walk" | "attack" | "hurt" | "death";

export interface AnimationClip {
  directions: string[];
  frames: number;
  template: string;
}

export interface CharacterManifest {
  animations: Partial<Record<ClipName, AnimationClip>>;
}

const ROOT = "/game-assets/world/characters";
const manifests = new Map<CharacterId, CharacterManifest | null>();
const pending = new Map<CharacterId, Promise<void>>();

export function manifestOf(id: CharacterId): CharacterManifest | null {
  return manifests.get(id) ?? null;
}

const IDLE_DIRECTIONS = [
  "south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west",
] as const;

/**
 * Load a character in two phases.
 *
 * A full character is roughly forty-six frames, and a biome shows a dozen
 * characters — over five hundred images. Requesting them all at once put the
 * eight idle sprites that make a creature visible at all behind four hundred
 * animation frames in the browser's queue, so the world took half a minute to
 * stop rendering as coloured blocks. Idle frames now resolve first and the
 * clips stream in behind them; resolveFrame already falls back to idle for any
 * clip that has not arrived.
 */
export function loadCharacter(id: CharacterId): Promise<void> {
  const existing = pending.get(id);
  if (existing) return existing;
  const task = (async () => {
    // Phase one: the eight rotation frames. Enough to draw the character.
    await loadAll(IDLE_DIRECTIONS.map((direction) => `${ROOT}/${id}/idle-${direction}.png`));

    let manifest: CharacterManifest | null = null;
    try {
      const response = await fetch(`${ROOT}/${id}/pixellab.json`);
      if (response.ok) {
        const data = (await response.json()) as CharacterManifest;
        manifest = { animations: data.animations ?? {} };
      }
    } catch {
      manifest = null;
    }
    manifests.set(id, manifest);

    // Phase two: animation clips, deliberately not awaited by the caller.
    const clips = new Set<string>();
    for (const [name, clip] of Object.entries(manifest?.animations ?? {})) {
      for (const direction of clip.directions) {
        for (let frame = 0; frame < clip.frames; frame += 1) {
          clips.add(`${ROOT}/${id}/${name}-${direction}-${frame}.png`);
        }
      }
    }
    void loadAll(clips);
  })();
  pending.set(id, task);
  return task;
}

function clipFrame(id: CharacterId, name: ClipName, direction: Direction8, phase: number): string | null {
  const clip = manifestOf(id)?.animations?.[name];
  if (!clip || clip.frames <= 0) return null;
  // Clips are authored for the cardinals; a diagonal borrows its dominant axis.
  const wanted = cardinalOf(direction);
  const used = clip.directions.includes(wanted) ? wanted : clip.directions[0];
  if (!used) return null;
  const index = Math.min(clip.frames - 1, Math.max(0, Math.floor(phase * clip.frames)));
  return `${ROOT}/${id}/${name}-${used}-${index}.png`;
}

export interface FrameRequest {
  id: CharacterId;
  state: EntityState;
  direction: Direction8;
  /** 0..1 through the current non-looping clip (attack, hurt, death). */
  phase: number;
  /** Milliseconds, for looping clips. */
  now: number;
}

/**
 * Resolve the sprite to draw. Falls back down the chain
 * clip → idle for the direction → idle facing south, so a character with only
 * a rotation set still renders.
 */
export function resolveFrame(request: FrameRequest): HTMLImageElement | undefined {
  const { id, state, direction, phase, now } = request;
  const candidates: string[] = [];

  if (state === "attacking") {
    const frame = clipFrame(id, "attack", direction, phase);
    if (frame) candidates.push(frame);
  } else if (state === "hurt") {
    const frame = clipFrame(id, "hurt", direction, phase);
    if (frame) candidates.push(frame);
  } else if (state === "dead") {
    const frame = clipFrame(id, "death", direction, phase);
    if (frame) candidates.push(frame);
  } else if (state === "walking") {
    const clip = manifestOf(id)?.animations?.walk;
    if (clip && clip.frames > 0) {
      const loop = (Math.floor(now / 140) % clip.frames) / clip.frames;
      const frame = clipFrame(id, "walk", direction, loop);
      if (frame) candidates.push(frame);
    }
  }

  candidates.push(characterIdlePath(id, direction));
  candidates.push(characterIdlePath(id, "south"));

  for (const candidate of candidates) {
    const image = getImage(candidate);
    if (image) return image;
  }
  return undefined;
}

/** True when the character has a real death clip rather than needing a fade. */
export function hasDeathClip(id: CharacterId): boolean {
  const clip = manifestOf(id)?.animations?.death;
  return Boolean(clip && clip.frames > 0);
}

export { loadImage };
