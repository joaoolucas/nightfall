"use client";

import { useEffect, useRef } from "react";
import type { GridPoint } from "@/game/core/grid";
import {
  advanceVisuals,
  createScene,
  entityAtTile,
  ingestEvents,
  render,
  tileAtPoint,
} from "@/game/render/renderer";
import { loadCharacter } from "@/game/render/sprites";
import { loadAll, zoneEnvironmentSources } from "@/utils/world-art";
import { loadTileset, type TilesetData } from "@/utils/world-tilesets";
import { itemSpritePath } from "@/game/world/items";
import { ITEMS } from "@/game/world/items";
import type { GameSim } from "./useGameSim";
import styles from "./client.module.css";

const KEY_DELTAS: Record<string, GridPoint> = {
  KeyW: { x: 0, y: -1 }, ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 }, ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  KeyQ: { x: -1, y: -1 }, KeyE: { x: 1, y: -1 },
  KeyZ: { x: -1, y: 1 }, KeyC: { x: 1, y: 1 },
};

export default function Viewport({ sim }: { sim: GameSim }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(createScene());
  const simRef = useRef(sim);
  const tilesetRef = useRef<TilesetData | null>(null);
  const frameRef = useRef(0);
  const lastEventsRef = useRef<typeof sim.events>([]);

  useEffect(() => { simRef.current = sim; }, [sim]);

  // Load every sprite the current biome can show.
  useEffect(() => {
    const zone = sim.state.zoneId;
    const ids = new Set<string>();
    for (const entity of sim.state.entities) ids.add(entity.charId);
    for (const companion of sim.state.companions) ids.add(`${companion.species}`);
    ids.add("wayfarer");
    for (const id of ids) void loadCharacter(id);
    void loadAll(zoneEnvironmentSources(zone));
    void loadAll(ITEMS.map((item) => itemSpritePath(item.id)));
    loadTileset(zone).then((tileset) => { tilesetRef.current = tileset; }).catch(() => { tilesetRef.current = null; });
  }, [sim.state.zoneId, sim.state.entities, sim.state.companions]);

  // Feed newly produced simulation events into the transient visuals.
  useEffect(() => {
    if (sim.events === lastEventsRef.current) return;
    lastEventsRef.current = sim.events;
    ingestEvents(sceneRef.current, sim.state, sim.events, performance.now());
  }, [sim.events, sim.state]);

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
    let previous = performance.now();
    const frame = (now: number) => {
      const canvas = canvasRef.current;
      const current = simRef.current;
      if (canvas && current) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const rect = canvas.getBoundingClientRect();
          const dpr = canvas.width / Math.max(1, rect.width);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          advanceVisuals(sceneRef.current, current.state, now - previous);
          render({
            ctx,
            scene: sceneRef.current,
            state: current.state,
            map: current.map,
            tileset: tilesetRef.current,
            width: canvas.width / dpr,
            height: canvas.height / dpr,
            now,
          });
        }
      }
      previous = now;
      frameRef.current = requestAnimationFrame(frame);
    };
    frameRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const pointTo = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return tileAtPoint(sceneRef.current, event.clientX - rect.left, event.clientY - rect.top);
  };

  return (
    <div className={styles.viewport}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        tabIndex={0}
        aria-label="Game world. Move with WASD or the arrow keys, click a tile to walk, click a creature to attack."
        onMouseMove={(event) => { sceneRef.current.hoverTile = pointTo(event); }}
        onMouseLeave={() => { sceneRef.current.hoverTile = null; }}
        onClick={(event) => {
          const tile = pointTo(event);
          const entity = entityAtTile(simRef.current.state, tile);
          if (entity && entity.kind === "monster") simRef.current.setTarget(entity.id);
          else simRef.current.walkTo(tile);
          event.currentTarget.focus();
        }}
        onKeyDown={(event) => {
          if (event.code === "Escape") { simRef.current.setTarget(null); return; }
          const delta = KEY_DELTAS[event.code];
          if (!delta) return;
          event.preventDefault();
          simRef.current.step(delta);
        }}
      />
      <div className={styles.viewportBadge}>
        <b>{sim.manual ? "MANUAL" : sim.state.settings.autoHunt ? "AUTO-HUNT" : "IDLE"}</b>
        <span>WASD · QEZC diagonals · click to walk or attack · Esc clears target</span>
      </div>
    </div>
  );
}
