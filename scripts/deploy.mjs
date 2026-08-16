/**
 * Deploy the Portage.fun core contract.
 *
 * Usage:
 *   cd contracts && scarb build
 *   DEPLOYER_ADDRESS=0x... DEPLOYER_PRIVATE_KEY=0x... \
 *     [PORTAGE_RPC_URL=https://...] node scripts/deploy.mjs
 *
 * The Portage contract has no constructor args, so this is a single
 * declare + UDC deploy. Prints the class hash and contract address; you then
 * paste the address into app/.env.local (NEXT_PUBLIC_PORTAGE_ADDRESS).
 *
 * Never commit the private key — read it from the environment only.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Account, RpcProvider } from 'starknet';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const rpcUrl =
  process.env.PORTAGE_RPC_URL?.trim() ||
  'https://starknet-sepolia.public.blastapi.io/rpc/v0_7';
const address = process.env.DEPLOYER_ADDRESS?.trim();
const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();

if (!address || !privateKey) {
  console.error(
    'Missing env: set DEPLOYER_ADDRESS and DEPLOYER_PRIVATE_KEY (read from env only, never committed).',
  );
  process.exit(1);
}

const sierraPath = join(
  root,
  'contracts',
  'target',
  'dev',
  'strk20_invoke_helper_Portage.contract_class.json',
);
const casmPath = join(
  root,
  'contracts',
  'target',
  'dev',
  'strk20_invoke_helper_Portage.compiled_contract_class.json',
);

const sierra = JSON.parse(readFileSync(sierraPath, 'utf8'));
const casm = JSON.parse(readFileSync(casmPath, 'utf8'));

const provider = new RpcProvider({ nodeUrl: rpcUrl });
const account = new Account(provider, address, privateKey);

console.log(`RPC      : ${rpcUrl}`);
console.log(`Deployer : ${address}`);
console.log('Declaring + deploying Portage (no constructor args)…');

const { declare, deploy } = await account.declareAndDeploy({
  contract: sierra,
  casm,
});

console.log('\nDone.');
console.log(`class hash      : ${declare.class_hash}`);
console.log(`declare tx      : ${declare.transaction_hash}`);
console.log(`contract address: ${deploy.contract_address}`);
console.log(`deploy tx       : ${deploy.transaction_hash}`);

const output = {
  network: rpcUrl.includes('mainnet') ? 'mainnet' : 'sepolia',
  contract: 'Portage',
  class_hash: declare.class_hash,
  address: deploy.contract_address,
  declare_tx: declare.transaction_hash,
  deploy_tx: deploy.transaction_hash,
};

const outPath = join(root, 'contracts', 'deployed.json');
writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
console.log(`\nwrote ${outPath} — commit the addresses, NOT any private key.`);
