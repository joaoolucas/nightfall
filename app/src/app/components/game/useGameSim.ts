"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Species } from "@/utils/portage";
import { distance, type GridPoint } from "@/game/core/grid";
import { findPath } from "@/game/core/pathfind";
import { TICK_MS, type CombatEvent, type GameState } from "@/game/core/types";
import { Occupancy, createWorldMap, walkableFor, type WorldMap } from "@/game/world/map";
import { advance } from "@/game/sim/tick";
import { PLAYER_ID, createInitialState, playerOf, travelTo } from "@/game/sim/state";
import { catchUp, hydrate, persist } from "@/game/sim/save";
import {
  buyItem,
  choosePotion as choosePotionAction,
  dropStack,
  putIntoPile,
  sellStack,
  summonCompanion,
  takeAllFromPile,
  takeFromPile,
  useStack,
} from "@/game/sim/actions";

/**
 * Bridges the headless simulation to React.
 *
 * The hook owns the clock and the manual-control flag; everything else is the
 * simulation's business. Manual steering suppresses auto-hunt for a few seconds
 * so taking control never fights the idle AI for the same character.
 */

const MANUAL_HOLD_MS = 5_000;
/** Never simulate more than this in one visible frame, to avoid a stall. */
const MAX_CATCHUP_TICKS = 40;

export interface GameSim {
  state: GameState;
  map: WorldMap;
  events: CombatEvent[];
  hydrated: boolean;
  manual: boolean;
  saveFailed: boolean;
  /** Ticks the caravan hunted while away, once the catch-up has finished. */
  offlineTicks: number;
  /** Real seconds the player was gone, which may exceed what was hunted. */
  awaySeconds: number;
  /** 0..1 while the catch-up runs; null when it is not running. */
  catchUpProgress: number | null;
  dismissOffline: () => void;
  walkTo: (goal: GridPoint) => void;
  step: (delta: GridPoint) => void;
  setTarget: (entityId: string | null) => void;
  choosePotion: (defId: string | null) => void;
  takeItem: (pileId: string, instanceId: string) => void;
  takeAll: (pileId: string) => void;
  putItem: (instanceId: string, pileId: string) => void;
  use: (instanceId: string) => void;
  drop: (instanceId: string) => void;
  sell: (instanceId: string, count?: number) => void;
  buy: (defId: string, count?: number) => void;
  summon: (companionId: string) => void;
  changeZone: (zone: Species) => void;
  reset: () => void;
}

