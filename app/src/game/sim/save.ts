import { TICK_MS, type GameState } from "../core/types";
import { createWorldMap } from "../world/map";
import { itemDef } from "../world/items";
import { advance } from "./tick";
import { MAX_ACTIVE_COMPANIONS, SAVE_VERSION, createInitialState } from "./state";

/**
 * Persistence and offline catch-up.
 *
 * The catch-up runs the *same* reducer as live play rather than a parallel
 * estimation formula, so what you are paid for matches what you would have
 * seen. That fidelity is not free: an eight-hour absence is 288,000 ticks and
 * measures at roughly sixteen seconds of work. Running it in one synchronous
 * pass froze the tab outright, so `catchUp` yields between chunks and reports
 * progress, and the client shows a bar while it runs.
 */

const SAVE_KEY = "portage-save-v2";

/**
 * How much of an absence is actually hunted.
 *
 * The catch-up replays real ticks rather than estimating, which is the whole
 * point — but that fidelity has a measured price: Chrome runs the simulation at
 * about 5,000 ticks per second, so a full eight hours would be 288,000 ticks
 * and just under a minute of waiting before the player could touch anything.
 *
 * So the caravan hunts for an hour and then makes camp. Nothing beyond that
 * hour is awarded: inventing rewards for time that was never simulated is
 * exactly the estimate this replaced, and it would let the numbers on screen
 * disagree with the rules of the game again.
 */
export const MAX_SIMULATED_SECONDS = 60 * 60;
/**
 * Ticks per chunk while catching up. Sized so a chunk costs roughly a frame:
 * small enough that the tab keeps painting, large enough that an eight-hour
 * absence does not pay the yield cost hundreds of times over.
 */
const CATCHUP_CHUNK = 2000;

export interface HydrateResult {
  state: GameState;
  /** Ticks still owed to the player; the caller runs them through catchUp. */
  offlineTicks: number;
  /** How long the player was actually gone, which may exceed what is hunted. */
  awaySeconds: number;
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

  // A save from before the one-creature rule may list a whole party; keep the
  // first and leave the rest on the roster rather than in the field.
  state.activeCompanionIds = state.activeCompanionIds.slice(0, MAX_ACTIVE_COMPANIONS);
  const allowed = new Set(state.activeCompanionIds.map((id) => `companion:${id}`));
  state.entities = state.entities.filter((entity) => entity.kind !== "companion" || allowed.has(entity.id));

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
    return { state: { ...createInitialState("ember", now), lastUpdatedAt: now }, offlineTicks: 0, awaySeconds: 0, failed: true };
  }
  if (!raw) return { state: { ...createInitialState("ember", now), lastUpdatedAt: now }, offlineTicks: 0, awaySeconds: 0, failed: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: { ...createInitialState("ember", now), lastUpdatedAt: now }, offlineTicks: 0, awaySeconds: 0, failed: false };
  }

  const state = validate(parsed);
  if (!state) return { state: { ...createInitialState("ember", now), lastUpdatedAt: now }, offlineTicks: 0, awaySeconds: 0, failed: false };

  const away = Math.max(0, (now - state.lastUpdatedAt) / 1000);
  const hunted = Math.min(MAX_SIMULATED_SECONDS, away);
  if (hunted < 10) {
    return { state: { ...state, lastUpdatedAt: now }, offlineTicks: 0, awaySeconds: away, failed: false };
  }
  // The simulation itself is left to the caller so it can be run off the
  // critical path with a progress indicator rather than blocking first paint.
  return {
    state,
    offlineTicks: Math.floor((hunted * 1000) / TICK_MS),
    awaySeconds: away,
    failed: false,
  };
}

/**
 * Run `ticks` of the real simulation, discarding events to stay fast and
 * yielding to the event loop between chunks so the tab keeps painting.
 */
export async function catchUp(
  state: GameState,
  ticks: number,
  onProgress?: (done: number, total: number) => void,
): Promise<GameState> {
  const map = createWorldMap(state.zoneId);
  let current = state;
  let done = 0;
  let lastPercent = -1;
  while (done < ticks) {
    const chunk = Math.min(CATCHUP_CHUNK, ticks - done);
    current = advance(current, map, chunk, { manualControl: false, collectEvents: false }).state;
    done += chunk;
    // Progress is reported only when the whole percentage moves. Reporting
    // every chunk drove a full client re-render hundreds of times and cost far
    // more than the simulation it was reporting on.
    const percent = Math.floor((done / ticks) * 100);
    if (percent !== lastPercent) {
      lastPercent = percent;
      onProgress?.(done, ticks);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { ...current, lastUpdatedAt: Date.now() };
}

export { SAVE_KEY };
