/**
 * Drive one keeper seat.
 *
 * Picks the chain adapter from the environment and runs a single `decide()`:
 *
 *   - `NIGHTFALL_CONTRACT_ADDRESS` set -> `StarknetChainAdapter` (real contract)
 *   - otherwise                          -> `MockChain` (zero-config dev path)
 *
 * On the live adapter the seat's role must eventually come from decrypting its
 * own role note with the per-seat viewing key; until that lands we use a
 * placeholder role (see `PLACEHOLDER_ROLE`).
 */

import type { ChainAdapter } from './chain-adapter.js';
import { hasApiKey, loadConfig, resolveModel } from './config.js';
import { decide } from './decide.js';
import { MockChain } from './mock-chain.js';
import { getPersona } from './persona.js';
import { StarknetChainAdapter } from './starknet-adapter.js';
import type { Role } from './types.js';

export const DEFAULT_STARKNET_RPC_URL =
  'https://starknet-sepolia.public.blastapi.io/rpc/v0_7';
export const DEFAULT_KEEPER_SEAT = 2;

const EXAMPLE_GAME_ID = 'example-game-1';
const EXAMPLE_PERSONA = 'deceptive' as const;
const EXAMPLE_ROLE: Role = 'werewolf';

/** Placeholder until the per-seat viewing-key decrypt path lands. */
const PLACEHOLDER_ROLE: Role = 'villager';

export async function driveSeat(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = loadConfig(env);
  const seat = toNonNegativeInt(env.KEEPER_SEAT, DEFAULT_KEEPER_SEAT);
  const contractAddress = env.NIGHTFALL_CONTRACT_ADDRESS?.trim();

  const chain: ChainAdapter = contractAddress
    ? new StarknetChainAdapter(
        env.NIGHTFALL_RPC_URL?.trim() || DEFAULT_STARKNET_RPC_URL,
        contractAddress,
      )
    : new MockChain();

  // Keep a typed handle to the mock so we can create a game / submit below.
  const mock = chain.kind === 'mock' ? (chain as MockChain) : null;
  if (mock) {
    mock.createGame({
      gameId: EXAMPLE_GAME_ID,
      seats: 6,
      phase: 'night',
    });
  }

  // The Starknet contract is a singleton, so its gameId is only a label; pass
  // an empty id and the adapter falls back to the contract address.
  const gameId = mock ? EXAMPLE_GAME_ID : '';
  const state = await chain.readGameState(gameId);

  // Mock mode knows the example role; the live adapter cannot yet decrypt the
  // seat's role note (no viewing key), so it uses a placeholder role. This is
  // replaced by the per-seat decrypt path when it lands.
  const role: Role = mock ? EXAMPLE_ROLE : PLACEHOLDER_ROLE;

  console.log('Nightfall Keeper — drive seat');
  console.log(`  adapter: ${chain.kind}`);
  console.log(`  model  : ${resolveModel('default', config).id}`);
  console.log(
    `  apiKey : ${hasApiKey(config) ? 'present' : 'missing (deterministic mock mode)'}`,
  );
  console.log(
    `  game   : ${state.gameId} (phase=${state.phase}, seats=${state.seats.length})`,
  );
  console.log(
    `  seat   : ${seat} | persona=${getPersona(EXAMPLE_PERSONA).name} | role=${role}`,
  );

  const decision = await decide({
    seat,
    persona: EXAMPLE_PERSONA,
    role,
    state,
    config,
  });

  console.log('\nDecision:');
  console.log(JSON.stringify(decision, null, 2));

  if (mock) {
    const receipt = await mock.submitDecision(seat, decision, state.gameId);
    console.log('\nMock chain receipt:');
    console.log(JSON.stringify(receipt, null, 2));
  }
}

function toNonNegativeInt(
  value: string | undefined,
  fallback: number,
): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}
