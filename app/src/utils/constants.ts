import { ProviderInterface, RpcProvider } from "starknet";

/** Native STRK ERC-20 address. */
export const addrSTRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const mainnetRpc =
  process.env.NEXT_PUBLIC_STARKNET_MAINNET_RPC_URL ??
  process.env.NEXT_PUBLIC_STARKNET_RPC_URL ??
  "https://starknet-mainnet.public.blastapi.io/rpc/v0_8";
const sepoliaRpc =
  process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_RPC_URL ??
  "https://starknet-sepolia.public.blastapi.io/rpc/v0_8";

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
