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
import {
  AMBIENT_CHARACTERS,
  NPC_CHARACTER,
  PLAYER_CHARACTER,
  creatureCharacterId,
  loadAll,
  zoneEnvironmentSources,
} from "@/utils/world-art";
import { SPECIES_LIST, STAGE_LIST } from "@/utils/portage";
import { loadTileset, type TilesetData } from "@/utils/world-tilesets";
import { MONSTERS } from "@/game/world/monsters";
import { ITEMS, itemSpritePath } from "@/game/world/items";
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

  /**
   * Load every sprite the biome can show, keyed on the zone alone.
   *
   * This must not depend on `state.entities`: that array is rebuilt every tick,
   * so the effect re-ran ten times a second and restarted the tileset load each
   * time. Locally the cache hid it; over real network latency the requests
   * stampeded and the ground never appeared. The set of characters a zone can
   * show is static, so it is derived from the catalogues instead.
   */
  useEffect(() => {
    const zone = sim.state.zoneId;
    const ids = new Set<string>([PLAYER_CHARACTER]);
    for (const id of Object.values(NPC_CHARACTER)) ids.add(id);
    for (const id of AMBIENT_CHARACTERS) ids.add(id);
    for (const template of MONSTERS) if (template.species === zone) ids.add(template.charId);
    for (const species of SPECIES_LIST) {
      for (const stage of STAGE_LIST) ids.add(creatureCharacterId(species, stage));
    }
    for (const id of ids) void loadCharacter(id);
    void loadAll(zoneEnvironmentSources(zone));
    void loadAll(ITEMS.map((item) => itemSpritePath(item.id)));
    loadTileset(zone)
      .then((tileset) => { tilesetRef.current = tileset; })
      .catch(() => { tilesetRef.current = null; });
  }, [sim.state.zoneId]);

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
