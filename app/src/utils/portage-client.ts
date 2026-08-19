// On-chain wiring for Portage.fun.
//
// A thin starknet.js `Contract` wrapper over `src/abis/portage.abi.json`. Reads
// map raw Cairo discriminants (felt252 → 0..n) to the app's string unions in
// `utils/portage.ts`; writes use `Contract.populate` + `account.execute`, the
// same pattern the STRK20 helper used before.
//
// When no contract is configured (NEXT_PUBLIC_PORTAGE_ADDRESS / PORTAGE_ADDRESS
// are unset or "0x0"), `hasPortageContract()` is false and the UI falls back to
// the mock/demo data in `utils/creatures.ts` — the build stays green with no
// live contract.

import { Contract, hash, num, type Abi, type AccountInterface, type ProviderInterface, type InvokeFunctionResponse } from "starknet";
import portageAbi from "@/abis/portage.abi.json";
import type { Creature } from "./creatures";
import { creatureStats, type CreatureStats, type Species, type Rarity, type Stage } from "./portage";

// Cairo felt252 discriminant → app string union. Order is fixed by the Cairo
// enum declaration (see `portage.abi.json` / docs/SPEC.md §10):
//   Species: 0=Ember 1=Creek 2=Grove 3=Stone 4=Mist 5=Sky
//   Rarity:  0=Common 1=Uncommon 2=Rare 3=Epic 4=Legendary 5=Mythic
//   Stage:   0=Hatchling 1=Adult 2=Legend
const SPECIES_BY_DISCRIMINANT: Species[] = ["ember", "creek", "grove", "stone", "mist", "sky"];
const RARITY_BY_DISCRIMINANT: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const STAGE_BY_DISCRIMINANT: Stage[] = ["hatchling", "adult", "legend"];

/** Bounded discriminant lookup — clamps out-of-range values instead of throwing. */
function discriminant<T>(table: T[], raw: bigint): T {
  const i = Number(raw);
  const clamped = Math.max(0, Math.min(i, table.length - 1));
  return table[clamped];
}

/** Resolve the configured Portage contract address ("0x0" = not configured). */
export function portageAddress(): string {
  return process.env.NEXT_PUBLIC_PORTAGE_ADDRESS ?? process.env.PORTAGE_ADDRESS ?? "0x0";
}

/** True when a real Portage contract address is configured (not "0x0"). */
export function hasPortageContract(): boolean {
  try {
    return num.toBigInt(portageAddress()) !== 0n;
  } catch {
    return false;
  }
}

/** Build a starknet.js Contract over the Portage ABI for reads (provider) or writes (account). */
export function createPortageContract(providerOrAccount: ProviderInterface | AccountInterface): Contract {
  return new Contract({
    abi: portageAbi as unknown as Abi,
    address: portageAddress(),
    providerOrAccount,
  });
}

/** Read a token's creature record (owner, species, rarity, stage, exp) as an app `Creature`. */
async function readCreature(contract: Contract, tokenId: number | bigint): Promise<Creature> {
  // parseResponse:false keeps the raw felt array so we can map discriminants
  // ourselves (the Cairo1 unit-enum tuple is easier to read raw than parsed).
  // CallResult is a wide union type; with parseResponse:false the value is a
  // raw felt array (string[]), so narrow it explicitly.
  const res = (await contract.call("get_creature", [BigInt(tokenId)], { parseResponse: false })) as string[];
  const species = discriminant(SPECIES_BY_DISCRIMINANT, num.toBigInt(res[1]));
  const rarity = discriminant(RARITY_BY_DISCRIMINANT, num.toBigInt(res[2]));
  const stage = discriminant(STAGE_BY_DISCRIMINANT, num.toBigInt(res[3]));
  // Updated `get_creature` returns exp as the 5th field; tolerate the older
  // 4-field tuple (exp 0) so the reader stays compatible with earlier ABIs.
  const exp = res.length > 4 ? Number(num.toBigInt(res[4])) : 0;
  return {
    tokenId: Number(tokenId),
    owner: num.toHex(res[0]),
    species,
    rarity,
    stage,
    exp,
    ...creatureStats(species, rarity, stage),
  };
}

/** Combine a raw u256 (low, high felts) into a bigint. */
function u256FromRaw(res: readonly string[]): bigint {
  const low = num.toBigInt(res[0]);
  const high = num.toBigInt(res[1]);
  return low + (high << 128n);
}

/**
 * The Portage contract wrapper: reads are exposed as plain methods (taking the
 * provider the wrapper was built with); writes take an `AccountInterface` and
 * submit via `Contract.populate` + `account.execute`.
 */
export class PortageClient {
  readonly contract: Contract;

  constructor(providerOrAccount: ProviderInterface | AccountInterface) {
    this.contract = createPortageContract(providerOrAccount);
  }

  /** `get_creature(token_id)` → app Creature (discriminants mapped to strings, exp + stats attached). */
  getCreature(tokenId: number | bigint): Promise<Creature> {
    return readCreature(this.contract, tokenId);
  }

  /** `get_creature(token_id)` → derived stats (base × rarity × stage, rounded). */
  async getCreatureStats(tokenId: number | bigint): Promise<CreatureStats> {
    const creature = await this.getCreature(tokenId);
    return creatureStats(creature.species, creature.rarity, creature.stage);
  }

  /** `get_total_supply()` → number of minted creatures (u256 → bigint). */
  async getTotalSupply(): Promise<bigint> {
    const res = (await this.contract.call("get_total_supply", [], { parseResponse: false })) as string[];
    return u256FromRaw(res);
  }

