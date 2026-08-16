"use client";

import { useEffect, useState } from "react";
import { GamePhase, Role } from "@/utils/game";
import { hasNightfallContract } from "@/utils/nightfall";
import { getNightfallClient } from "@/utils/nightfall-client";
import { useFrontendProvider } from "@/app/components/client/provider/providerContext";

/** Snapshot of the Nightfall table, either from the chain or the static demo. */
export interface NightfallState {
  phase: GamePhase;
  seatCount: number;
  roles: (Role | null)[];
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
    roles: [],
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
 * - Contract configured → reads phase / seat count / roles / winner from chain,
 *   sets `onChain: true`, and surfaces any RPC error in `error` without crashing.
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

    (async () => {
      try {
        const client = getNightfallClient(providerIndex);

        const [phase, seatCount, winner] = await Promise.all([
          client.getPhase(),
          client.getSeatCount(),
          client.getWinner(),
        ]);

        const roles: (Role | null)[] = [];
        for (let seat = 0; seat < seatCount; seat++) {
          roles.push(await client.getRole(seat));
        }

        if (cancelled) return;
        setState({
          phase,
          seatCount,
          roles,
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
    })();

    return () => {
      cancelled = true;
    };
  }, [onChain, providerIndex]);

  return state;
}
