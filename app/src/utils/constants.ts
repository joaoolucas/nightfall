import { ProviderInterface, RpcProvider } from "starknet";

/** Native STRK ERC-20 address. */
export const addrSTRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

/**
 * RPC endpoints.
 *
 * The old defaults pointed at `*.public.blastapi.io`, which now answers every
 * request with "Blast API is no longer available. Please update your
 * integration to use Alchemy's API instead" — so the fallback was not a
 * fallback, it was a guaranteed failure that only looked like a configured
 * provider. There is no keyless public endpoint worth pinning in its place
 * (Nethermind's free RPC and Lava's testnet gateway were both checked and
 * neither answers reliably), so the URL has to be configured.
 *
 * An unset endpoint resolves to an obviously invalid host rather than a dead
 * real one: a request that fails with ENOTFOUND against `rpc.invalid` says
 * "you did not configure this", where a 503 from a decommissioned provider
 * sends you debugging the wrong thing.
 */
const UNSET_RPC = "https://unset.rpc.invalid/configure-NEXT_PUBLIC_STARKNET_RPC_URL";

const mainnetRpc =
  process.env.NEXT_PUBLIC_STARKNET_MAINNET_RPC_URL ??
  process.env.NEXT_PUBLIC_STARKNET_RPC_URL ??
  UNSET_RPC;
const sepoliaRpc = process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_RPC_URL ?? UNSET_RPC;

/** Provider indices are kept for the existing wallet/network state. */
export const myFrontendProviders: ProviderInterface[] = [
  new RpcProvider({ nodeUrl: mainnetRpc }),
  new RpcProvider({ nodeUrl: sepoliaRpc }),
  new RpcProvider({ nodeUrl: sepoliaRpc }),
];

/** Wallet networks where Portage exposes STRK20 actions. */
export const Strk20Networks: Record<number, string> = {
  0: "MAINNET",
  2: "SEPOLIA",
};
