import type { Direction8 } from "../core/grid";
import { cardinalOf } from "../core/grid";
import type { EntityState } from "../core/types";
import { getSprite, loadAtlas, type Sprite } from "./atlas";

/**
 * Animation lookup, driven by each character's generated manifest.
 *
 * Frame counts differ per template — `cross-punch` yields six frames where
 * `walk-4-frames` yields four — and beasts have no attack or death clip at all,
 * because their skeletons do not offer one. Reading the manifest instead of
 * assuming a shape keeps the renderer correct as art lands incrementally, and
 * lets it fall back cleanly wherever a clip does not exist.
 */

export type ClipName = "walk" | "attack" | "hurt" | "death";
export type CharacterId = string;

export interface AnimationClip {
  directions: string[];
  frames: number;
  template: string;
}

export interface CharacterManifest {
  animations: Partial<Record<ClipName, AnimationClip>>;
}

const manifests = new Map<CharacterId, CharacterManifest | null>();
const pending = new Map<CharacterId, Promise<void>>();

export function atlasNameOf(id: CharacterId): string {
  return `characters/${id}`;
}

export function manifestOf(id: CharacterId): CharacterManifest | null {
  return manifests.get(id) ?? null;
}

/**
 * Load a character: one atlas request and one manifest request, rather than the
 * sixty-odd individual frame requests this used to make.
 */
export function loadCharacter(id: CharacterId): Promise<void> {
  const existing = pending.get(id);
  if (existing) return existing;
  const task = (async () => {
    const manifestTask = fetch(`/game-assets/world/characters/${id}/pixellab.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        manifests.set(id, data ? { animations: data.animations ?? {} } : { animations: {} });
      })
      .catch(() => {
        manifests.set(id, { animations: {} });
      });
    await Promise.all([loadAtlas(atlasNameOf(id)), manifestTask]);
  })();
  pending.set(id, task);
  return task;
}

function clipFrameKey(id: CharacterId, name: ClipName, direction: Direction8, phase: number): string | null {
  const clip = manifestOf(id)?.animations?.[name];
  if (!clip || clip.frames <= 0) return null;
  // Clips are authored for the cardinals; a diagonal borrows its dominant axis.
  const wanted = cardinalOf(direction);
  const used = clip.directions.includes(wanted) ? wanted : clip.directions[0];
  if (!used) return null;
  const index = Math.min(clip.frames - 1, Math.max(0, Math.floor(phase * clip.frames)));
  return `${name}-${used}-${index}`;
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
 * Resolve the sprite to draw, falling back down the chain
 * clip → idle for the direction → idle facing south, so a character whose clip
 * is missing still renders rather than vanishing.
 */
export function resolveFrame(request: FrameRequest): Sprite | undefined {
  const { id, state, direction, phase, now } = request;
  const atlas = atlasNameOf(id);
  const candidates: string[] = [];

  if (state === "attacking") {
    const key = clipFrameKey(id, "attack", direction, phase);
    if (key) candidates.push(key);
  } else if (state === "hurt") {
    const key = clipFrameKey(id, "hurt", direction, phase);
    if (key) candidates.push(key);
  } else if (state === "dead") {
    const key = clipFrameKey(id, "death", direction, phase);
    if (key) candidates.push(key);
  } else if (state === "walking") {
    const clip = manifestOf(id)?.animations?.walk;
    if (clip && clip.frames > 0) {
      const loop = (Math.floor(now / 140) % clip.frames) / clip.frames;
      const key = clipFrameKey(id, "walk", direction, loop);
      if (key) candidates.push(key);
    }
  }

  candidates.push(`idle-${direction}`, "idle-south");

  for (const candidate of candidates) {
    const sprite = getSprite(atlas, candidate);
    if (sprite) return sprite;
  }
  return undefined;
}

/** True when the character has a real death clip rather than needing a fade. */
export function hasDeathClip(id: CharacterId): boolean {
  const clip = manifestOf(id)?.animations?.death;
  return Boolean(clip && clip.frames > 0);
}
