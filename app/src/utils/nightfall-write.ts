// ─── Nightfall: One Night — on-chain write client ───────────────────────────
// Builds + executes the state-changing entrypoints of the Cairo Fair Game
// Engine (contracts/src/nightfall.cairo) through the connected wallet account.
//
// The wallet is never constructed here: every method takes an `AccountInterface`
// from the wallet store (see `app/components/Wallet/walletContext.ts`), so no
// private key is ever touched by the client. starknet.js v10's `Contract.populate`
// compiles the ABI-typed arguments into a `Call`, which the account then signs
// and broadcasts via `account.execute`.

import { Contract, num } from "starknet";
import type {
  Abi,
  AccountInterface,
  CompiledSierra,
  CompiledSierraCasm,
  RawArgs,
} from "starknet";
import NightfallAbi from "@/abis/nightfall.abi.json";
import sierra from "@/abis/nightfall.sierra.json";
import casm from "@/abis/nightfall.casm.json";
import { NIGHTFALL_ADDRESS } from "@/utils/nightfall";

/** felt252 upper bound: 2^251 - 1 (the Cairo field prime). */
const FELT_MAX = 2n ** 251n - 1n;
/** u32 upper bound. */
const U32_MAX = 0xffffffffn;

/** Accepted seed shapes: decimal/hex string, JS number, or bigint. */
export type SeedInput = string | number | bigint;

/** Coerce a felt252 input to a normalized hex felt, validating its range. */
function toFelt(value: SeedInput): string {
  let big: bigint;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Nightfall: seed must be a non-negative integer, got ${value}`);
    }
    big = BigInt(value);
  } else if (typeof value === "bigint") {
    if (value < 0n) throw new Error("Nightfall: seed must be non-negative");
    big = value;
  } else if (typeof value === "string") {
    const s = value.trim();
    if (/^0x[0-9a-fA-F]+$/.test(s)) big = BigInt(s);
    else if (/^[0-9]+$/.test(s)) big = BigInt(s);
    else throw new Error(`Nightfall: seed must be a decimal or hex string, got "${s}"`);
  } else {
    throw new Error("Nightfall: seed must be a string, number, or bigint");
  }
  if (big > FELT_MAX) throw new Error("Nightfall: seed exceeds the felt252 range");
  return num.toHex(big);
}

/** Coerce a JS seat/target number to a normalized hex u32, validating its range. */
function toU32(value: number): string {
  if (!Number.isInteger(value) || value < 0 || BigInt(value) > U32_MAX) {
    throw new Error(`Nightfall: expected a u32 (0..${U32_MAX}), got ${value}`);
  }
  return num.toHex(value);
}

/** A `Contract` wired to the caller's account (used only to populate calls). */
function contractFor(account: AccountInterface): Contract {
  return new Contract({
    abi: NightfallAbi as Abi,
    address: NIGHTFALL_ADDRESS,
    providerOrAccount: account,
  });
}

/** Populate a call against the Nightfall contract, sign it, and broadcast it. */
async function execute(
  account: AccountInterface,
  method: string,
  args: RawArgs
): Promise<string> {
  const call = contractFor(account).populate(method, args);
  const { transaction_hash } = await account.execute(call);
  return transaction_hash;
}

/** `join_game()` — claim the next free seat. Returns the transaction hash. */
export async function joinGame(account: AccountInterface): Promise<string> {
  return execute(account, "join_game", []);
}

/** `start_game(seed)` — deal roles with the given felt252 seed. Returns the tx hash. */
export async function startGame(
  account: AccountInterface,
  seed: SeedInput
): Promise<string> {
  return execute(account, "start_game", [toFelt(seed)]);
}

/** `cast_vote(seat, target)` — vote to eliminate `target` from `seat`. Returns the tx hash. */
export async function castVote(
  account: AccountInterface,
  seat: number,
  target: number
): Promise<string> {
  return execute(account, "cast_vote", [toU32(seat), toU32(target)]);
}

/** Clean result of a `declareAndDeploy` against the Nightfall class. */
export interface DeployNightfallResult {
  classHash: string;
  contractAddress: string;
  declareTx: string;
  deployTx: string;
}

/**
 * `deployNightfall()` — declare the Nightfall Fair Game Engine (Sierra class +
 * CASM) and deploy a fresh instance via the UDC, all signed by the connected
 * wallet. No private key is touched by the client: `account` comes from the
 * wallet store. Returns the class hash, deployed address, and both tx hashes.
 */
export async function deployNightfall(
  account: AccountInterface
): Promise<DeployNightfallResult> {
  const result = await account.declareAndDeploy({
    contract: sierra as unknown as CompiledSierra,
    casm: casm as unknown as CompiledSierraCasm,
  });

  return {
    classHash: num.toHex(result.declare.class_hash),
    contractAddress: result.deploy.contract_address,
    declareTx: result.declare.transaction_hash ?? "",
    deployTx: result.deploy.transaction_hash,
  };
}
