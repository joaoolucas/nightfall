/**
 * Keeper entrypoint (skeleton).
 *
 * Wires persona + decide + mock-chain together and runs one example decision
 * for a seat (seat 2, 'deceptive' persona), then submits it to the mock chain.
 *
 * Real game watching / multi-seat orchestration lands in a later wave once the
 * Fair Game Engine contract exists.
 */

import { hasApiKey, loadConfig, resolveModel } from './config.js';
import { decide } from './decide.js';
import { MockChain } from './mock-chain.js';
import { getPersona } from './persona.js';
import type { Phase, Role } from './types.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const chain = new MockChain();

  // Example game: 6 seats, night phase.
  chain.createGame({
    gameId: 'example-game-1',
    seats: 6,
    phase: 'night' satisfies Phase,
  });

  // The keeper's seat. `role` is what the seat's own viewing key reveals —
  // it is the ONLY hidden info this AI player possesses.
  const seat = 2;
  const personaId = 'deceptive' as const;
  const role: Role = 'werewolf';

  // Read via the adapter (deep clone) so `decide`/`submit` cannot mutate the
  // adapter's internal state.
  const state = await chain.readGameState('example-game-1');

  console.log('Nightfall Keeper — example decision');
  console.log(`  model : ${resolveModel('default', config).id}`);
  console.log(
    `  apiKey: ${hasApiKey(config) ? 'present' : 'missing (deterministic mock mode)'}`,
  );
  console.log(`  game  : ${state.gameId} (phase=${state.phase}, seats=${state.seats.length})`);
  console.log(
    `  seat  : ${seat} | persona=${getPersona(personaId).name} | role=${role}`,
  );

  const decision = await decide({
    seat,
    persona: personaId,
    role,
    state,
    config,
  });

  console.log('\nDecision:');
  console.log(JSON.stringify(decision, null, 2));

  const receipt = await chain.submitDecision(seat, decision, state.gameId);
  console.log('\nMock chain receipt:');
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((err) => {
  console.error('[keeper] crashed:', err);
  process.exitCode = 1;
});
