// ─── Nightfall: One Night — read-only on-chain client ────────────────────────
// Typed wrapper over the Cairo Fair Game Engine (contracts/src/nightfall.cairo).
// Cairo returns enums as felt252 discriminants; starknet.js v10 parses them into
// `CairoCustomEnum` objects, and this client maps them back to the numeric TS
// enums in @/utils/game (whose values are kept in lock-step with the contract).
//
// All methods here are `view` reads — no account / signing is involved, so the
// client only needs a provider, not a wallet.

import { Contract } from "starknet";
import type { Abi, ProviderInterface } from "starknet";
import NightfallAbi from "@/abis/nightfall.abi.json";
import { GamePhase, Role } from "@/utils/game";
import { NIGHTFALL_ADDRESS } from "@/utils/nightfall";
import { myFrontendProviders } from "@/utils/constants";

/** Settlement outcome discriminants (the Cairo `Winner` enum, 0/1/2). */
export const Winner = {
  None: 0,
  Wolves: 1,
  Village: 2,
} as const;
export type Winner = (typeof Winner)[keyof typeof Winner];

// Variant-name order for the Cairo enums. The index of each name equals its
// felt252 discriminant and must match the numeric values in @/utils/game.
const PHASE_NAMES = [
  "Lobby",
  "Deal",
  "Night",
  "Day",
  "Vote",
  "Reveal",
  "Settle",
] as const;

const ROLE_NAMES = [
  "Werewolf",
  "Minion",
  "Seer",
  "Robber",
  "Troublemaker",
  "Villager",
] as const;

const WINNER_NAMES = ["None", "Wolves", "Village"] as const;

/** Coerce a starknet.js scalar (number | bigint | numeric string) to a number. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Extract the felt252 discriminant from a parsed enum result. starknet.js v10
 * parses custom enums into a `CairoCustomEnum` (whose `activeVariant()` returns
 * the variant name); we also accept the raw number / bigint / numeric string or
 * the variant name directly so the client stays robust across parsing settings.
 */
function discriminantOf(value: unknown, names: readonly string[]): number {
  if (value !== null && typeof value === "object") {
    const obj = value as {
      activeVariant?: unknown;
      variant?: unknown;
    };
    if (typeof obj.activeVariant === "function") {
      const name = (obj.activeVariant as () => string)();
      const idx = names.indexOf(name);
      if (idx >= 0) return idx;
    }
    if (obj.variant && typeof obj.variant === "object") {
      for (const [key, val] of Object.entries(obj.variant as Record<string, unknown>)) {
        if (val !== undefined) {
          const idx = names.indexOf(key);
          if (idx >= 0) return idx;
        }
      }
    }
  }
  if (typeof value === "string") {
    const idx = names.indexOf(value);
    if (idx >= 0) return idx;
  }
  const n = toNumber(value);
  if (n !== null && Number.isInteger(n) && n >= 0 && n < names.length) return n;
  throw new Error(`Nightfall: could not parse enum discriminant from ${String(value)}`);
}

/** Coerce a u32 result (parsed as a bigint felt) to a JS number. */
function toU32(value: unknown): number {
  const n = toNumber(value);
  if (n !== null && Number.isInteger(n) && n >= 0 && n <= 0xffffffff) return n;
  throw new Error(`Nightfall: expected a u32, got ${String(value)}`);
}

/**
 * Coerce a `ContractAddress` result (parsed as a bigint felt) to a canonical,
 * zero-padded 66-char hex string ("0x" + 64 hex digits).
 */
function toAddress(value: unknown): string {
  let big: bigint;
  if (typeof value === "bigint") {
    big = value;
  } else if (typeof value === "number" && Number.isInteger(value)) {
    big = BigInt(value);
  } else if (typeof value === "string") {
    const s = value.trim();
    if (/^0x[0-9a-fA-F]+$/.test(s)) big = BigInt(s);
    else if (/^[0-9]+$/.test(s)) big = BigInt(s);
    else throw new Error(`Nightfall: expected an address, got ${String(value)}`);
  } else {
    throw new Error(`Nightfall: expected an address, got ${String(value)}`);
  }
  return `0x${big.toString(16).padStart(64, "0")}`;
}

/** Typed, read-only client for the Nightfall Fair Game Engine. */
export class NightfallClient {
  readonly contract: Contract;

  constructor(provider: ProviderInterface, address: string) {
    this.contract = new Contract({
      abi: NightfallAbi as Abi,
      address,
      providerOrAccount: provider,
    });
  }

  /** Current game phase, mapped from the felt252 discriminant to `GamePhase`. */
  async getPhase(): Promise<GamePhase> {
    const raw = await this.contract.call("get_phase");
    return discriminantOf(raw, PHASE_NAMES) as GamePhase;
  }

  /** Number of joined seats. */
  async getSeatCount(): Promise<number> {
    const raw = await this.contract.call("get_seat_count");
    return toU32(raw);
  }

  /** Contract address occupying `seat` (canonical hex; "0x0" when empty). */
  async getSeat(seat: number): Promise<string> {
    const raw = await this.contract.call("get_seat", [seat]);
    return toAddress(raw);
  }

  /** Role assigned to `seat`, mapped from the felt252 discriminant to `Role`. */
  async getRole(seat: number): Promise<Role> {
    const raw = await this.contract.call("get_role", [seat]);
    return discriminantOf(raw, ROLE_NAMES) as Role;
  }

  /** Vote tally (number of votes) for `seat`. */
  async getVoteTally(seat: number): Promise<number> {
    const raw = await this.contract.call("get_vote_tally", [seat]);
    return toU32(raw);
  }

  /** Game winner discriminant: 0 = None, 1 = Wolves, 2 = Village. */
  async getWinner(): Promise<number> {
    const raw = await this.contract.call("get_winner");
    return discriminantOf(raw, WINNER_NAMES);
  }
}

/**
 * Build a starknet.js `Contract` for the Nightfall contract, wired to the
 * frontend provider at `providerIndex` (see `myFrontendProviders` in constants.ts).
 */
export function getNightfallContract(providerIndex: number): Contract {
  const provider = myFrontendProviders[providerIndex];
  if (!provider) {
    throw new Error(`Nightfall: no frontend provider at index ${providerIndex}`);
  }
  return new Contract({
    abi: NightfallAbi as Abi,
    address: NIGHTFALL_ADDRESS,
    providerOrAccount: provider,
  });
}

/**
 * Build a typed `NightfallClient` for the Nightfall contract on the frontend
 * provider at `providerIndex`.
 */
export function getNightfallClient(providerIndex: number): NightfallClient {
  const provider = myFrontendProviders[providerIndex];
  if (!provider) {
    throw new Error(`Nightfall: no frontend provider at index ${providerIndex}`);
  }
  return new NightfallClient(provider, NIGHTFALL_ADDRESS);
}
