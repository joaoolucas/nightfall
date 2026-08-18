import type { Species } from "@/utils/portage";
import {
  LIQUID_TINT,
  NATIVE,
  getImage,
  groundTexturePath,
  impactPath,
  propPath,
  structurePath,
} from "@/utils/world-art";
import { selectWangTile, type TilesetData } from "@/utils/world-tilesets";
import type { PropKind } from "@/utils/world-engine";
import { distance, type GridPoint } from "../core/grid";
import { TICK_MS, type CombatEvent, type Entity, type GameState, type GroundPile } from "../core/types";
import { ATTACK_WINDUP, DEATH_TICKS, HURT_TICKS } from "../sim/combat";
import { PLAYER_ID } from "../sim/state";
import type { WorldMap } from "../world/map";
import { itemAtlasFrame } from "../world/items";
import { resolveFrame } from "./sprites";
import { drawSprite, getSprite } from "./atlas";

/**
 * The world renderer.
 *
 * Draws in tile stacking order — ground, ground items, corpses, creatures,
 * effects, then darkness — the way a top-down tile RPG composites, so a body
 * lying under a creature reads correctly and nothing floats. Everything is
 * pixel-snapped at a whole-number scale over the 32px native tile.
 */

export const SCALE = 2;
export const TILE = NATIVE.tile * SCALE;
const CHARACTER = NATIVE.character * SCALE;
const EFFECT = NATIVE.effect * SCALE;

/** Trees and ruins read as landmarks; smaller props stay near a single tile. */
const PROP_SIZE: Record<PropKind, number> = {
  tree: NATIVE.prop * 2,
  ruin: NATIVE.prop * 1.75,
  rock: NATIVE.prop * 1.4,
  crystal: NATIVE.prop * 1.4,
  shrub: NATIVE.prop * 1.25,
  lantern: NATIVE.prop * 1.5,
};

const GLOW: Record<Species, string> = {
  ember: "#f08a42",
  creek: "#66d4e8",
  grove: "#8edd62",
  stone: "#bc8cff",
  mist: "#a994ed",
  sky: "#f4d776",
};

const BASE: Record<Species, string> = {
  ember: "#2a1a1e",
  creek: "#16302f",
  grove: "#1a2c19",
  stone: "#25252f",
  mist: "#1c1e2c",
  sky: "#223440",
};

export interface FloatingText {
  x: number;
  y: number;
  born: number;
  text: string;
  color: string;
}

export interface Impact {
  x: number;
  y: number;
  born: number;
}

/**
 * Per-entity drawing state.
 *
 * Movement is interpolated across the *measured* duration of a step rather than
 * eased toward the target tile. Easing looked right in isolation but was wrong
 * in time: it converged in about a tenth of a second while a step actually
 * takes four to eight, so a creature snapped onto its new tile and then stood
 * still for the rest of the interval. Combined with a walk cycle running off a
 * wall clock, that is precisely the "picture being dragged" read.
 *
 * The step duration is measured from the gap between tile changes, so the
 * renderer never has to know the simulation's tick costs.
 */
interface Visual {
  /** Drawn position, in tiles. */
  x: number;
  y: number;
  /** Where this step began, and where it ends. */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** When the current step began, and how long the last one took. */
  stepStart: number;
  stepDuration: number;
  /** Tiles travelled; the walk cycle loops once per tile. */
  walkPhase: number;
  /** When the current non-looping clip began. */
  stateSince: number;
  lastState: string;
}

/** Fallback until a creature has taken two steps and its pace can be measured. */
const DEFAULT_STEP_MS = 420;

function newVisual(entity: Entity, now: number): Visual {
  return {
    x: entity.x,
    y: entity.y,
    fromX: entity.x,
    fromY: entity.y,
    toX: entity.x,
    toY: entity.y,
    stepStart: now,
    stepDuration: DEFAULT_STEP_MS,
    walkPhase: 0,
    stateSince: now,
    lastState: entity.state,
  };
}

export interface RenderScene {
  camera: { x: number; y: number };
  hoverTile: GridPoint | null;
  floating: FloatingText[];
  impacts: Impact[];
  visuals: Map<string, Visual>;
}

export function createScene(): RenderScene {
  return { camera: { x: 0, y: 0 }, hoverTile: null, floating: [], impacts: [], visuals: new Map() };
}

