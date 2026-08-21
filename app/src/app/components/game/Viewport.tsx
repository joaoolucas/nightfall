"use client";

import { useEffect, useMemo, useRef } from "react";
import { advanceVisuals, createScene, ingestEvents, render } from "@/game/render/renderer";
import { loadCharacter } from "@/game/render/sprites";
import {
  AMBIENT_CHARACTERS,
  NPC_CHARACTER,
  PLAYER_CHARACTER,
  creatureCharacterId,
  loadAll,
  zoneEnvironmentSources,
} from "@/utils/world-art";
import { loadTileset, type TilesetData } from "@/utils/world-tilesets";
import { MONSTERS } from "@/game/world/monsters";
import { loadAtlas } from "@/game/render/atlas";
import type { GameSim } from "./useGameSim";
import styles from "./client.module.css";

export default function Viewport({ sim }: { sim: GameSim }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(createScene());
  const simRef = useRef(sim);
  const tilesetRef = useRef<TilesetData | null>(null);
  const frameRef = useRef(0);
  const lastEventsRef = useRef<typeof sim.events>([]);

  useEffect(() => { simRef.current = sim; }, [sim]);

  /**
   * The characters this biome can actually show: the Porter, the party, and the
   * monsters that spawn here. Twelve or so folders rather than all twenty-six.
   *
   * Two things matter here. The list must not depend on `state.entities`, which
   * the reducer rebuilds every tick — keying on that re-ran the effect at the
   * tick rate and restarted the tileset load each time. And it must not simply
   * load every character in the catalogue either: that is roughly twelve hundred
   * frames, instant from a local cache and slow enough over a real network that
   * monsters render as placeholder blocks for the first stretch of play.
   */
  const characterKey = useMemo(() => {
    const ids = new Set<string>([PLAYER_CHARACTER]);
    for (const template of MONSTERS) if (template.species === sim.state.zoneId) ids.add(template.charId);
    for (const id of sim.state.activeCompanionIds) {
      const companion = sim.state.companions.find((candidate) => candidate.id === id);
      if (companion) ids.add(creatureCharacterId(companion.species, companion.stage));
    }
    return [...ids].sort().join(",");
  }, [sim.state.zoneId, sim.state.activeCompanionIds, sim.state.companions]);

  /**
   * Every creature the player owns, for the roster portraits.
   *
   * This has to be a string, not the companions array: the reducer rebuilds
   * that array every tick, so depending on it directly would re-run the loader
   * ten times a second — the same stampede that once left the ground blank.
   */
  const rosterKey = useMemo(
    () => sim.state.companions.map((c) => creatureCharacterId(c.species, c.stage)).sort().join(","),
    [sim.state.companions],
  );

  useEffect(() => {
    const zone = sim.state.zoneId;
    // Request order is load order: the browser serves these in the order they
    // are queued, so the ground and the combatants must come before decoration
    // and before the residents who are only visible back at the hub.
    void loadAtlas(`tilesets/${zone}`);
    loadTileset(zone)
      .then((tileset) => { tilesetRef.current = tileset; })
      .catch(() => { tilesetRef.current = null; });
    for (const id of characterKey.split(",")) void loadCharacter(id);
    void loadAtlas("items");
    void loadAll(zoneEnvironmentSources(zone));
    for (const id of [...Object.values(NPC_CHARACTER), ...AMBIENT_CHARACTERS]) void loadCharacter(id);
    // The roster panel draws every creature you own from its world sprite, so
    // those atlases are needed even for creatures that are not in the field.
    // They come last: a portrait can wait, the world cannot.
    for (const id of rosterKey.split(",")) void loadCharacter(id);
  }, [sim.state.zoneId, characterKey, rosterKey]);

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
          advanceVisuals(sceneRef.current, current.state, now - previous, now);
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

  /**
   * The viewport is a window, not a controller.
   *
   * Clicking a tile walked the Porter there and clicking a creature marked it,
   * which meant the caravan answered the mouse — and a caravan that answers the
   * mouse is not idle, it is a game you are playing badly with one hand. The
   * hover highlight went with the handlers: an outline that follows the cursor
   * promises a click that now does nothing.
   */
  return (
    <div className={styles.viewport}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label="The caravan hunts on its own. Watch the world, the battle log and your pack."
      />
    </div>
  );
}
