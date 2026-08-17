"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Species, Stage } from "@/utils/portage";
import {
  AMBIENT_CHARACTERS,
  LIQUID_TINT,
  NATIVE,
  NPC_CHARACTER,
  OVERLAY_GROUND,
  PLAYER_CHARACTER,
  characterIdlePath,
  characterSources,
  characterWalkPath,
  creatureCharacterId,
  getImage,
  groundTexturePath,
  hasWalkCycle,
  impactPath,
  loadAll,
  propPath,
  structurePath,
  type CharacterId,
} from "@/utils/world-art";
import { cardinalFromDelta, directionFromDelta, type CardinalDirection, type WorldDirection } from "@/utils/world-sprites";
import { loadTileset, selectWangTile, getTileImage, type TilesetData } from "@/utils/world-tilesets";
import {
  createWorldMap,
  findPath,
  isWalkable,
  pathToAdjacent,
  worldDistance,
  type GridPoint,
  type PropKind,
  type WorldMap,
} from "@/utils/world-engine";
import { activeCreatures } from "@/utils/idle-game";
import type { IdleGameController } from "./useIdleGame";
import styles from "./idle-game.module.css";

/** Whole-number scale over the 32px native tile keeps every pixel square. */
const SCALE = 2;
const DRAW_TILE = NATIVE.tile * SCALE;
const DRAW_CHARACTER = NATIVE.character * SCALE;
const DRAW_EFFECT = NATIVE.effect * SCALE;

/**
 * Props are authored at 64px. Trees and ruins read as two-tile landmarks;
 * rocks, crystals, shrubs and lanterns stay closer to a single tile so the
 * Porter is never dwarfed by scenery.
 */
const PROP_DRAW_SIZE: Record<PropKind, number> = {
  tree: NATIVE.prop * 2,
  ruin: NATIVE.prop * 1.75,
  rock: NATIVE.prop * 1.4,
  crystal: NATIVE.prop * 1.4,
  shrub: NATIVE.prop * 1.25,
  lantern: NATIVE.prop * 1.5,
};
const STEP_MS = 180;
const SAVE_KEY = "portage-world-position-v1";

type Direction = "up" | "down" | "left" | "right";
interface MovingActor extends GridPoint {
  drawX: number;
  drawY: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveStarted: number;
  moving: boolean;
  direction: Direction;
  worldDir: WorldDirection;
  cardinalDir: CardinalDirection;
  walkFrame: number;
  path: GridPoint[];
}
interface WorldModel {
  map: WorldMap;
  player: MovingActor;
  target: GridPoint & { spawnIndex: number };
  lastEnemySerial: number;
  lastManualAt: number;
  lastAutoPathAt: number;
  trail: GridPoint[];
  impacts: Array<{ x: number; y: number; born: number }>;
  damage: Array<{ x: number; y: number; born: number; text: string; color: string }>;
  lastEnemyHp: number;
}

/** Only glow and fallback fills remain palette-driven; terrain now comes from art. */
const PALETTES: Record<Species, { base: string; glow: string }> = {
  ember: { base: "#3a2226", glow: "#f08a42" },
  creek: { base: "#1e3b39", glow: "#66d4e8" },
  grove: { base: "#22381f", glow: "#8edd62" },
  stone: { base: "#2f2f3c", glow: "#bc8cff" },
  mist: { base: "#242637", glow: "#a994ed" },
  sky: { base: "#2c3f4c", glow: "#f4d776" },
};

function actorAt(point: GridPoint): MovingActor {
  return {
    ...point, drawX: point.x, drawY: point.y, fromX: point.x, fromY: point.y,
    toX: point.x, toY: point.y, moveStarted: 0, moving: false,
    direction: "down", worldDir: "south", cardinalDir: "south", walkFrame: 0, path: [],
  };
}