/** Turn simulation events into the transient visuals the player actually sees. */
export function ingestEvents(scene: RenderScene, state: GameState, events: readonly CombatEvent[], now: number): void {
  for (const event of events) {
    const at = event.at;
    if (!at) continue;
    if (event.type === "hit" && event.amount) {
      const onPlayer = event.targetId === PLAYER_ID;
      scene.floating.push({
        x: at.x,
        y: at.y,
        born: now,
        text: `${event.amount}`,
        color: onPlayer ? "#ff6b6b" : "#ffd98a",
      });
      scene.impacts.push({ x: at.x, y: at.y, born: now });
    } else if (event.type === "block") {
      scene.floating.push({ x: at.x, y: at.y, born: now, text: "blocked", color: "#9fb6d0" });
    } else if (event.type === "heal" && event.amount) {
      scene.floating.push({ x: at.x, y: at.y, born: now, text: `+${event.amount}`, color: "#7fe08a" });
    }
  }
  scene.floating = scene.floating.filter((entry) => now - entry.born < 1000);
  scene.impacts = scene.impacts.filter((entry) => now - entry.born < 420);
  void state;
}

/** Advance every entity's drawn position and animation phase. */
export function advanceVisuals(scene: RenderScene, state: GameState, deltaMs: number, now: number): void {
  const alive = new Set(state.entities.map((entity) => entity.id));
  for (const id of [...scene.visuals.keys()]) if (!alive.has(id)) scene.visuals.delete(id);

  for (const entity of state.entities) {
    let visual = scene.visuals.get(entity.id);
    if (!visual) {
      visual = newVisual(entity, now);
      scene.visuals.set(entity.id, visual);
      continue;
    }

    if (entity.state !== visual.lastState) {
      visual.lastState = entity.state;
      visual.stateSince = now;
    }

    if (entity.x !== visual.toX || entity.y !== visual.toY) {
      // A jump of more than one tile is a respawn or a recall, not a step.
      if (Math.abs(entity.x - visual.toX) > 1 || Math.abs(entity.y - visual.toY) > 1) {
        Object.assign(visual, newVisual(entity, now));
        continue;
      }
      // Start from wherever the sprite actually is, so a step that begins
      // before the last one finished does not snap.
      const elapsed = now - visual.stepStart;
      if (elapsed > 40) visual.stepDuration = Math.min(900, Math.max(120, elapsed));
      visual.fromX = visual.x;
      visual.fromY = visual.y;
      visual.toX = entity.x;
      visual.toY = entity.y;
      visual.stepStart = now;
    }

    const progress = Math.min(1, (now - visual.stepStart) / visual.stepDuration);
    const beforeX = visual.x;
    const beforeY = visual.y;
    visual.x = visual.fromX + (visual.toX - visual.fromX) * progress;
    visual.y = visual.fromY + (visual.toY - visual.fromY) * progress;
    // One full gait cycle per tile crossed, so the feet always match the pace.
    if (entity.state === "walking") {
      visual.walkPhase += Math.hypot(visual.x - beforeX, visual.y - beforeY);
    }
  }
  void deltaMs;
}

function visualOf(scene: RenderScene, entity: Entity): Visual {
  return scene.visuals.get(entity.id) ?? newVisual(entity, 0);
}

/**
 * Fraction through a non-looping clip, measured in real time rather than in
 * simulation ticks — otherwise the clip advances only ten times a second and a
 * six-frame swing plays as five stills.
 */
