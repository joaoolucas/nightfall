import { TICK_MS, type GameState } from "../core/types";
import { createWorldMap } from "../world/map";
import { itemDef } from "../world/items";
import { advance } from "./tick";
import { SAVE_VERSION, createInitialState } from "./state";

/**
 * Persistence and offline catch-up.
 *
 * The catch-up runs the *same* reducer as live play rather than a parallel
 * estimation formula. The previous implementation used a closed-form
 * approximation that could disagree with what actually happens on screen; here
 * an eight-hour absence is simply 288,000 ticks of the real simulation, chunked
 * so the loop stays responsive.
 */

const SAVE_KEY = "portage-save-v2";
/** The longest absence that still pays out, in real seconds. */
export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
/** Ticks simulated per chunk while catching up. */
const CATCHUP_CHUNK = 600;

export interface HydrateResult {
  state: GameState;
  offlineTicks: number;
  failed: boolean;
}

export function persist(state: GameState): boolean {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastUpdatedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** Reject a save that is the wrong shape rather than crashing on it later. */
function validate(value: unknown): GameState | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as Partial<GameState>;
  if (saved.version !== SAVE_VERSION) return null;
  if (!Array.isArray(saved.entities) || !Array.isArray(saved.spawns)) return null;
  if (!saved.progress || !saved.inventory || !saved.settings) return null;
  if (!saved.entities.some((entity) => entity?.kind === "player")) return null;

  const finite = (input: unknown, fallback: number, min = 0) =>
    typeof input === "number" && Number.isFinite(input) ? Math.max(min, input) : fallback;

  const base = createInitialState(saved.zoneId ?? "ember", 0);
  const state: GameState = {
    ...base,
    ...(saved as GameState),
    tick: finite(saved.tick, 0),
    seed: finite(saved.seed, base.seed),
    killSerial: finite(saved.killSerial, 0),
    kills: finite(saved.kills, 0),
    deaths: finite(saved.deaths, 0),
    playSeconds: finite(saved.playSeconds, 0),
    nextEntitySerial: finite(saved.nextEntitySerial, 1000, 1000),
    lastUpdatedAt: finite(saved.lastUpdatedAt, Date.now()),
    progress: { ...base.progress, ...saved.progress },
    inventory: { ...base.inventory, ...saved.inventory },
    settings: { ...base.settings, ...saved.settings },
    chain: { ...base.chain, ...saved.chain },
  };

  // Drop any stack naming an item that no longer exists in the catalogue.
  state.inventory.stacks = state.inventory.stacks.filter((stack) => {
    try { itemDef(stack.defId); return true; } catch { return false; }
  });
  state.ground = (state.ground ?? []).map((pile) => ({
    ...pile,
    items: pile.items.filter((stack) => {
      try { itemDef(stack.defId); return true; } catch { return false; }
    }),
  }));
  return state;
}

export function hydrate(now: number): HydrateResult {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SAVE_KEY);
  } catch {
    return { state: { ...createInitialState("ember", now), lastUpdatedAt: now }, offlineTicks: 0, failed: true };
  }
  if (!raw) return { state: { ...createInitialState("ember", now), lastUpdatedAt: now }, offlineTicks: 0, failed: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: { ...createInitialState("ember", now), lastUpdatedAt: now }, offlineTicks: 0, failed: false };
  }

  const state = validate(parsed);
  if (!state) return { state: { ...createInitialState("ember", now), lastUpdatedAt: now }, offlineTicks: 0, failed: false };

  const away = Math.max(0, Math.min(MAX_OFFLINE_SECONDS, (now - state.lastUpdatedAt) / 1000));
  if (away < 10 || !state.settings.autoHunt) {
    return { state: { ...state, lastUpdatedAt: now }, offlineTicks: 0, failed: false };
  }
  const caught = catchUp(state, Math.floor((away * 1000) / TICK_MS));
  return { state: { ...caught, lastUpdatedAt: now }, offlineTicks: Math.floor((away * 1000) / TICK_MS), failed: false };
}

/** Run `ticks` of the real simulation, discarding events to stay fast. */
export function catchUp(state: GameState, ticks: number): GameState {
  const map = createWorldMap(state.zoneId);
  let current = state;
  let remaining = ticks;
  while (remaining > 0) {
    const chunk = Math.min(CATCHUP_CHUNK, remaining);
    current = advance(current, map, chunk, { manualControl: false, collectEvents: false }).state;
    remaining -= chunk;
  }
  return current;
}

export { SAVE_KEY };
