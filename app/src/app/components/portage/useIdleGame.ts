"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Species } from "@/utils/portage";
import {
  advanceGameTo,
  applyOfflineProgress,
  buyUpgrade,
  changeZone,
  createInitialGame,
  evolveCreature,
  hydrateGame,
  setEngaged,
  setGameSetting,
  setRunning,
  togglePartyMember,
  useTonic,
  type IdleGameState,
  type OfflineReport,
  type UpgradeKey,
} from "@/utils/idle-game";

const SAVE_KEY = "portage-idle-save-v1";

export interface IdleGameController {
  game: IdleGameState;
  hydrated: boolean;
  offlineReport: OfflineReport | null;
  saveStatus: "loading" | "saved" | "failed";
  dismissOfflineReport: () => void;
  toggleRunning: () => void;
  setCombatEngaged: (engaged: boolean) => void;
  setWorldMounted: (mounted: boolean) => void;
  selectZone: (zone: Species) => void;
  toggleSetting: (key: keyof IdleGameState["settings"]) => void;
  purchaseUpgrade: (key: UpgradeKey) => void;
  drinkTonic: () => void;
  toggleParty: (creatureId: string) => void;
  evolve: (creatureId: string) => void;
  reset: () => void;
}

export function useIdleGame(): IdleGameController {
  const [game, setGame] = useState<IdleGameState>(() => createInitialGame());
  const [hydrated, setHydrated] = useState(false);
  const [offlineReport, setOfflineReport] = useState<OfflineReport | null>(null);
  const [saveStatus, setSaveStatus] = useState<"loading" | "saved" | "failed">("loading");
  const gameRef = useRef(game);
  const worldMountedRef = useRef(false);
  const abstractTravelAtRef = useRef(0);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    const now = Date.now();
    try {
      const stored = window.localStorage.getItem(SAVE_KEY);
      const result = stored ? hydrateGame(JSON.parse(stored), now) : applyOfflineProgress(createInitialGame(), now);
      setGame(result.state);
      setOfflineReport(result.report);
      setSaveStatus("saved");
    } catch {
      setGame({ ...createInitialGame(), lastUpdatedAt: now });
      setSaveStatus("failed");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !game.running) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const current = gameRef.current;
      if (!current.engaged) {
        // When the world canvas is not mounted, auto-roam becomes a short abstract
        // travel phase between encounters instead of stopping after one victory.
        if (!worldMountedRef.current && current.settings.autoRoam) {
          if (!abstractTravelAtRef.current) abstractTravelAtRef.current = now + 1_400;
          if (now >= abstractTravelAtRef.current) {
            const next = setEngaged(current, true, now);
            abstractTravelAtRef.current = 0;
            gameRef.current = next;
            setGame(next);
          }
        } else {
          abstractTravelAtRef.current = 0;
        }
        return;
      }
      abstractTravelAtRef.current = 0;
      if (current.lastUpdatedAt > 0 && now - current.lastUpdatedAt > 30_000) {
        const result = applyOfflineProgress(current, now);
        gameRef.current = result.state;
        setGame(result.state);
        if (result.report) setOfflineReport(result.report);
        return;
      }
      setGame((value) => advanceGameTo(value, now));
    }, 400);
    return () => window.clearInterval(timer);
  }, [hydrated, game.running]);

  useEffect(() => {
    if (!hydrated) return;
    const save = () => {
      try {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(gameRef.current));
        setSaveStatus("saved");
      } catch {
        setSaveStatus("failed");
      }
    };
    const timer = window.setInterval(save, 3000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        save();
        return;
      }
      const result = applyOfflineProgress(gameRef.current, Date.now());
      gameRef.current = result.state;
      setGame(result.state);
      if (result.report) setOfflineReport(result.report);
    };
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      save();
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hydrated]);

  const toggleRunning = useCallback(() => setGame((current) => setRunning(current, !current.running, Date.now())), []);
  const setCombatEngaged = useCallback((engaged: boolean) => setGame((current) => setEngaged(current, engaged, Date.now())), []);
  const setWorldMounted = useCallback((mounted: boolean) => {
    worldMountedRef.current = mounted;
    abstractTravelAtRef.current = 0;
  }, []);
  const selectZone = useCallback((zone: Species) => setGame((current) => changeZone(current, zone)), []);
  const toggleSetting = useCallback((key: keyof IdleGameState["settings"]) => setGame((current) => setGameSetting(current, key, !current.settings[key])), []);
  const purchaseUpgrade = useCallback((key: UpgradeKey) => setGame((current) => buyUpgrade(current, key)), []);
  const drinkTonic = useCallback(() => setGame((current) => useTonic(current)), []);
  const toggleParty = useCallback((creatureId: string) => setGame((current) => togglePartyMember(current, creatureId)), []);
  const evolve = useCallback((creatureId: string) => setGame((current) => evolveCreature(current, creatureId)), []);
  const reset = useCallback(() => {
    const next = { ...createInitialGame(), lastUpdatedAt: Date.now() };
    setGame(next);
    setOfflineReport(null);
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(next));
    } catch {
      setSaveStatus("failed");
    }
  }, []);

  return {
    game,
    hydrated,
    offlineReport,
    saveStatus,
    dismissOfflineReport: () => setOfflineReport(null),
    toggleRunning,
    setCombatEngaged,
    setWorldMounted,
    selectZone,
    toggleSetting,
    purchaseUpgrade,
    drinkTonic,
    toggleParty,
    evolve,
    reset,
  };
}