function loadPosition(map: WorldMap): GridPoint {
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "{}") as Record<string, GridPoint>;
    const point = value[map.zoneId];
    return point && isWalkable(map, point) ? point : map.start;
  } catch { return map.start; }
}

function savePosition(map: WorldMap, point: GridPoint) {
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? "{}") as Record<string, GridPoint>;
    value[map.zoneId] = { x: point.x, y: point.y };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(value));
  } catch { /* World position can safely fall back to the outpost. */ }
}

function directionBetween(from: GridPoint, to: GridPoint): Direction {
  if (to.x > from.x) return "right";
  if (to.x < from.x) return "left";
  if (to.y < from.y) return "up";
  return "down";
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#fff4d4", small = false) {
  ctx.save();
  // Canvas cannot resolve CSS custom properties, so the stack is spelled out.
  ctx.font = `${small ? 9 : 11}px "Space Mono", ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(12,8,18,.92)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Characters are drawn from their generated sprite, anchored so the feet sit on
 * the tile's bottom edge. `anchorX`/`anchorY` are the tile's ground point.
 */
function drawCharacter(
  ctx: CanvasRenderingContext2D,
  id: CharacterId,
  anchorX: number,
  anchorY: number,
  direction: WorldDirection,
  options: { walking?: boolean; frame?: number; bob?: number; alpha?: number } = {},
) {
  const { walking = false, frame = 0, bob = 0, alpha = 1 } = options;
  const cardinal = cardinalFromDelta(
    direction.includes("east") ? 1 : direction.includes("west") ? -1 : 0,
    direction.includes("south") ? 1 : direction.includes("north") ? -1 : 0,
  );
  const source = walking && hasWalkCycle(id)
    ? characterWalkPath(id, cardinal, frame)
    : characterIdlePath(id, direction);
  const image = getImage(source) ?? getImage(characterIdlePath(id, "south"));

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(6,5,12,.36)";
  ctx.beginPath();
  ctx.ellipse(anchorX, anchorY - 3, DRAW_TILE * 0.28, DRAW_TILE * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  if (image) {
    ctx.drawImage(image, Math.round(anchorX - DRAW_CHARACTER / 2), Math.round(anchorY - DRAW_CHARACTER + 10 + bob), DRAW_CHARACTER, DRAW_CHARACTER);
  } else {
    ctx.fillStyle = "#6d4b72";
    ctx.fillRect(anchorX - 14, anchorY - 44 + bob, 28, 44);
  }
  ctx.restore();
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  map: WorldMap,
  cameraX: number,
  cameraY: number,
  width: number,
  height: number,
  tileset: TilesetData | null,
  now: number,
) {
  const palette = PALETTES[map.zoneId];
  const minX = Math.max(0, Math.floor(cameraX / DRAW_TILE) - 1);
  const minY = Math.max(0, Math.floor(cameraY / DRAW_TILE) - 1);
  const maxX = Math.min(map.width, Math.ceil((cameraX + width) / DRAW_TILE) + 1);
  const maxY = Math.min(map.height, Math.ceil((cameraY + height) / DRAW_TILE) + 1);

  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, width, height);

  // Base layer: the Wang set carries the ground↔trail transition.
  if (tileset) {
    for (let y = minY; y < maxY; y += 1) {
      for (let x = minX; x < maxX; x += 1) {
        const wangTile = selectWangTile(tileset, map, x, y);
        const image = wangTile ? getTileImage(wangTile.imagePath) : null;
        if (!image) continue;
        ctx.drawImage(image, Math.round(x * DRAW_TILE - cameraX), Math.round(y * DRAW_TILE - cameraY), DRAW_TILE, DRAW_TILE);
      }
    }
  }

  // Overlay layer. Plaza has a seamless texture; water and hazard are tinted
  // until phase 1 regenerates them as proper Wang overlay sets.
  const tint = LIQUID_TINT[map.zoneId];
  const plaza = getImage(groundTexturePath(map.zoneId, "plaza"));
  const kindAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= map.width || y >= map.height ? "ground" : map.tiles[y * map.width + x].kind;
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const tile = map.tiles[y * map.width + x];
      const sx = Math.round(x * DRAW_TILE - cameraX);
      const sy = Math.round(y * DRAW_TILE - cameraY);
      if (tile.kind === "plaza" && OVERLAY_GROUND.includes("plaza") && plaza) {
        // The paver texture is high contrast at 2× and would otherwise read as
        // a rug; it sits back so the buildings and characters stay dominant.
        ctx.save();
        ctx.globalAlpha = .42;
        ctx.drawImage(plaza, sx, sy, DRAW_TILE, DRAW_TILE);
        ctx.fillStyle = "rgba(12,10,20,.3)";
        ctx.fillRect(sx, sy, DRAW_TILE, DRAW_TILE);
        ctx.restore();
      } else if (tile.kind === "water" || tile.kind === "hazard") {
        // Flat body plus a lit rim only where it meets walkable ground. Edge
        // treatment reads as a shoreline or a chasm lip and, unlike a per-tile
        // pattern, never repeats visibly across a large body.
        const liquid = tile.kind === "water";
        ctx.fillStyle = liquid ? tint.water : tint.hazard;
        ctx.fillRect(sx, sy, DRAW_TILE, DRAW_TILE);
        const accent = liquid ? tint.waterLight : tint.hazardCrack;
        // A dark inner edge where the body meets ground: it reads as depth
        // instead of the hard bright border a full-tile rim produces.
        ctx.save();
        ctx.globalAlpha = .55;
        ctx.fillStyle = "rgba(0,0,0,.8)";
        const rim = 6;
        if (kindAt(x, y - 1) !== tile.kind) ctx.fillRect(sx, sy, DRAW_TILE, rim);
        if (kindAt(x, y + 1) !== tile.kind) ctx.fillRect(sx, sy + DRAW_TILE - rim, DRAW_TILE, rim);
        if (kindAt(x - 1, y) !== tile.kind) ctx.fillRect(sx, sy, rim, DRAW_TILE);
        if (kindAt(x + 1, y) !== tile.kind) ctx.fillRect(sx + DRAW_TILE - rim, sy, rim, DRAW_TILE);
        ctx.restore();

        // Irregular highlights keyed off the tile coordinates, so neither a
        // shoreline nor a lava field shows an aligned repeat.
        const noise = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        if (noise % 3 !== 0) {
          const ox = 8 + (noise % 5) * 8;
          const oy = 10 + ((noise >>> 5) % 5) * 8;
          const span = 10 + ((noise >>> 9) % 4) * 6;
          ctx.save();
          ctx.globalAlpha = liquid
            ? .22 + Math.sin(now / 1600 + noise % 7) * .07
            : .3 + Math.sin(now / 700 + (noise % 11)) * .16;
          ctx.fillStyle = accent;
          ctx.fillRect(sx + ox, sy + oy, span, 3);
          if (!liquid) ctx.fillRect(sx + ox + 4, sy + oy - span, 3, span);
          ctx.restore();
        }
      }
    }
  }
}

function drawMinimap(ctx: CanvasRenderingContext2D, model: WorldModel, width: number) {
  const scale = 3;
  const mapW = model.map.width * scale;
  const mapH = model.map.height * scale;
  const ox = width - mapW - 18;
  const oy = 18;
  ctx.save();
  ctx.globalAlpha = .92;
  ctx.fillStyle = "#12101c";
  ctx.fillRect(ox - 5, oy - 5, mapW + 10, mapH + 10);
  for (const tile of model.map.tiles) {
    ctx.fillStyle = tile.kind === "water" ? "#274766" : tile.kind === "hazard" ? "#5c2130"
      : tile.kind === "plaza" ? "#8f7566" : tile.kind === "path" ? "#6f5642" : "#33503a";
    ctx.fillRect(ox + tile.x * scale, oy + tile.y * scale, scale, scale);
  }
  ctx.fillStyle = "#f05f5f";
  for (const spawn of model.map.spawns) ctx.fillRect(ox + spawn.x * scale - 1, oy + spawn.y * scale - 1, 3, 3);
  ctx.fillStyle = "#66e3ff";
  ctx.fillRect(ox + model.player.drawX * scale - 2, oy + model.player.drawY * scale - 2, 5, 5);
  ctx.strokeStyle = "#8a6b4a";
  ctx.strokeRect(ox - 5.5, oy - 5.5, mapW + 11, mapH + 11);
  ctx.restore();
}

export default function IdleWorld({ controller }: { controller: IdleGameController }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef(controller);
  const modelRef = useRef<WorldModel | null>(null);
  const engagementRef = useRef(false);
  const tilesetRef = useRef<TilesetData | null>(null);
  const animationRef = useRef<number>(0);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [position, setPosition] = useState<GridPoint>({ x: 0, y: 0 });
  const map = useMemo(() => createWorldMap(controller.game.zoneId), [controller.game.zoneId]);

  const queueDirection = (direction: GridPoint) => {
    const model = modelRef.current;
    if (!model) return;
    const now = performance.now();
    const queuedManual = now - model.lastManualAt < 500 ? model.player.path.slice(-2) : [];
    const origin = queuedManual.at(-1) ?? (model.player.moving ? { x: model.player.toX, y: model.player.toY } : { x: model.player.x, y: model.player.y });
    const next = { x: origin.x + direction.x, y: origin.y + direction.y };
    if (!isWalkable(model.map, next)) return;
    model.player.path = [...queuedManual, next];
    model.lastManualAt = now;
    setMode("manual");
    canvasRef.current?.focus();
  };

  const onCanvasKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const direction = ({ KeyW: { x: 0, y: -1 }, ArrowUp: { x: 0, y: -1 }, KeyS: { x: 0, y: 1 }, ArrowDown: { x: 0, y: 1 }, KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 }, KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 } } as Record<string, GridPoint>)[event.code];
    if (!direction) return;
    event.preventDefault();
    queueDirection(direction);
  };

  useEffect(() => { controllerRef.current = controller; }, [controller]);

  useEffect(() => {
    const start = loadPosition(map);
    const targetSpawn = map.spawns[controllerRef.current.game.enemy.serial % map.spawns.length];
    modelRef.current = {
      map,
      player: actorAt(start),
      target: { x: targetSpawn.x, y: targetSpawn.y, spawnIndex: controllerRef.current.game.enemy.serial % map.spawns.length },
      lastEnemySerial: controllerRef.current.game.enemy.serial,
      lastManualAt: 0,
      lastAutoPathAt: 0,
      trail: Array.from({ length: 14 }, (_, index) => ({ x: start.x - Math.min(3, Math.ceil(index / 3)), y: start.y })),
      impacts: [],
      damage: [],
      lastEnemyHp: controllerRef.current.game.enemy.hp,
    };
    setPosition(start);
    engagementRef.current = false;
    controllerRef.current.setWorldMounted(true);
    controllerRef.current.setCombatEngaged(false);
    return () => controllerRef.current.setWorldMounted(false);
  }, [map]);

  // Every sprite the current biome can draw, loaded once per zone.
  useEffect(() => {
    const zone = controller.game.zoneId;
    const sources = new Set<string>();
    for (const source of characterSources(PLAYER_CHARACTER)) sources.add(source);
    for (const id of Object.values(NPC_CHARACTER)) for (const source of characterSources(id)) sources.add(source);
    for (const id of AMBIENT_CHARACTERS) for (const source of characterSources(id)) sources.add(source);
    for (const stage of ["adult", "legend"] as Stage[]) {
      for (const source of characterSources(creatureCharacterId(zone, stage))) sources.add(source);
    }
    for (const creature of controller.game.creatures) {
      for (const source of characterSources(creatureCharacterId(creature.species, creature.stage))) sources.add(source);
    }
    for (const kind of ["tree", "rock", "crystal", "shrub", "lantern", "ruin"] as const) sources.add(propPath(zone, kind));
    sources.add(structurePath(zone, "lodge"));
    sources.add(structurePath(zone, "tent"));
    for (const kind of OVERLAY_GROUND) sources.add(groundTexturePath(zone, kind));
    sources.add(impactPath(zone));
    void loadAll(sources);
    loadTileset(zone).then((tileset) => { tilesetRef.current = tileset; }).catch(() => { tilesetRef.current = null; });
  }, [controller.game.creatures, controller.game.zoneId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = (now: number) => {
      const canvas = canvasRef.current;
      const model = modelRef.current;
      if (!canvas || !model) { animationRef.current = requestAnimationFrame(frame); return; }
      const game = controllerRef.current.game;
      const zone = game.zoneId;

      if (game.enemy.serial !== model.lastEnemySerial) {
        model.impacts.push({ x: model.target.x, y: model.target.y, born: now });
        model.lastEnemySerial = game.enemy.serial;
        model.target.spawnIndex = game.enemy.serial % model.map.spawns.length;
        const spawn = model.map.spawns[model.target.spawnIndex];
        model.target.x = spawn.x; model.target.y = spawn.y;
        model.player.path = [];
        model.lastAutoPathAt = 0;
        engagementRef.current = false;
        controllerRef.current.setCombatEngaged(false);
      }
      if (game.enemy.hp < model.lastEnemyHp - 1) {
        const hit = Math.round(model.lastEnemyHp - game.enemy.hp);
        model.impacts.push({ x: model.target.x, y: model.target.y, born: now });
        model.damage.push({ x: model.target.x, y: model.target.y, born: now, text: `${hit}`, color: "#ff8d72" });
      }
      model.lastEnemyHp = game.enemy.hp;

      const player = model.player;
      if (player.moving) {
        const progress = Math.min(1, (now - player.moveStarted) / STEP_MS);
        player.drawX = player.fromX + (player.toX - player.fromX) * progress;
        player.drawY = player.fromY + (player.toY - player.fromY) * progress;
        player.walkFrame = Math.floor(progress * 4) % 4;
        if (progress >= 1) {
          player.x = player.toX; player.y = player.toY;
          player.drawX = player.x; player.drawY = player.y;
          player.moving = false;
          model.trail.unshift({ x: player.x, y: player.y });
          model.trail = model.trail.slice(0, 14);
          savePosition(model.map, player);
          setPosition({ x: player.x, y: player.y });
        }
      }

      const engaged = worldDistance(player, model.target) <= 1;
      engagementRef.current = engaged;
      const shouldEngage = engaged && game.running;
      if (shouldEngage !== game.engaged) controllerRef.current.setCombatEngaged(shouldEngage);

      const autoActive = game.running && game.settings.autoRoam && now - model.lastManualAt > 4_000;
      if (autoActive && !engaged && now - model.lastAutoPathAt > 700) {
        player.path = pathToAdjacent(model.map, player, model.target);
        model.lastAutoPathAt = now;
        setMode("auto");
      }
      if (!player.moving && player.path.length) {
        const next = player.path.shift()!;
        if (isWalkable(model.map, next) && worldDistance(player, next) === 1) {
          player.fromX = player.x; player.fromY = player.y;
          player.toX = next.x; player.toY = next.y;
          player.direction = directionBetween(player, next);
          player.worldDir = directionFromDelta(next.x - player.x, next.y - player.y);
          player.cardinalDir = cardinalFromDelta(next.x - player.x, next.y - player.y);
          player.walkFrame = 0;
          player.moveStarted = now;
          player.moving = true;
        }
      }

      const dpr = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) { animationRef.current = requestAnimationFrame(frame); return; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      const worldW = model.map.width * DRAW_TILE;
      const worldH = model.map.height * DRAW_TILE;
      const cameraX = Math.round(Math.max(0, Math.min(worldW - width, player.drawX * DRAW_TILE + DRAW_TILE / 2 - width / 2)));
      const cameraY = Math.round(Math.max(0, Math.min(worldH - height, player.drawY * DRAW_TILE + DRAW_TILE / 2 - height / 2)));
      drawGround(ctx, model.map, cameraX, cameraY, width, height, tilesetRef.current, now);
      const palette = PALETTES[zone];

      /** Ground anchor for a tile: centre horizontally, bottom edge vertically. */
      const anchor = (tx: number, ty: number) => ({
        x: tx * DRAW_TILE + DRAW_TILE / 2 - cameraX,
        y: (ty + 1) * DRAW_TILE - cameraY,
      });

      type DrawItem = { y: number; draw: () => void };
      const items: DrawItem[] = [];

      for (const structure of model.map.structures) {
        const image = getImage(structurePath(zone, structure.kind));
        const bottom = (structure.y + structure.height) * DRAW_TILE - cameraY;
        const centre = (structure.x + structure.width / 2) * DRAW_TILE - cameraX;
        const native = structure.kind === "lodge" ? NATIVE.lodge : NATIVE.tent;
        const w = native.width * SCALE;
        const h = native.height * SCALE;
        items.push({ y: structure.y + structure.height - 0.2, draw: () => {
          ctx.save();
          ctx.fillStyle = "rgba(6,5,12,.34)";
          ctx.beginPath();
          ctx.ellipse(centre, bottom - 6, w * 0.42, DRAW_TILE * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();
          if (image) ctx.drawImage(image, Math.round(centre - w / 2), Math.round(bottom - h + 8), w, h);
          else { ctx.fillStyle = "#4b3040"; ctx.fillRect(centre - w / 2, bottom - h, w, h); }
          ctx.restore();
        } });
      }

      for (const prop of model.map.props) {
        const point = anchor(prop.x, prop.y);
        const size = PROP_DRAW_SIZE[prop.kind];
        if (point.x < -size || point.y < -size || point.x > width + size || point.y > height + size) continue;
        const image = getImage(propPath(zone, prop.kind));
        const glowing = prop.kind === "crystal" || prop.kind === "lantern";
        items.push({ y: prop.y, draw: () => {
          ctx.save();
          ctx.fillStyle = "rgba(6,5,12,.32)";
          ctx.beginPath();
          ctx.ellipse(point.x, point.y - 4, size * 0.22, size * 0.075, 0, 0, Math.PI * 2);
          ctx.fill();
          if (glowing) { ctx.shadowColor = palette.glow; ctx.shadowBlur = 16; }
          if (image) ctx.drawImage(image, Math.round(point.x - size / 2), Math.round(point.y - size + size * 0.12), size, size);
          ctx.restore();
        } });
      }

      for (const npc of model.map.npcs) {
        const point = anchor(npc.x, npc.y);
        const id = NPC_CHARACTER[npc.id] ?? PLAYER_CHARACTER;
        items.push({ y: npc.y, draw: () => {
          drawCharacter(ctx, id, point.x, point.y, "south", { bob: Math.sin(now / 900 + npc.palette) * 1.5 });
          drawLabel(ctx, npc.name, point.x, point.y - DRAW_CHARACTER + 2, "#ffe09a", true);
          drawLabel(ctx, npc.role, point.x, point.y - DRAW_CHARACTER + 13, "#c3b2c9", true);
        } });
      }

      // Ambient Porters make the outpost read as inhabited without pretending
      // to be online players. Positions are irregular so they read as people
      // milling about rather than a formation.
      const crowd = [[-5, 3], [-2, 4], [2, 3], [5, 4], [-4, 6], [3, 6]];
      crowd.forEach(([dx, dy], index) => {
        const tx = model.map.hub.x + 6 + dx;
        const ty = model.map.hub.y + dy;
        const point = anchor(tx, ty);
        const id = AMBIENT_CHARACTERS[index % AMBIENT_CHARACTERS.length];
        const facing: WorldDirection = index % 2 ? "west" : "east";
        items.push({ y: ty, draw: () => {
          drawCharacter(ctx, id, point.x, point.y, facing, { bob: Math.sin(now / 700 + index) * 1.5, alpha: .96 });
        } });
      });

      const enemyStage: Stage = game.enemy.isBoss ? "legend" : "adult";
      const enemyId = creatureCharacterId(zone, enemyStage);
      model.map.spawns.forEach((spawn, index) => {
        const point = anchor(spawn.x, spawn.y);
        const active = index === model.target.spawnIndex;
        items.push({ y: spawn.y, draw: () => {
          if (active) {
            ctx.save();
            ctx.strokeStyle = game.enemy.isBoss ? "#ffd25e" : "#ef786f";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(point.x, point.y - 4, DRAW_TILE * 0.42, DRAW_TILE * 0.17, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          drawCharacter(ctx, enemyId, point.x, point.y, "south", {
            bob: Math.sin(now / 380 + index) * 2,
            alpha: active ? 1 : .66,
          });
          if (!active) return;
          const top = point.y - DRAW_CHARACTER - 4;
          drawLabel(ctx, game.enemy.name, point.x, top - 12, game.enemy.isBoss ? "#ffe087" : "#fff0d2");
          ctx.fillStyle = "#140f18";
          ctx.fillRect(point.x - 32, top - 8, 64, 7);
          ctx.fillStyle = game.enemy.isBoss ? "#ffcf5c" : "#e6525f";
          ctx.fillRect(point.x - 30, top - 6, 60 * Math.max(0, game.enemy.hp / game.enemy.maxHp), 3);
        } });
      });

      const party = activeCreatures(game);
      party.slice(1).forEach((creature, index) => {
        const followerIndex = index + 1;
        const trailOffset = 8 + followerIndex * 6;
        const trailIndex = Math.min(model.trail.length - 1, trailOffset);
        const trailPoint = model.trail[trailIndex] ?? player;
        const nextPoint = model.trail[Math.max(0, trailIndex - 1)] ?? player;
        const lateral = (index % 2 === 0 ? -1 : 1) * (0.9 + index * 0.25);
        const point = anchor(trailPoint.x + lateral, trailPoint.y);
        const direction = directionFromDelta(trailPoint.x - nextPoint.x, trailPoint.y - nextPoint.y);
        const id = creatureCharacterId(creature.species, creature.stage);
        items.push({ y: trailPoint.y + index * 0.1, draw: () => {
          drawCharacter(ctx, id, point.x, point.y, direction, { bob: Math.sin(now / 500 + index * 2) * 1.5 });
        } });
      });

      const playerPoint = {
        x: player.drawX * DRAW_TILE + DRAW_TILE / 2 - cameraX,
        y: (player.drawY + 1) * DRAW_TILE - cameraY,
      };
      items.push({ y: player.drawY, draw: () => {
        drawCharacter(ctx, PLAYER_CHARACTER, playerPoint.x, playerPoint.y, player.worldDir, {
          walking: player.moving,
          frame: player.walkFrame,
        });
        drawLabel(ctx, "Wayfarer_01", playerPoint.x, playerPoint.y - DRAW_CHARACTER + 2, "#7ee9f5");
      } });

      items.sort((a, b) => a.y - b.y);
      for (const item of items) item.draw();

      // Impact bursts use the biome's generated effect sprite.
      const impact = getImage(impactPath(zone));
      model.impacts = model.impacts.filter((entry) => now - entry.born < 420);
      for (const entry of model.impacts) {
        const age = (now - entry.born) / 420;
        const point = anchor(entry.x, entry.y);
        ctx.save();
        ctx.globalAlpha = 1 - age;
        const size = DRAW_EFFECT * (0.7 + age * 0.5);
        if (impact) ctx.drawImage(impact, Math.round(point.x - size / 2), Math.round(point.y - size / 2 - 20), size, size);
        ctx.restore();
      }

      model.damage = model.damage.filter((entry) => now - entry.born < 900);
      for (const entry of model.damage) {
        const age = (now - entry.born) / 900;
        const point = anchor(entry.x, entry.y);
        ctx.save();
        ctx.globalAlpha = 1 - age * age;
        drawLabel(ctx, entry.text, point.x + Math.sin(age * 6) * 6, point.y - DRAW_CHARACTER - 18 - age * 34, entry.color);
        ctx.restore();
      }

      drawMinimap(ctx, model, width);
      animationRef.current = requestAnimationFrame(frame);
    };
    animationRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  const onCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const model = modelRef.current;
    if (!canvas || !model) return;
    const rect = canvas.getBoundingClientRect();
    const worldW = model.map.width * DRAW_TILE;
    const worldH = model.map.height * DRAW_TILE;
    const cameraX = Math.max(0, Math.min(worldW - rect.width, model.player.drawX * DRAW_TILE + DRAW_TILE / 2 - rect.width / 2));
    const cameraY = Math.max(0, Math.min(worldH - rect.height, model.player.drawY * DRAW_TILE + DRAW_TILE / 2 - rect.height / 2));
    const goal = {
      x: Math.floor((event.clientX - rect.left + cameraX) / DRAW_TILE),
      y: Math.floor((event.clientY - rect.top + cameraY) / DRAW_TILE),
    };
    const pathStart = model.player.moving ? { x: model.player.toX, y: model.player.toY } : { x: model.player.x, y: model.player.y };
    model.player.path = findPath(model.map, pathStart, goal);
    model.lastManualAt = performance.now();
    setMode("manual");
    canvas.focus();
  };

  return (
    <div className={styles.worldCanvasWrap}>
      <canvas ref={canvasRef} className={styles.worldCanvas} tabIndex={0} aria-label="Portage world. Move with WASD or arrow keys, or click a destination." onKeyDown={onCanvasKeyDown} onClick={onCanvasClick} />
      <div className={styles.worldA11y} aria-live="polite">Position {position.x}, {position.y}. {controller.game.engaged ? `In combat with ${controller.game.enemy.name}.` : `Tracking ${controller.game.enemy.name}.`}</div>
      <div className={styles.worldDpad} role="group" aria-label="Movement controls">
        <button type="button" aria-label="Move up" onClick={() => queueDirection({ x: 0, y: -1 })}>▲</button>
        <button type="button" aria-label="Move left" onClick={() => queueDirection({ x: -1, y: 0 })}>◀</button>
        <button type="button" aria-label="Move down" onClick={() => queueDirection({ x: 0, y: 1 })}>▼</button>
        <button type="button" aria-label="Move right" onClick={() => queueDirection({ x: 1, y: 0 })}>▶</button>
      </div>
      <div className={styles.worldLocation}><span>{map.hub.name}</span><b>{position.x}:{position.y}</b></div>
      <div className={styles.worldControls}><b>{mode === "auto" ? "AUTO-ROAM" : "MANUAL"}</b><span>WASD / arrows · click to move</span></div>
      <div className={styles.worldTarget}><span>{controller.game.engaged ? "IN COMBAT" : controller.game.running ? "TRACKING" : "CAMPED"}</span><b>{controller.game.enemy.name}</b><small>{controller.game.engaged ? "Your caravan is in range" : "Move beside the marked creature"}</small></div>
    </div>
  );
}