function clipPhase(entity: Entity, visual: Visual, now: number): number {
  const ticks = entity.state === "attacking" ? ATTACK_WINDUP : entity.state === "hurt" ? HURT_TICKS : DEATH_TICKS;
  if (ticks <= 0) return 0;
  return Math.min(1, Math.max(0, (now - visual.stateSince) / (ticks * TICK_MS)));
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 11) {
  ctx.save();
  ctx.font = `${size}px "Space Mono", ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(10,7,16,.92)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  map: WorldMap,
  camera: GridPoint,
  width: number,
  height: number,
  tileset: TilesetData | null,
  now: number,
) {
  const minX = Math.max(0, Math.floor(camera.x / TILE) - 1);
  const minY = Math.max(0, Math.floor(camera.y / TILE) - 1);
  const maxX = Math.min(map.width, Math.ceil((camera.x + width) / TILE) + 1);
  const maxY = Math.min(map.height, Math.ceil((camera.y + height) / TILE) + 1);
  const tint = LIQUID_TINT[map.zoneId];
  const plaza = getImage(groundTexturePath(map.zoneId, "plaza"));
  const kindAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= map.width || y >= map.height ? "ground" : map.tiles[y * map.width + x].kind;

  ctx.fillStyle = BASE[map.zoneId];
  ctx.fillRect(0, 0, width, height);

  if (tileset) {
    for (let y = minY; y < maxY; y += 1) {
      for (let x = minX; x < maxX; x += 1) {
        const wang = selectWangTile(tileset, map, x, y);
        const sprite = wang ? getSprite(`tilesets/${map.zoneId}`, `wang_${wang.id}`) : undefined;
        if (sprite) drawSprite(ctx, sprite, x * TILE - camera.x, y * TILE - camera.y, TILE, TILE);
      }
    }
  }

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const tile = map.tiles[y * map.width + x];
      const sx = Math.round(x * TILE - camera.x);
      const sy = Math.round(y * TILE - camera.y);
      if (tile.kind === "plaza" && plaza) {
        ctx.save();
        // The paver texture is high contrast at 2x and would otherwise read as
        // a rug laid over the map, so it sits well back.
        ctx.globalAlpha = 0.3;
        ctx.drawImage(plaza, sx, sy, TILE, TILE);
        ctx.fillStyle = "rgba(12,10,20,.34)";
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.restore();
      } else if (tile.kind === "water" || tile.kind === "hazard") {
        const liquid = tile.kind === "water";
        ctx.fillStyle = liquid ? tint.water : tint.hazard;
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "rgba(0,0,0,.8)";
        const rim = 6;
        if (kindAt(x, y - 1) !== tile.kind) ctx.fillRect(sx, sy, TILE, rim);
        if (kindAt(x, y + 1) !== tile.kind) ctx.fillRect(sx, sy + TILE - rim, TILE, rim);
        if (kindAt(x - 1, y) !== tile.kind) ctx.fillRect(sx, sy, rim, TILE);
        if (kindAt(x + 1, y) !== tile.kind) ctx.fillRect(sx + TILE - rim, sy, rim, TILE);
        ctx.restore();
        const noise = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        if (noise % 3 !== 0) {
          const ox = 8 + (noise % 5) * 8;
          const oy = 10 + ((noise >>> 5) % 5) * 8;
          const span = 10 + ((noise >>> 9) % 4) * 6;
          ctx.save();
          ctx.globalAlpha = liquid ? 0.22 : 0.3 + Math.sin(now / 700 + (noise % 11)) * 0.16;
          ctx.fillStyle = liquid ? tint.waterLight : tint.hazardCrack;
          ctx.fillRect(sx + ox, sy + oy, span, 3);
          if (!liquid) ctx.fillRect(sx + ox + 4, sy + oy - span, 3, span);
          ctx.restore();
        }
      }
    }
  }
}

function drawPile(ctx: CanvasRenderingContext2D, pile: GroundPile, camera: GridPoint) {
  const cx = pile.x * TILE + TILE / 2 - camera.x;
  const by = (pile.y + 1) * TILE - camera.y;
  ctx.save();
  if (pile.corpseOf) {
    // A corpse is a flattened, desaturated body: it reads as remains without
    // needing a per-creature death sprite the skeletons cannot produce.
    ctx.fillStyle = "rgba(52,20,24,.72)";
    ctx.beginPath();
    ctx.ellipse(cx, by - 10, TILE * 0.36, TILE * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(120,44,44,.9)";
    ctx.beginPath();
    ctx.ellipse(cx - 3, by - 12, TILE * 0.22, TILE * 0.12, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const top = pile.items.slice(0, 3);
  top.forEach((stack, index) => {
    const sprite = getSprite("items", itemAtlasFrame(stack.defId));
    const ox = cx - 10 + index * 9;
    const oy = by - 20 - index * 4;
    if (sprite) drawSprite(ctx, sprite, ox, oy, 22, 22);
    else {
      ctx.fillStyle = stack.defId === "gold" ? "#e9c15c" : "#a9b4d0";
      ctx.fillRect(ox + 5, oy + 8, 12, 10);
    }
  });
  ctx.restore();
}

function drawEntity(
  ctx: CanvasRenderingContext2D,
  scene: RenderScene,
  entity: Entity,
  camera: GridPoint,
  now: number,
  targetId: string | null,
) {
  const visual = visualOf(scene, entity);
  const cx = visual.x * TILE + TILE / 2 - camera.x;
  const by = (visual.y + 1) * TILE - camera.y;
  const sprite = resolveFrame({
    id: entity.charId,
    state: entity.state,
    direction: entity.direction,
    phase: clipPhase(entity, visual, now),
    walkPhase: visual.walkPhase,
  });

  ctx.save();
  if (entity.state === "dead") ctx.globalAlpha = Math.max(0.15, entity.stateTicks / DEATH_TICKS);

  ctx.fillStyle = "rgba(6,5,12,.36)";
  ctx.beginPath();
  ctx.ellipse(cx, by - 3, TILE * 0.28, TILE * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();

  // The targeted creature wears a red frame, as the genre expects.
  if (entity.id === targetId) {
    ctx.strokeStyle = "#e2484a";
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(cx - TILE / 2) + 1, Math.round(by - TILE) + 1, TILE - 2, TILE - 2);
  }

  if (sprite) {
    drawSprite(ctx, sprite, cx - CHARACTER / 2, by - CHARACTER + 10, CHARACTER, CHARACTER);
  } else {
    ctx.fillStyle = entity.kind === "monster" ? "#8d4450" : "#6d4b72";
    ctx.fillRect(cx - 14, by - 46, 28, 46);
  }

  // A hurt creature flashes, which covers the beasts that have no hurt clip.
  if (entity.state === "hurt") {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(255,90,90,.32)";
    ctx.fillRect(cx - CHARACTER / 2, by - CHARACTER, CHARACTER, CHARACTER);
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.restore();

  if (entity.state === "dead") return;

  // Health pips over anything hostile or hurt, never over a healthy ally.
  const ratio = entity.hp / Math.max(1, entity.maxHp);
  if (entity.kind === "monster" || ratio < 1) {
    const barWidth = 34;
    const top = by - CHARACTER + 6;
    ctx.fillStyle = "rgba(12,9,16,.85)";
    ctx.fillRect(Math.round(cx - barWidth / 2) - 1, Math.round(top) - 1, barWidth + 2, 6);
    ctx.fillStyle = ratio > 0.55 ? "#63c264" : ratio > 0.25 ? "#e0bc4a" : "#d7484a";
    ctx.fillRect(Math.round(cx - barWidth / 2), Math.round(top), Math.round(barWidth * ratio), 4);
  }
  if (entity.kind === "monster") {
    label(ctx, entity.name, cx, by - CHARACTER - 2, "#f2d7b8", 10);
  } else if (entity.kind === "player") {
    label(ctx, entity.name, cx, by - CHARACTER - 2, "#7ee9f5", 11);
  }
}

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  scene: RenderScene;
  state: GameState;
  map: WorldMap;
  tileset: TilesetData | null;
  width: number;
  height: number;
  now: number;
}

export function render({ ctx, scene, state, map, tileset, width, height, now }: RenderInput): void {
  ctx.imageSmoothingEnabled = false;

  const player = state.entities.find((entity) => entity.id === PLAYER_ID);
  const focus = player ? visualOf(scene, player) : { x: map.start.x, y: map.start.y };
  const worldW = map.width * TILE;
  const worldH = map.height * TILE;
  scene.camera.x = Math.round(Math.max(0, Math.min(Math.max(0, worldW - width), focus.x * TILE + TILE / 2 - width / 2)));
  scene.camera.y = Math.round(Math.max(0, Math.min(Math.max(0, worldH - height), focus.y * TILE + TILE / 2 - height / 2)));
  const camera = scene.camera;

  drawGround(ctx, map, camera, width, height, tileset, now);

  // Hovered tile, drawn under everything so it never covers a creature.
  if (scene.hoverTile) {
    ctx.save();
    ctx.strokeStyle = "rgba(240,214,150,.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      Math.round(scene.hoverTile.x * TILE - camera.x) + 1,
      Math.round(scene.hoverTile.y * TILE - camera.y) + 1,
      TILE - 2,
      TILE - 2,
    );
    ctx.restore();
  }

  for (const pile of state.ground) drawPile(ctx, pile, camera);

  // Everything above the ground is depth-sorted by its foot position.
  type Layer = { y: number; draw: () => void };
  const layers: Layer[] = [];

  for (const structure of map.structures) {
    const image = getImage(structurePath(map.zoneId, structure.kind));
    const native = structure.kind === "lodge" ? NATIVE.lodge : NATIVE.tent;
    const w = native.width * SCALE;
    const h = native.height * SCALE;
    const centre = (structure.x + structure.width / 2) * TILE - camera.x;
    const bottom = (structure.y + structure.height) * TILE - camera.y;
    layers.push({
      y: structure.y + structure.height - 0.2,
      draw: () => {
        ctx.save();
        ctx.fillStyle = "rgba(6,5,12,.34)";
        ctx.beginPath();
        ctx.ellipse(centre, bottom - 6, w * 0.42, TILE * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        if (image) ctx.drawImage(image, Math.round(centre - w / 2), Math.round(bottom - h + 8), w, h);
        ctx.restore();
      },
    });
  }

  for (const prop of map.props) {
    const size = PROP_SIZE[prop.kind];
    const cx = prop.x * TILE + TILE / 2 - camera.x;
    const by = (prop.y + 1) * TILE - camera.y;
    if (cx < -size || by < -size || cx > width + size || by > height + size) continue;
    const image = getImage(propPath(map.zoneId, prop.kind));
    const glowing = prop.kind === "crystal" || prop.kind === "lantern";
    layers.push({
      y: prop.y,
      draw: () => {
        ctx.save();
        ctx.fillStyle = "rgba(6,5,12,.32)";
        ctx.beginPath();
        ctx.ellipse(cx, by - 4, size * 0.22, size * 0.075, 0, 0, Math.PI * 2);
        ctx.fill();
        if (glowing) {
          ctx.shadowColor = GLOW[map.zoneId];
          ctx.shadowBlur = 16;
        }
        if (image) ctx.drawImage(image, Math.round(cx - size / 2), Math.round(by - size + size * 0.12), size, size);
        ctx.restore();
      },
    });
  }

  const targetId = player?.targetId ?? null;
  for (const entity of state.entities) {
    const visual = visualOf(scene, entity);
    const cx = visual.x * TILE + TILE / 2 - camera.x;
    const by = (visual.y + 1) * TILE - camera.y;
    if (cx < -CHARACTER || by < -CHARACTER || cx > width + CHARACTER || by > height + CHARACTER) continue;
    layers.push({ y: visual.y, draw: () => drawEntity(ctx, scene, entity, camera, now, targetId) });
  }

  layers.sort((a, b) => a.y - b.y);
  for (const layer of layers) layer.draw();

  // The impact sits inside its tile: at full effect size it swallowed the
  // creature it was meant to punctuate.
  const impact = getImage(impactPath(map.zoneId));
  for (const entry of scene.impacts) {
    const age = (now - entry.born) / 420;
    const cx = entry.x * TILE + TILE / 2 - camera.x;
    const cy = entry.y * TILE + TILE / 2 - camera.y;
    ctx.save();
    ctx.globalAlpha = (1 - age) * 0.75;
    const size = TILE * (0.7 + age * 0.35);
    if (impact) ctx.drawImage(impact, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
    ctx.restore();
  }

  // Fan simultaneous numbers apart so a flurry stays readable.
  scene.floating.forEach((entry, index) => {
    const age = (now - entry.born) / 1000;
    const spread = ((index % 3) - 1) * 16;
    const cx = entry.x * TILE + TILE / 2 - camera.x + spread;
    const cy = (entry.y + 1) * TILE - camera.y - CHARACTER - 12 - age * 40;
    ctx.save();
    ctx.globalAlpha = 1 - age * age;
    label(ctx, entry.text, cx, cy, entry.color, 13);
    ctx.restore();
  });

  // A soft vignette pulls focus to the Porter, standing in for the darkness
  // model a lit dungeon will need later.
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.32, width / 2, height / 2, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(4,3,10,.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

/** Convert a canvas-space point into a tile, for hover and click targeting. */
export function tileAtPoint(scene: RenderScene, x: number, y: number): GridPoint {
  return {
    x: Math.floor((x + scene.camera.x) / TILE),
    y: Math.floor((y + scene.camera.y) / TILE),
  };
}

/** The entity occupying a tile, preferring monsters so clicking targets them. */
export function entityAtTile(state: GameState, tile: GridPoint): Entity | undefined {
  const here = state.entities.filter((entity) => entity.state !== "dead" && distance(entity, tile) === 0);
  return here.find((entity) => entity.kind === "monster") ?? here[0];
}
