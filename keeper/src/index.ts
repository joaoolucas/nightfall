/**
 * Keeper entrypoint.
 *
 * Delegates to `drive-seat.ts`, which picks the chain adapter from the
 * environment (real Starknet adapter when `NIGHTFALL_CONTRACT_ADDRESS` is set,
 * in-memory `MockChain` otherwise) and runs one decision for the configured
 * seat.
 */

import { driveSeat } from './drive-seat.js';

driveSeat().catch((err) => {
  console.error('[keeper] crashed:', err);
  process.exitCode = 1;
});
