/**
 * Chain adapter contract.
 *
 * The keeper targets a `ChainAdapter` instead of talking to the contract
 * directly, so the same drive loop works against:
 *
 *   - `MockChain`      — in-memory game, used for local dev / zero-config runs
 *   - `StarknetChainAdapter` — the real Nightfall Fair Game Engine contract
 *
 * Both adapters read the same `GameState` and produce the same `SubmitResult`,
 * which keeps `decide()` (and everything above it) chain-agnostic.
 */

import type { Decision, GameState } from './types.js';

export type AdapterKind = 'mock' | 'starknet';

/**
 * Result of submitting a decision. The mock produces a synthetic receipt;
 * the live adapter will eventually return a real `privacy_invoke` transaction.
 */
export interface SubmitResult {
  gameId: string;
  seat: number;
  decision: Decision;
  /** Transaction hash (fake for mock, real once the privacy path lands). */
  txHash: string;
  block: number;
  submittedAt: string;
}

export interface ChainAdapter {
  /** Discriminator used for logs and to pick adapter-specific behavior. */
  readonly kind: AdapterKind;

  /**
   * Read the public game state plus the keeper seat's own role.
   *
   * For the Starknet adapter the contract is a singleton, so `gameId` is only
   * used to label the returned state (the default is the contract address).
   */
  readGameState(gameId: string): Promise<GameState>;

  /**
   * Submit the keeper seat's decision. `gameId` is required by the mock
   * (which can host several in-memory games) and ignored by the Starknet
   * adapter. Until the live privacy path exists, the Starknet adapter throws.
   */
  submitDecision(
    seat: number,
    decision: Decision,
    gameId?: string,
  ): Promise<SubmitResult>;
}
