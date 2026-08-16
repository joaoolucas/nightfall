/**
 * Export the Nightfall contract ABI to the two consumers (app + keeper) from
 * the single source of truth: the compiled Scarb artifact.
 *
 * Usage:
 *   cd contracts && scarb build
 *   node scripts/export-abi.mjs
 *
 * Reads `contracts/target/dev/strk20_invoke_helper_Nightfall.contract_class.json`
 * and writes `app/src/abis/nightfall.abi.json` and
 * `keeper/src/abis/nightfall.abi.json` so they can never drift from the contract.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const artifact = join(
  root,
  'contracts',
  'target',
  'dev',
  'strk20_invoke_helper_Nightfall.contract_class.json',
);

const outputs = [
  join(root, 'app', 'src', 'abis', 'nightfall.abi.json'),
  join(root, 'keeper', 'src', 'abis', 'nightfall.abi.json'),
];

const cc = JSON.parse(readFileSync(artifact, 'utf8'));
const abi = cc.abi;
if (!abi) {
  console.error(`No "abi" key found in ${artifact}`);
  process.exit(1);
}

for (const out of outputs) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(abi, null, 2) + '\n');
  console.log(`wrote ${out} (${abi.length} ABI entries)`);
}
