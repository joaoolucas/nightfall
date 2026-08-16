/**
 * Mock chain adapter.
 *
 * The live Fair Game Engine contract is still being built (sibling worker), so
 * the keeper targets this adapter instead. It simulates a game with seats and a
 * phase, and `submitDecision` simply logs / records the decision — standing in
 * for the real `privacy_invoke` submission path.
 */

import type { ChainAdapter, SubmitResult } from './chain-adapter.js';
import type { Decision, GameState, Phase, Seat } from './types.js';

export interface CreateGameOptions {
  gameId: string;
  /** Number of seats to create (seat numbers are 0-based). */
  seats: number;
  phase?: Phase;
}

export class MockChain implements ChainAdapter {
  readonly kind = 'mock' as const;

  private readonly games = new Map<string, GameState>();
  private readonly submissions: SubmitResult[] = [];
  private block = 0;

  createGame(opts: CreateGameOptions): GameState {
    const seats: Seat[] = Array.from({ length: opts.seats }, (_, i) => ({
      seat: i,
      alive: true,
    }));
    const state: GameState = {
      gameId: opts.gameId,
      phase: opts.phase ?? 'night',
      seats,
      actionHistory: [],
    };
    this.games.set(opts.gameId, state);
    return state;
  }

  getGame(gameId: string): GameState | undefined {
    return this.games.get(gameId);
  }

  setPhase(gameId: string, phase: Phase): void {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Unknown game '${gameId}'`);
    game.phase = phase;
  }

  appendHistory(gameId: string, entry: string): void {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Unknown game '${gameId}'`);
    game.actionHistory.push(entry);
  }

  async readGameState(gameId: string): Promise<GameState> {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Unknown game '${gameId}'`);
    // Return a deep clone so callers cannot mutate the adapter's internal state.
    return structuredClone(game);
  }

  /**
   * Stands in for `privacy_invoke`. Logs and records the decision; returns a
   * fake receipt. Async to mirror the real submission flow.
   */
  async submitDecision(
    seat: number,
    decision: Decision,
    gameId?: string,
  ): Promise<SubmitResult> {
    if (!gameId) {
      throw new Error('MockChain.submitDecision requires a gameId');
    }
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Unknown game '${gameId}'`);

    const target = decision.target != null ? ` -> seat ${decision.target}` : '';
    game.actionHistory.push(`seat ${seat}: ${decision.action}${target}`);

    const result: SubmitResult = {
      gameId,
      seat,
      decision,
      txHash: `0x${(this.block + 1).toString(16).padStart(8, '0')}mock`,
      block: this.block++,
      submittedAt: new Date().toISOString(),
    };
    this.submissions.push(result);

    console.log(
      `[mock-chain] ${gameId} seat ${seat} submitted ${decision.action}` +
        `${target} (mock tx ${result.txHash})`,
    );
    return result;
  }

  listSubmissions(): readonly SubmitResult[] {
    return [...this.submissions];
  }
}
