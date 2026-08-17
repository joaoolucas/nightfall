"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { creatureSpritePath, type Stage } from "@/utils/portage";
import { worldIdleSpritePath, worldWalkSpritePath, directionFromDelta, cardinalFromDelta, preloadWorldCharacterSprites, preloadZoneEnemySprites, type WorldDirection, type CardinalDirection } from "@/utils/world-sprites";
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

const DRAW_TILE = 40;
const STEP_MS = 145;
const SAVE_KEY = "portage-world-position-v1";

type Direction = "up" | "down" | "left" | "right";
type WorldDir = WorldDirection;
type CardinalDir = CardinalDirection;
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
  worldDir: WorldDir;
  cardinalDir: CardinalDir;
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
  hitParticles: Array<{ x: number; y: number; born: number; color: string }>;
  lastEnemyHp: number;
  lastFrameAt: number;
}

const PALETTES = {
  ember: { ground: "#553335", ground2: "#623a38", path: "#7a4b3c", plaza: "#79545a", water: "#321d34", hazard: "#b43b2e", grid: "#3b252e", glow: "#f08a42", foliage: "#6b4932" },
  creek: { ground: "#315f56", ground2: "#386b60", path: "#6d7561", plaza: "#5d7180", water: "#27749a", hazard: "#31526f", grid: "#234840", glow: "#66d4e8", foliage: "#2d704f" },
  grove: { ground: "#355d37", ground2: "#3e6d3e", path: "#7a6a43", plaza: "#62715a", water: "#285a63", hazard: "#49352f", grid: "#25452a", glow: "#8edd62", foliage: "#27703b" },
  stone: { ground: "#565565", ground2: "#626172", path: "#77727a", plaza: "#68687b", water: "#324459", hazard: "#282635", grid: "#41404d", glow: "#bc8cff", foliage: "#4f6257" },
  mist: { ground: "#3f4357", ground2: "#494d61", path: "#626176", plaza: "#615b76", water: "#354368", hazard: "#29283f", grid: "#303345", glow: "#a994ed", foliage: "#40525c" },
  sky: { ground: "#536f7d", ground2: "#607f8d", path: "#a08e70", plaza: "#74899b", water: "#3c6e91", hazard: "#252b4b", grid: "#405c68", glow: "#f4d776", foliage: "#4d786b" },
} as const;

const PORTER_COLORS = [
  ["#d5523f", "#f2c06b", "#30223b"], ["#4d8acb", "#e7c28d", "#26314a"],
  ["#6bba64", "#efbd84", "#342c47"], ["#a85ab7", "#e2b17c", "#2b2940"],
  ["#d99b3d", "#f0c28d", "#38283a"], ["#4db5ae", "#dcae78", "#272c46"],
];

