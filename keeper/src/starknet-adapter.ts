/**
 * Real Starknet chain adapter for the Nightfall Fair Game Engine.
 *
 * Reads public game state straight from the contract via starknet.js. The
 * contract returns Cairo enums as raw felt252 numbers, so we map those
 * discriminants back to the keeper's string unions (types.ts).
 *
 * Writing is intentionally NOT implemented yet: submitting a decision requires
 * a signer plus the seat's per-seat viewing key (the `privacy_invoke` path).
 * Until that lands, `submitDecision` throws a clear error.
 */

import { Contract, RpcProvider } from 'starknet';

import nightfallAbi from './abis/nightfall.abi.json' with { type: 'json' };

import type { ChainAdapter, SubmitResult } from './chain-adapter.js';
import type { Decision, GameState, Phase, Role, Seat } from './types.js';

/** Cairo `Phase` discriminant -> keeper `Phase` string union (SPEC §5). */
const PHASE_BY_DISCRIMINANT: Record<number, Phase> = {
  0: 'lobby',
  1: 'deal',
  2: 'night',
  3: 'day',
  4: 'vote',
  5: 'reveal',
  6: 'settle',
};

/** Cairo `Role` discriminant -> keeper `Role` string union (SPEC §5). */
const ROLE_BY_DISCRIMINANT: Record<number, Role> = {
  0: 'werewolf',
  1: 'minion',
  2: 'seer',
  3: 'robber',
  4: 'troublemaker',
  5: 'villager',
};

/** Cairo `Winner` discriminant -> winner label. */
const WINNER_BY_DISCRIMINANT: Record<number, Winner> = {
  0: 'none',
  1: 'wolves',
  2: 'village',
};

export type Winner = 'none' | 'wolves' | 'village';

/** Map a Cairo `Phase` discriminant to the keeper `Phase` string union. */
export function phaseFromDiscriminant(discriminant: number): Phase {
  const phase = PHASE_BY_DISCRIMINANT[discriminant];
  if (!phase) {
    throw new Error(
      `StarknetChainAdapter: unknown Phase discriminant ${discriminant} (expected 0..6)`,
    );
  }
  return phase;
}

/** Map a Cairo `Role` discriminant to the keeper `Role` string union. */
export function roleFromDiscriminant(discriminant: number): Role {
  const role = ROLE_BY_DISCRIMINANT[discriminant];
  if (!role) {
    throw new Error(
      `StarknetChainAdapter: unknown Role discriminant ${discriminant} (expected 0..5)`,
    );
  }
  return role;
}

/** Map a Cairo `Winner` discriminant to a winner label. */
export function winnerFromDiscriminant(discriminant: number): Winner {
  const winner = WINNER_BY_DISCRIMINANT[discriminant];
  if (!winner) {
    throw new Error(
      `StarknetChainAdapter: unknown Winner discriminant ${discriminant} (expected 0..2)`,
    );
  }
  return winner;
}

export class StarknetChainAdapter implements ChainAdapter {
  readonly kind = 'starknet' as const;

  private readonly provider: RpcProvider;
  private readonly contract: Contract;

  constructor(
    rpcUrl: string,
    readonly contractAddress: string,
  ) {
    this.provider = new RpcProvider({ nodeUrl: rpcUrl });
    this.contract = new Contract({
      abi: nightfallAbi,
      address: contractAddress,
      providerOrAccount: this.provider,
    });
  }

  /**
   * Read the public game state. `get_phase` + `get_seat_count` are fetched
   * with raw felt252 parsing (`parseResponse: false`) so we receive the enum
   * discriminants as numbers rather than parsed Cairo enum objects.
   *
   * `gameId` is only a label for the singleton contract: when empty, the
   * returned state is labelled with the contract address.
   */
  async readGameState(gameId: string): Promise<GameState> {
    const [phaseResult, seatCountResult] = await Promise.all([
      this.contract.call('get_phase', [], { parseResponse: false }),
      this.contract.call('get_seat_count', [], { parseResponse: false }),
    ]);

    // With `parseResponse: false` starknet.js returns raw calldata strings.
    const phaseRaw = (phaseResult as string[])[0];
    const seatCountRaw = (seatCountResult as string[])[0];

    const phase = phaseFromDiscriminant(
      toNonNegativeInt(phaseRaw, 'phase discriminant'),
    );
    const seatCount = toNonNegativeInt(seatCountRaw, 'seat count');

    const seats: Seat[] = Array.from({ length: seatCount }, (_, i) => ({
      seat: i,
      alive: true,
    }));

    return {
      gameId: gameId || this.contractAddress,
      phase,
      seats,
      actionHistory: [],
    };
  }

  /**
   * Submitting requires a signer + the seat's per-seat viewing key (the
   * `privacy_invoke` path), which are not wired up yet. Throw instead of
   * silently pretending to have written.
   */
  async submitDecision(
    _seat: number,
    _decision: Decision,
    _gameId?: string,
  ): Promise<SubmitResult> {
    throw new Error(
      'StarknetChainAdapter.submitDecision not implemented: needs a signer + per-seat viewing key (privacy_invoke path)',
    );
  }
}

/**
 * Convert a raw felt252/u32 value (hex or decimal string, number, or bigint)
 * to a non-negative integer, or throw a clear error.
 */
function toNonNegativeInt(raw: unknown, label: string): number {
  let n: number;
  if (typeof raw === 'number') {
    n = raw;
  } else if (typeof raw === 'bigint') {
    n = Number(raw);
  } else if (typeof raw === 'string') {
    try {
      n = Number(BigInt(raw));
    } catch {
      n = NaN;
    }
  } else {
    n = NaN;
  }

  if (!Number.isInteger(n) || n < 0) {
    throw new Error(
      `StarknetChainAdapter: unexpected ${label} value '${String(raw)}'`,
    );
  }
  return n;
}
