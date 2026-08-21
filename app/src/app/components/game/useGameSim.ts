"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Species } from "@/utils/portage";
import { TICK_MS, type CombatEvent, type GameState } from "@/game/core/types";
import { createWorldMap, type WorldMap } from "@/game/world/map";
import { advance } from "@/game/sim/tick";
import { createInitialState, travelTo } from "@/game/sim/state";
import { catchUp, hydrate, persist } from "@/game/sim/save";
import { MAX_SETTLE_TICKS, SETTLE_LIMIT, planFrame } from "@/game/sim/clock";
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
 * The hook owns the clock; everything else is the simulation's business.
 *
 * Nothing here steers the caravan, and nothing may. The client used to hand
 * the player a walk-here click, a click-to-mark and the arrow keys, each
 * suspending auto-hunt for five seconds so the two would not fight over the
 * same character — which made the game answer the mouse, and a game that
 * answers the mouse is not idle. What the player acts on is the pack, the
 * roster and the post: everything on the field decides for itself.
 */

export interface GameSim {
  state: GameState;
  map: WorldMap;
  events: CombatEvent[];
  hydrated: boolean;
  saveFailed: boolean;
  /** Ticks the caravan hunted while away, once the catch-up has finished. */
  offlineTicks: number;
  /** Real seconds the player was gone, which may exceed what was hunted. */
  awaySeconds: number;
  /** 0..1 while the catch-up runs; null when it is not running. */
  catchUpProgress: number | null;
  dismissOffline: () => void;
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

  const stateRef = useRef(state);
  const lastFrameRef = useRef(0);
  const carryRef = useRef(0);
  const settlingRef = useRef(false);

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

  /**
   * Pay off world the player was not watching, without showing it to them.
   *
   * The hunt is never cheated of the time — the ticks are run, through the same
   * reducer as live play — but they are run in one pass with the events thrown
   * away, so the caravan is simply *found* where an absence would have left it.
   * Sprites that end up more than a tile from where they started snap there;
   * that is the renderer's respawn rule, and it is exactly right here.
   *
   * Anything past a few minutes goes through the chunked catch-up instead, with
   * the progress bar the offline path already shows, because settling eight
   * hours in one call locks the tab for as long as it takes.
   */
  const settle = useCallback((owed: number) => {
    const ticks = Math.min(owed, MAX_SETTLE_TICKS);
    const resume = () => {
      settlingRef.current = false;
      lastFrameRef.current = performance.now();
      carryRef.current = 0;
    };

    settlingRef.current = true;
    if (ticks <= SETTLE_LIMIT) {
      const result = advance(stateRef.current, mapRef.current, ticks, { collectEvents: false });
      result.state.lastUpdatedAt = Date.now();
      stateRef.current = result.state;
      setState(result.state);
      resume();
      return;
    }

    setCatchUpProgress(0);
    void catchUp(stateRef.current, ticks, (done, total) => setCatchUpProgress(done / total)).then((caught) => {
      stateRef.current = caught;
      setState(caught);
      setCatchUpProgress(null);
      resume();
    });
  }, []);

  // The clock. One interval drives the simulation at a fixed timestep; the
  // renderer interpolates between ticks on its own animation frame.
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setInterval(() => {
      // A settle in flight owns the clock; the interval keeps firing under it.
      if (settlingRef.current) {
        lastFrameRef.current = performance.now();
        carryRef.current = 0;
        return;
      }

      const now = performance.now();
      const elapsed = now - lastFrameRef.current;
      lastFrameRef.current = now;
      carryRef.current += elapsed;

      // The whole debt leaves the clock here, however it is paid. Carrying the
      // unpaid part into later frames is what the fast-forward was made of: the
      // backlog outlived the moment it was owed and played out at speed.
      const plan = planFrame(carryRef.current);
      carryRef.current = plan.carryMs;
      if (plan.kind === "idle") return;
      if (plan.kind !== "play") {
        settle(plan.ticks);
        return;
      }

      const result = advance(stateRef.current, mapRef.current, plan.ticks);
      result.state.lastUpdatedAt = Date.now();
      stateRef.current = result.state;
      setState(result.state);
      if (result.events.length) setEvents(result.events);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [hydrated, settle]);

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
    saveFailed,
    offlineTicks,
    dismissOffline: () => setOfflineTicks(0),
    changeZone,
    reset,
  };
}