function actorAt(point: GridPoint): MovingActor {
  return { ...point, drawX: point.x, drawY: point.y, fromX: point.x, fromY: point.y, toX: point.x, toY: point.y, moveStarted: 0, moving: false, direction: "down", worldDir: "south", cardinalDir: "south", walkFrame: 0, path: [] };
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

function drawPorter(ctx: CanvasRenderingContext2D, x: number, y: number, direction: Direction, walking: boolean, paletteIndex = 0, scale = 1) {
  const colors = PORTER_COLORS[paletteIndex % PORTER_COLORS.length];
  const px = 2 * scale;
  const frame = walking && Math.floor(performance.now() / 130) % 2 ? px * 2 : 0;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.fillStyle = "rgba(7,7,15,.32)"; ctx.beginPath(); ctx.ellipse(0, 7 * px, 7 * px, 3 * px, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = colors[2]; ctx.fillRect(-5 * px, -2 * px, 10 * px, 10 * px);
  ctx.fillStyle = colors[0]; ctx.fillRect(-6 * px, -1 * px, 12 * px, 7 * px);
  ctx.fillStyle = colors[1]; ctx.fillRect(-5 * px, -8 * px, 10 * px, 8 * px);
  ctx.fillStyle = "#3a2533"; ctx.fillRect(-5 * px, -9 * px, 10 * px, 3 * px); ctx.fillRect(direction === "left" ? -6 * px : 3 * px, -6 * px, 3 * px, 3 * px);
  ctx.fillStyle = "#171521";
  if (direction !== "up") ctx.fillRect(direction === "left" ? -3 * px : direction === "right" ? 2 * px : -3 * px, -5 * px, px, px);
  ctx.fillRect(-4 * px, 8 * px, 3 * px, 3 * px + frame); ctx.fillRect(1 * px, 8 * px + frame, 3 * px, 3 * px);
  ctx.fillStyle = "#e7ad42"; ctx.fillRect(direction === "left" ? -8 * px : 6 * px, 1 * px, 2 * px, 5 * px);
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#fff4d4", small = false) {
  ctx.save();
  ctx.font = `${small ? 8 : 10}px monospace`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(18,12,25,.9)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawProp(ctx: CanvasRenderingContext2D, kind: PropKind, x: number, y: number, variant: number, palette: (typeof PALETTES)[keyof typeof PALETTES]) {
  ctx.save(); ctx.translate(x, y);
  if (kind === "tree") {
    ctx.fillStyle = "rgba(8,8,14,.3)"; ctx.beginPath(); ctx.ellipse(0, 8, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#563728"; ctx.fillRect(-5, -4, 10, 28);
    ctx.fillStyle = palette.foliage; ctx.beginPath(); ctx.arc(-9, -11, 16 + variant, 0, Math.PI * 2); ctx.arc(9, -13, 15, 0, Math.PI * 2); ctx.arc(0, -24, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(151,212,113,.22)"; ctx.fillRect(-12, -29, 12, 5);
  } else if (kind === "rock") {
    ctx.fillStyle = "rgba(7,7,13,.28)"; ctx.beginPath(); ctx.ellipse(0, 8, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = variant % 2 ? "#777181" : "#655e70"; ctx.beginPath(); ctx.moveTo(-15, 7); ctx.lineTo(-9, -10); ctx.lineTo(5, -15); ctx.lineTo(15, 3); ctx.lineTo(9, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#9c94a5"; ctx.fillRect(-7, -9, 8, 3);
  } else if (kind === "crystal") {
    ctx.shadowColor = palette.glow; ctx.shadowBlur = 12; ctx.fillStyle = palette.glow;
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(10, -5); ctx.lineTo(4, 14); ctx.lineTo(-8, 8); ctx.lineTo(-10, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(2, 4); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
  } else if (kind === "shrub") {
    ctx.fillStyle = palette.foliage; ctx.beginPath(); ctx.arc(-8, 2, 10, 0, Math.PI * 2); ctx.arc(5, -2, 12, 0, Math.PI * 2); ctx.arc(12, 5, 8, 0, Math.PI * 2); ctx.fill();
  } else if (kind === "lantern") {
    ctx.fillStyle = "#30222d"; ctx.fillRect(-2, -19, 4, 28); ctx.shadowColor = "#ffd06a"; ctx.shadowBlur = 14; ctx.fillStyle = "#ffd06a"; ctx.fillRect(-6, -20, 12, 11);
  } else {
    ctx.fillStyle = "#554858"; ctx.fillRect(-14, -13, 28, 24); ctx.fillStyle = "#756879"; ctx.fillRect(-11, -18, 7, 21); ctx.fillRect(4, -8, 7, 19);
  }
  ctx.restore();
}

function drawStructure(ctx: CanvasRenderingContext2D, structure: WorldMap["structures"][number], cameraX: number, cameraY: number, palette: (typeof PALETTES)[keyof typeof PALETTES]) {
  const x = structure.x * DRAW_TILE - cameraX;
  const y = structure.y * DRAW_TILE - cameraY;
  const w = structure.width * DRAW_TILE;
  const h = structure.height * DRAW_TILE;
  ctx.save();
  ctx.fillStyle = "rgba(8,7,15,.4)"; ctx.fillRect(x + 8, y + h - 4, w, 14);
  if (structure.kind === "lodge") {
    ctx.fillStyle = "#503441"; ctx.fillRect(x, y + 18, w, h - 18);
    ctx.fillStyle = "#8e4d45"; ctx.beginPath(); ctx.moveTo(x - 10, y + 24); ctx.lineTo(x + w / 2, y - 20); ctx.lineTo(x + w + 10, y + 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d78c57"; ctx.fillRect(x + 10, y + 22, w - 20, 6);
    ctx.fillStyle = "#271c2a"; ctx.fillRect(x + w / 2 - 14, y + h - 34, 28, 34);
    ctx.shadowColor = palette.glow; ctx.shadowBlur = 12; ctx.fillStyle = palette.glow; ctx.fillRect(x + 25, y + 43, 20, 17); ctx.fillRect(x + w - 45, y + 43, 20, 17);
    drawLabel(ctx, "PORTAGE LODGE", x + w / 2, y + 42, "#fff0ae", true);
  } else {
    ctx.fillStyle = "#71434d"; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d18a59"; ctx.fillRect(x + w / 2 - 3, y + 5, 6, h - 5);
  }
  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, map: WorldMap, cameraX: number, cameraY: number, width: number, height: number) {
  const palette = PALETTES[map.zoneId];
  const minX = Math.max(0, Math.floor(cameraX / DRAW_TILE) - 1);
  const minY = Math.max(0, Math.floor(cameraY / DRAW_TILE) - 1);
  const maxX = Math.min(map.width, Math.ceil((cameraX + width) / DRAW_TILE) + 1);
  const maxY = Math.min(map.height, Math.ceil((cameraY + height) / DRAW_TILE) + 1);
  for (let y = minY; y < maxY; y += 1) for (let x = minX; x < maxX; x += 1) {
    const tile = map.tiles[y * map.width + x];
    const sx = x * DRAW_TILE - cameraX;
    const sy = y * DRAW_TILE - cameraY;
    let color: string = (x + y) % 2 ? palette.ground : palette.ground2;
    if (tile.kind === "path") color = palette.path;
    if (tile.kind === "plaza") color = palette.plaza;
    if (tile.kind === "water") color = palette.water;
    if (tile.kind === "hazard") color = palette.hazard;
    ctx.fillStyle = color; ctx.fillRect(Math.floor(sx), Math.floor(sy), DRAW_TILE + 1, DRAW_TILE + 1);
    ctx.strokeStyle = tile.kind === "plaza" ? "rgba(239,216,190,.12)" : palette.grid; ctx.lineWidth = 1; ctx.strokeRect(Math.floor(sx) + .5, Math.floor(sy) + .5, DRAW_TILE, DRAW_TILE);
    if (tile.kind === "water" || tile.kind === "hazard") { ctx.fillStyle = "rgba(255,255,255,.11)"; ctx.fillRect(sx + ((x * 13 + y * 7) % 17), sy + 9, 12, 2); }
    else if ((x * 17 + y * 11) % 9 === 0) { ctx.fillStyle = "rgba(255,255,255,.09)"; ctx.fillRect(sx + 8, sy + 12, 3, 3); }
  }
}

function drawMinimap(ctx: CanvasRenderingContext2D, model: WorldModel, width: number) {
  const scale = 3;
  const mapW = model.map.width * scale;
  const mapH = model.map.height * scale;
  const ox = width - mapW - 18;
  const oy = 18;
  ctx.save(); ctx.globalAlpha = .92; ctx.fillStyle = "#171322"; ctx.fillRect(ox - 5, oy - 5, mapW + 10, mapH + 10);
  for (const tile of model.map.tiles) {
    ctx.fillStyle = tile.kind === "water" || tile.kind === "hazard" ? "#29304f" : tile.kind === "plaza" ? "#a07772" : tile.kind === "path" ? "#84674f" : "#416249";
    ctx.fillRect(ox + tile.x * scale, oy + tile.y * scale, scale, scale);
  }
  ctx.fillStyle = "#f05f5f"; for (const spawn of model.map.spawns) ctx.fillRect(ox + spawn.x * scale - 1, oy + spawn.y * scale - 1, 3, 3);
  ctx.fillStyle = "#66e3ff"; ctx.fillRect(ox + model.player.drawX * scale - 2, oy + model.player.drawY * scale - 2, 5, 5);
  ctx.strokeStyle = "#d3a65b"; ctx.strokeRect(ox - 5.5, oy - 5.5, mapW + 11, mapH + 11); ctx.restore();
}

export default function IdleWorld({ controller }: { controller: IdleGameController }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef(controller);
  const modelRef = useRef<WorldModel | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const engagementRef = useRef(false);
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
      hitParticles: [],
      lastEnemyHp: controllerRef.current.game.enemy.hp,
      lastFrameAt: performance.now(),
    };
    setPosition(start);
    engagementRef.current = false;
    controllerRef.current.setWorldMounted(true);
    controllerRef.current.setCombatEngaged(false);
    return () => controllerRef.current.setWorldMounted(false);
  }, [map]);

  useEffect(() => {
    const sources = new Set<string>();
    for (const creature of controller.game.creatures) sources.add(creatureSpritePath(creature.species, creature.stage));
    sources.add(creatureSpritePath(controller.game.zoneId, "adult"));
    sources.add(creatureSpritePath(controller.game.zoneId, "legend"));
    for (const source of sources) {
      if (imagesRef.current.has(source)) continue;
      const image = new Image(); image.src = source; image.onload = () => { imagesRef.current.set(source, image); };
    }
    // Preload world sprites for player (adult of current zone)
    preloadWorldCharacterSprites(controller.game.zoneId, "adult").then((imgs) => {
      for (const [path, img] of imgs) imagesRef.current.set(path, img);
    });
    // Preload enemy sprites (adult + legend of current zone)
    preloadZoneEnemySprites(controller.game.zoneId).then((imgs) => {
      for (const [path, img] of imgs) imagesRef.current.set(path, img);
    });
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
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = (now: number) => {
      const canvas = canvasRef.current;
      const model = modelRef.current;
      if (!canvas || !model) { animationRef.current = requestAnimationFrame(frame); return; }
      const game = controllerRef.current.game;
      model.lastFrameAt = now;

      if (game.enemy.serial !== model.lastEnemySerial) {
        model.hitParticles.push({ x: model.target.x, y: model.target.y, born: now, color: game.enemy.isBoss ? "#ffd361" : "#f3a45d" });
        model.lastEnemySerial = game.enemy.serial;
        model.target.spawnIndex = game.enemy.serial % model.map.spawns.length;
        const spawn = model.map.spawns[model.target.spawnIndex];
        model.target.x = spawn.x; model.target.y = spawn.y;
        model.player.path = [];
        model.lastAutoPathAt = 0;
        engagementRef.current = false;
        controllerRef.current.setCombatEngaged(false);
      }
      if (game.enemy.hp < model.lastEnemyHp - 1) model.hitParticles.push({ x: model.target.x, y: model.target.y, born: now, color: "#ff7c71" });
      model.lastEnemyHp = game.enemy.hp;

      const player = model.player;
      if (player.moving) {
        const progress = Math.min(1, (now - player.moveStarted) / STEP_MS);
        const eased = progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        player.drawX = player.fromX + (player.toX - player.fromX) * eased;
        player.drawY = player.fromY + (player.toY - player.fromY) * eased;
        player.walkFrame = Math.floor(progress * 4) % 4;
        if (progress >= 1) {
          player.x = player.toX; player.y = player.toY; player.drawX = player.x; player.drawY = player.y; player.moving = false;
          model.trail.unshift({ x: player.x, y: player.y }); model.trail = model.trail.slice(0, 14);
          savePosition(model.map, player); setPosition({ x: player.x, y: player.y });
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
          player.fromX = player.x; player.fromY = player.y; player.toX = next.x; player.toY = next.y;
          const dir = directionBetween(player, next);
          player.direction = dir;
          player.worldDir = directionFromDelta(next.x - player.x, next.y - player.y);
          player.cardinalDir = cardinalFromDelta(next.x - player.x, next.y - player.y);
          player.walkFrame = 0;
          player.moveStarted = now; player.moving = true;
        }
      }

      const dpr = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
      const width = canvas.width / dpr; const height = canvas.height / dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) { animationRef.current = requestAnimationFrame(frame); return; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
      const worldW = model.map.width * DRAW_TILE; const worldH = model.map.height * DRAW_TILE;
      const cameraX = Math.max(0, Math.min(worldW - width, player.drawX * DRAW_TILE + DRAW_TILE / 2 - width / 2));
      const cameraY = Math.max(0, Math.min(worldH - height, player.drawY * DRAW_TILE + DRAW_TILE / 2 - height / 2));
      drawGround(ctx, model.map, cameraX, cameraY, width, height);
      const palette = PALETTES[model.map.zoneId];

      type DrawItem = { y: number; draw: () => void };
      const items: DrawItem[] = [];
      for (const structure of model.map.structures) {
        items.push({ y: structure.y + structure.height - .2, draw: () => drawStructure(ctx, structure, cameraX, cameraY, palette) });
      }
      for (const prop of model.map.props) {
        const sx = prop.x * DRAW_TILE + DRAW_TILE / 2 - cameraX; const sy = prop.y * DRAW_TILE + DRAW_TILE * .74 - cameraY;
        if (sx < -60 || sy < -80 || sx > width + 60 || sy > height + 80) continue;
        items.push({ y: prop.y, draw: () => drawProp(ctx, prop.kind, sx, sy, prop.variant, palette) });
      }
      for (const npc of model.map.npcs) {
        const sx = npc.x * DRAW_TILE + DRAW_TILE / 2 - cameraX; const sy = npc.y * DRAW_TILE + DRAW_TILE * .62 - cameraY;
        const npcImg = imagesRef.current.get(worldIdleSpritePath(controller.game.zoneId, "adult", "south"));
        items.push({ y: npc.y, draw: () => { if (npcImg) ctx.drawImage(npcImg, sx - 24, sy - 39, 48, 48); else drawPorter(ctx, sx, sy, "down", false, npc.palette, .72); drawLabel(ctx, npc.name, sx, sy - 34, "#ffe09a", true); drawLabel(ctx, npc.role, sx, sy - 24, "#c8b9cc", true); } });
      }
      // Ambient Porters make the outpost read as a social spawn without pretending to be online players.
      const crowd = [[-5,3],[-3,3],[-1,3],[1,3],[3,3],[5,3],[-5,5],[-2,5],[2,5],[5,5]];
      const porterStages: Stage[] = ["adult", "adult", "hatchling", "adult", "legend", "adult", "hatchling", "adult", "legend", "adult"];
      crowd.forEach(([dx, dy], index) => {
        const tx = model.map.hub.x + 6 + dx; const ty = model.map.hub.y + dy;
        const sx = tx * DRAW_TILE + DRAW_TILE / 2 - cameraX; const sy = ty * DRAW_TILE + DRAW_TILE * .62 - cameraY;
        const porterImg = imagesRef.current.get(worldIdleSpritePath(controller.game.zoneId, porterStages[index], index % 2 ? "west" : "east"));
        items.push({ y: ty, draw: () => { if (porterImg) ctx.drawImage(porterImg, sx - 24, sy - 39, 48, 48); else drawPorter(ctx, sx, sy, index % 2 ? "left" : "right", (Math.floor(now / 500) + index) % 3 === 0, index + 1, .62); drawLabel(ctx, `Wayfarer ${index + 2}`, sx, sy - 27, "#d9c3df", true); } });
      });

      const enemyStage = game.enemy.isBoss ? "legend" : "adult";
      const enemyImg = imagesRef.current.get(worldIdleSpritePath(game.zoneId, enemyStage, "south"));
      model.map.spawns.forEach((spawn, index) => {
        const sx = spawn.x * DRAW_TILE + DRAW_TILE / 2 - cameraX; const sy = spawn.y * DRAW_TILE + DRAW_TILE * .58 - cameraY;
        const active = index === model.target.spawnIndex;
        items.push({ y: spawn.y, draw: () => {
          ctx.save(); ctx.globalAlpha = active ? 1 : .68;
          if (active) { ctx.strokeStyle = game.enemy.isBoss ? "#ffd25e" : "#ef786f"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy + 12, 24, 10, 0, 0, Math.PI * 2); ctx.stroke(); }
          if (enemyImg) ctx.drawImage(enemyImg, sx - 24, sy - 39 + Math.sin(now / 350 + index) * 2, 48, 48);
          else { ctx.fillStyle = active ? "#d7625f" : "#8a5963"; ctx.beginPath(); ctx.arc(sx, sy - 8, active ? 17 : 12, 0, Math.PI * 2); ctx.fill(); }
          if (active) {
            drawLabel(ctx, game.enemy.name, sx, sy - 52, game.enemy.isBoss ? "#ffe087" : "#fff0d2");
            ctx.fillStyle = "#1a111b"; ctx.fillRect(sx - 31, sy - 45, 62, 6); ctx.fillStyle = "#e6525f"; ctx.fillRect(sx - 29, sy - 43, 58 * Math.max(0, game.enemy.hp / game.enemy.maxHp), 2);
          }
          ctx.restore();
        } });
      });

      const party = activeCreatures(game);
      party.slice(1).forEach((creature, index) => {
        const trailPoint = model.trail[Math.min(model.trail.length - 1, 3 + index * 3)] ?? player;
        const sx = trailPoint.x * DRAW_TILE + DRAW_TILE / 2 - cameraX + (index ? 8 : -8); const sy = trailPoint.y * DRAW_TILE + DRAW_TILE * .65 - cameraY;
        const trailIdx = Math.min(model.trail.length - 1, 3 + index * 3);
        const nextPoint = model.trail[Math.max(0, trailIdx - 1)] ?? player;
        const dir = directionFromDelta(trailPoint.x - nextPoint.x, trailPoint.y - nextPoint.y);
        const image = imagesRef.current.get(worldIdleSpritePath(creature.species, creature.stage, dir));
        items.push({ y: trailPoint.y - .05 + index * .01, draw: () => { if (image) ctx.drawImage(image, sx - 24, sy - 39, 48, 48); } });
      });
      const playerX = player.drawX * DRAW_TILE + DRAW_TILE / 2 - cameraX; const playerY = player.drawY * DRAW_TILE + DRAW_TILE * .62 - cameraY;
      items.push({ y: player.drawY, draw: () => {
        const playerImg = imagesRef.current.get(
          player.moving
            ? worldWalkSpritePath(controller.game.zoneId, "adult", player.cardinalDir, player.walkFrame)
            : worldIdleSpritePath(controller.game.zoneId, "adult", player.worldDir)
        );
        if (playerImg) {
          ctx.drawImage(playerImg, playerX - 24, playerY - 39, 48, 48);
        } else {
          drawPorter(ctx, playerX, playerY, player.direction, player.moving, 0, .9);
        }
        drawLabel(ctx, "Wayfarer_01", playerX, playerY - 43, "#71e4f2");
      } });
      items.sort((a, b) => a.y - b.y); for (const item of items) item.draw();

      model.hitParticles = model.hitParticles.filter((particle) => now - particle.born < 650);
      for (const particle of model.hitParticles) {
        const age = (now - particle.born) / 650; const sx = particle.x * DRAW_TILE + DRAW_TILE / 2 - cameraX; const sy = particle.y * DRAW_TILE - cameraY - age * 28;
        ctx.globalAlpha = 1 - age; ctx.fillStyle = particle.color; ctx.font = "bold 14px monospace"; ctx.fillText("✦", sx + Math.sin(age * 15) * 12, sy); ctx.globalAlpha = 1;
      }
      drawMinimap(ctx, model, width);
      animationRef.current = requestAnimationFrame(frame);
    };
    animationRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  const onCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; const model = modelRef.current; if (!canvas || !model) return;
    const rect = canvas.getBoundingClientRect();
    const worldW = model.map.width * DRAW_TILE; const worldH = model.map.height * DRAW_TILE;
    const cameraX = Math.max(0, Math.min(worldW - rect.width, model.player.drawX * DRAW_TILE + DRAW_TILE / 2 - rect.width / 2));
    const cameraY = Math.max(0, Math.min(worldH - rect.height, model.player.drawY * DRAW_TILE + DRAW_TILE / 2 - rect.height / 2));
    const goal = { x: Math.floor((event.clientX - rect.left + cameraX) / DRAW_TILE), y: Math.floor((event.clientY - rect.top + cameraY) / DRAW_TILE) };
    const pathStart = model.player.moving ? { x: model.player.toX, y: model.player.toY } : { x: model.player.x, y: model.player.y };
    model.player.path = findPath(model.map, pathStart, goal);
    model.lastManualAt = performance.now(); setMode("manual"); canvas.focus();
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
