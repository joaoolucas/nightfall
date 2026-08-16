"use client";

import { useEffect, useState } from "react";
import { GamePhase } from "@/utils/game";
import { hasNightfallContract } from "@/utils/nightfall";
import { getNightfallClient } from "@/utils/nightfall-client";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";

/** How often to re-read on-chain state (ms) while a contract is configured. */
const REFRESH_MS = 10_000;

/** Snapshot of the Nightfall table, either from the chain or the static demo. */
export interface NightfallState {
  phase: GamePhase;
  seatCount: number;
  winner: number | null;
  loading: boolean;
  error: string | null;
  onChain: boolean;
}

/** Static demo state used when no Nightfall contract is configured. */
function demoState(): NightfallState {
  return {
    phase: GamePhase.Lobby,
    seatCount: 0,
    winner: null,
    loading: false,
    error: null,
    onChain: false,
  };
}

/**
 * Reads the Nightfall game state.
 *
 * - No contract configured (`hasNightfallContract()` === false) → returns the
 *   static demo state immediately (`onChain: false`, never touches the RPC).
 * - Contract configured → reads phase / seat count / winner from chain, sets
 *   `onChain: true`, and surfaces any RPC error in `error` without crashing.
 *
 * Deliberately does NOT read per-seat roles: that would be an omniscient view
 * (no-peek invariant, SPEC §6). Roles are revealed per seat via viewing keys
 * in a later wave.
 */
export function useNightfallState(): NightfallState {
  const providerIndex = useFrontendProvider(
    (state) => state.currentFrontendProviderIndex
  );
  const onChain = hasNightfallContract();

  const [state, setState] = useState<NightfallState>(() =>
    onChain
      ? { ...demoState(), onChain: true, loading: true }
      : demoState()
  );

  useEffect(() => {
    if (!onChain) {
      setState(demoState());
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const client = getNightfallClient(providerIndex);

        const [phase, seatCount, winner] = await Promise.all([
          client.getPhase(),
          client.getSeatCount(),
          client.getWinner(),
        ]);

        if (cancelled) return;
        setState({
          phase,
          seatCount,
          winner,
          loading: false,
          error: null,
          onChain: true,
        });
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    };

    // Initial read, then poll so the phase banner advances as the game
    // moves Lobby -> Deal -> Night -> ... -> Settle (turn-based).
    void load();
    const interval = setInterval(() => void load(), REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [onChain, providerIndex]);

  return state;
}