export function useGameSim(): GameSim {
  const [state, setState] = useState<GameState>(() => createInitialState("ember", 0));
  const [hydrated, setHydrated] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [offlineTicks, setOfflineTicks] = useState(0);
  const [catchUpProgress, setCatchUpProgress] = useState<number | null>(null);
  const [awaySeconds, setAwaySeconds] = useState(0);
  const [events, setEvents] = useState<CombatEvent[]>([]);
  const [manual, setManual] = useState(false);

  const stateRef = useRef(state);
  const manualUntilRef = useRef(0);
  const lastFrameRef = useRef(0);
  const carryRef = useRef(0);

  const map = useMemo(() => createWorldMap(state.zoneId), [state.zoneId]);
  const mapRef = useRef(map);
  useEffect(() => { mapRef.current = map; }, [map]);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Load the save, then run the offline catch-up through the real rules.
  //
  // The catch-up is deliberately not part of first paint: eight hours is
  // 288,000 ticks and measures at about sixteen seconds, which froze the tab
  // when it ran synchronously. The world appears immediately and the simulation
  // fills in behind a progress bar.
  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const result = hydrate(now);
    stateRef.current = result.state;
    setState(result.state);
    setSaveFailed(result.failed);

    if (result.offlineTicks <= 0) {
      setHydrated(true);
      lastFrameRef.current = performance.now();
      return;
    }

    setCatchUpProgress(0);
    void catchUp(result.state, result.offlineTicks, (done, total) => {
      if (!cancelled) setCatchUpProgress(done / total);
    }).then((caught) => {
      if (cancelled) return;
      stateRef.current = caught;
      setState(caught);
      setCatchUpProgress(null);
      setOfflineTicks(result.offlineTicks);
      setAwaySeconds(result.awaySeconds);
      setHydrated(true);
      lastFrameRef.current = performance.now();
    });

    return () => { cancelled = true; };
  }, []);

  // The clock. One interval drives the simulation at a fixed timestep; the
  // renderer interpolates between ticks on its own animation frame.
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - lastFrameRef.current;
      lastFrameRef.current = now;
      carryRef.current += elapsed;
      const ticks = Math.min(MAX_CATCHUP_TICKS, Math.floor(carryRef.current / TICK_MS));
      if (ticks <= 0) return;
      carryRef.current -= ticks * TICK_MS;

      const isManual = Date.now() < manualUntilRef.current;
      const result = advance(stateRef.current, mapRef.current, ticks, { manualControl: isManual });
      result.state.lastUpdatedAt = Date.now();
      stateRef.current = result.state;
      setState(result.state);
      if (result.events.length) setEvents(result.events);
      setManual(isManual);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [hydrated]);

  // Persist periodically and whenever the tab is hidden.
  useEffect(() => {
    if (!hydrated) return;
    const save = () => setSaveFailed(!persist(stateRef.current));
    const timer = window.setInterval(save, 4000);
    const onVisibility = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      save();
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hydrated]);

  const takeControl = useCallback(() => {
    manualUntilRef.current = Date.now() + MANUAL_HOLD_MS;
    setManual(true);
  }, []);

  const walkTo = useCallback((goal: GridPoint) => {
    takeControl();
    const current = stateRef.current;
    const player = playerOf(current);
    const path = findPath(player, goal, {
      walkable: walkableFor(mapRef.current, new Occupancy(current.entities), PLAYER_ID),
      maxNodes: 3000,
    });
    if (!path.length) return;
    const next = {
      ...current,
      entities: current.entities.map((entity) => (entity.id === PLAYER_ID ? { ...entity, path, targetId: null } : entity)),
    };
    stateRef.current = next;
    setState(next);
  }, [takeControl]);

  const step = useCallback((delta: GridPoint) => {
    takeControl();
    const current = stateRef.current;
    const player = playerOf(current);
    const goal = { x: player.x + delta.x, y: player.y + delta.y };
    if (!walkableFor(mapRef.current, new Occupancy(current.entities), PLAYER_ID)(goal)) return;
    const next = {
      ...current,
      entities: current.entities.map((entity) => (entity.id === PLAYER_ID ? { ...entity, path: [goal] } : entity)),
    };
    stateRef.current = next;
    setState(next);
  }, [takeControl]);

  const setTarget = useCallback((entityId: string | null) => {
    takeControl();
    const current = stateRef.current;
    const player = playerOf(current);
    // Clicking a distant creature also walks to it, as the genre expects.
    const target = current.entities.find((entity) => entity.id === entityId);
    const path = target && distance(player, target) > 1
      ? findPath(player, target, {
          walkable: walkableFor(mapRef.current, new Occupancy(current.entities), PLAYER_ID),
          maxNodes: 3000,
          stopAdjacent: true,
        })
      : [];
    const next = {
      ...current,
      entities: current.entities.map((entity) => (entity.id === PLAYER_ID ? { ...entity, targetId: entityId, path } : entity)),
    };
    stateRef.current = next;
    setState(next);
  }, [takeControl]);

  /**
   * Inventory actions are pure transitions, so the hook only has to apply one
   * and keep its ref in step with the tick loop's view of the world.
   */
  const applyAction = useCallback((transform: (current: GameState) => GameState) => {
    setState((current) => {
      const next = transform(current);
      stateRef.current = next;
      return next;
    });
  }, []);

  const changeZone = useCallback((zone: Species) => {
    setState((current) => {
      // A fresh world for the new biome, carrying the Porter, their roster and
      // their pack across into it.
      const next = travelTo(current, zone, Date.now());
      stateRef.current = next;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next = createInitialState("ember", Date.now());
    stateRef.current = next;
    setState(next);
    setOfflineTicks(0);
    persist(next);
  }, []);

  return {
    takeItem: (pileId, instanceId) => applyAction((current) => takeFromPile(current, pileId, instanceId)),
    takeAll: (pileId) => applyAction((current) => takeAllFromPile(current, pileId)),
    putItem: (instanceId, pileId) => applyAction((current) => putIntoPile(current, instanceId, pileId)),
    use: (instanceId) => applyAction((current) => useStack(current, instanceId)),
    choosePotion: (defId) => applyAction((current) => choosePotionAction(current, defId)),
    drop: (instanceId) => applyAction((current) => dropStack(current, instanceId)),
    sell: (instanceId, count) => applyAction((current) => sellStack(current, instanceId, count)),
    buy: (defId, count) => applyAction((current) => buyItem(current, defId, count)),
    summon: (companionId) => applyAction((current) => summonCompanion(current, companionId)),
    state,
    map,
    catchUpProgress,
    awaySeconds,
    events,
    hydrated,
    manual,
    saveFailed,
    offlineTicks,
    dismissOffline: () => setOfflineTicks(0),
    walkTo,
    step,
    setTarget,
    changeZone,
    reset,
  };
}
