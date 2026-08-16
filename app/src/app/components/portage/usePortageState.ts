"use client";

// Shared Portage data hook: reads the on-chain contract when one is configured,
// otherwise returns the mock/demo lineup from `utils/creatures.ts`. Components
// use this single source of truth so the demo keeps working with no contract.

import { useEffect, useState } from "react";
import { MOCK_CREATURES, type Creature } from "@/utils/creatures";
import { hasPortageContract, PortageClient } from "@/utils/portage-client";
import { myFrontendProviders } from "@/utils/constants";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";

export interface PortageState {
  /** True when a real contract is configured and being read. */
  onChain: boolean;
  loading: boolean;
  error: string | null;
  totalSupply: number;
  hatchCount: number;
  creatures: Creature[];
  /** Re-fetch the on-chain lineup (e.g. after an evolve). */
  refresh: () => void;
}

/** Don't enumerate the whole collection over RPC if it grows beyond this. */
const MAX_ENUMERATE = 20;

const DEMO_STATE: PortageState = {
  onChain: false,
  loading: false,
  error: null,
  totalSupply: MOCK_CREATURES.length,
  hatchCount: MOCK_CREATURES.length,
  creatures: MOCK_CREATURES,
  refresh: () => {},
};

export function usePortageState(): PortageState {
  const account = useStoreWallet((s) => s.account);
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const provider = useStoreWallet((s) => s.provider);

  const onChain = hasPortageContract();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<PortageState>(
    onChain
      ? { onChain: true, loading: true, error: null, totalSupply: 0, hatchCount: 0, creatures: [], refresh: () => {} }
      : DEMO_STATE
  );

  useEffect(() => {
    if (!onChain) {
      setState(DEMO_STATE);
      return;
    }

    let cancelled = false;

    async function load() {
      setState((s) => ({ ...s, onChain: true, loading: true, error: null }));
      // Read via the connected account's provider when available, else the
      // wallet store provider, else the default Sepolia frontend provider.
      const providerOrAccount = account ?? myWalletAccount ?? provider ?? myFrontendProviders[2];
      try {
        const client = new PortageClient(providerOrAccount);
        const totalSupply = await client.getTotalSupply();
        const hatchCount = await client.getHatchCount();

        let creatures: Creature[] = [];
        const limit = Number(totalSupply);
        if (limit <= MAX_ENUMERATE) {
          const reads: Promise<Creature>[] = [];
          for (let i = 0; i < limit; i += 1) reads.push(client.getCreature(i));
          creatures = await Promise.all(reads);
        }

        if (!cancelled) {
          setState({
            onChain: true,
            loading: false,
            error: null,
            totalSupply: limit,
            hatchCount: Number(hatchCount),
            creatures,
            refresh: () => setReloadKey((k) => k + 1),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [onChain, account, myWalletAccount, provider, reloadKey]);

  return state;
}