  /** `get_hatch_count()` → number of hatches performed (u64 → bigint). */
  async getHatchCount(): Promise<bigint> {
    const res = (await this.contract.call("get_hatch_count", [], { parseResponse: false })) as string[];
    return num.toBigInt(res[0]);
  }

  /** `get_rarity_weights()` → the on-chain rarity weight table (u16s, 0..5 = Common..Mythic). */
  async getRarityWeights(): Promise<number[]> {
    const res = (await this.contract.call("get_rarity_weights", [], { parseResponse: false })) as string[];
    // Span<u16> serializes as [length, w0, w1, …].
    const len = Number(num.toBigInt(res[0]));
    return res.slice(1, 1 + len).map((w) => Number(num.toBigInt(w)));
  }

  /**
   * `commit_hatch(digest)` — promise a hatch.
   *
   * The secret never leaves the client until the reveal, and the digest binds
   * it to the caller's address, so a secret observed in the mempool cannot be
   * redeemed by whoever saw it. Keep the secret: without it the commitment can
   * never be revealed and the hatch is lost.
   */
  commitHatch(account: AccountInterface, digest: string): Promise<InvokeFunctionResponse> {
    const call = this.contract.populate("commit_hatch", [digest]);
    return account.execute([call]);
  }

  /**
   * `reveal_hatch(secret)` — redeem a promise and mint.
   *
   * Only valid between REVEAL_DELAY and REVEAL_WINDOW blocks after the commit;
   * the contract reverts as TOO_EARLY or COMMIT_EXPIRED outside that band.
   */
  revealHatch(account: AccountInterface, secret: string): Promise<InvokeFunctionResponse> {
    const call = this.contract.populate("reveal_hatch", [secret]);
    return account.execute([call]);
  }

  /** `get_commitment(who)` → the open `[digest, commitBlock]`, zeroed when none. */
  async getCommitment(who: string): Promise<{ digest: bigint; commitBlock: bigint }> {
    const res = (await this.contract.call("get_commitment", [who], {
      parseResponse: false,
    })) as string[];
    return { digest: num.toBigInt(res[0]), commitBlock: num.toBigInt(res[1]) };
  }

  /** `list(token_id, price)` — list a creature for `price` (u128, small ints only for now). */
  list(account: AccountInterface, tokenId: number | bigint, price: number | bigint): Promise<InvokeFunctionResponse> {
    // token_id is u256 (BigInt auto-splits into low/high); price is u128 — a
    // felt-sized int today, so num.toHex is enough. (If prices ever exceed the
    // felt range, switch price to cairo.uint256.)
    const call = this.contract.populate("list", [BigInt(tokenId), num.toHex(price)]);
    return account.execute([call]);
  }

  /** `buy(token_id)` — buy a listed creature. */
  buy(account: AccountInterface, tokenId: number | bigint): Promise<InvokeFunctionResponse> {
    const call = this.contract.populate("buy", [BigInt(tokenId)]);
    return account.execute([call]);
  }

  /** `cancel(token_id)` — remove a creature from the marketplace. */
  cancel(account: AccountInterface, tokenId: number | bigint): Promise<InvokeFunctionResponse> {
    const call = this.contract.populate("cancel", [BigInt(tokenId)]);
    return account.execute([call]);
  }

  /** `expedition(token_id)` — run a metered idle expedition (owner-only, cooldown). */
  expedition(account: AccountInterface, tokenId: number | bigint): Promise<InvokeFunctionResponse> {
    const call = this.contract.populate("expedition", [BigInt(tokenId)]);
    return account.execute([call]);
  }

  /** `evolve(token_id)` — advance a creature to its next stage (owner-only). */
  evolve(account: AccountInterface, tokenId: number | bigint): Promise<InvokeFunctionResponse> {
    const call = this.contract.populate("evolve", [BigInt(tokenId)]);
    return account.execute([call]);
  }
}

/**
 * The digest to publish when committing a hatch.
 *
 * Must match `commitment_digest` in portage.cairo exactly — it is
 * `poseidon(secret, caller)`. A mismatch here is not a compile error on either
 * side; it is a reveal that reverts as BAD_SECRET with the hatch already paid
 * for, so `npm run verify:hatch -- --offline` cross-checks the two
 * implementations against vectors the Cairo tests pin.
 */
export function hatchDigest(secret: string, caller: string): string {
  return hash.computePoseidonHashOnElements([num.toBigInt(secret), num.toBigInt(caller)]);
}

/**
 * The seed a reveal will roll from: `poseidon(secret, blockHash, commitBlock)`.
 * Mirrors `mix_entropy`, and lets a client show its own working rather than
 * asking the player to trust the result.
 */
export function mixEntropy(secret: string, blockHash: string, commitBlock: number | bigint): string {
  return hash.computePoseidonHashOnElements([
    num.toBigInt(secret),
    num.toBigInt(blockHash),
    BigInt(commitBlock),
  ]);
}

/** Blocks that must pass before a commitment can be revealed. Mirrors REVEAL_DELAY. */
export const REVEAL_DELAY = 10;
/** Blocks after which a commitment can no longer be revealed. Mirrors REVEAL_WINDOW. */
export const REVEAL_WINDOW = 1000;

/** Generate a client-random seed masked to fit a felt252 (< 2^251 < felt prime). */
export function randomFeltSeed(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto?.getRandomValues(bytes);
  bytes[0] &= 0x07; // clear the top 5 bits → 251-bit value
  let seed = 0n;
  for (const b of bytes) seed = (seed << 8n) | BigInt(b);
  return num.toHex(seed);
}
