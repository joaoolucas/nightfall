#!/usr/bin/env node
/** Deploy Portage with explicit network and chain-safety checks. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, constants, RpcProvider } from "starknet";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const network = (process.env.PORTAGE_NETWORK ?? "sepolia").trim().toLowerCase();
if (!new Set(["sepolia", "mainnet"]).has(network)) {
  throw new Error("PORTAGE_NETWORK must be 'sepolia' or 'mainnet'.");
}
if (network === "mainnet" && process.env.CONFIRM_PORTAGE_MAINNET !== "DEPLOY_PORTAGE_MAINNET") {
  throw new Error("Mainnet guard: set CONFIRM_PORTAGE_MAINNET=DEPLOY_PORTAGE_MAINNET after review.");
}

const defaultSepoliaRpc = "https://starknet-sepolia.public.blastapi.io/rpc/v0_8";
const rpcUrl = process.env.PORTAGE_RPC_URL?.trim() || (network === "sepolia" ? defaultSepoliaRpc : "");
const address = process.env.DEPLOYER_ADDRESS?.trim();
const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
if (!rpcUrl) throw new Error("PORTAGE_RPC_URL is required for Mainnet.");
if (!address || !privateKey) {
  throw new Error("DEPLOYER_ADDRESS and DEPLOYER_PRIVATE_KEY are required via the environment only.");
}

const provider = new RpcProvider({ nodeUrl: rpcUrl });
const actualChainId = await provider.getChainId();
const expectedChainId = network === "mainnet"
  ? constants.StarknetChainId.SN_MAIN
  : constants.StarknetChainId.SN_SEPOLIA;
if (actualChainId !== expectedChainId) {
  throw new Error(`RPC chain mismatch: expected ${expectedChainId}, received ${actualChainId}.`);
}

const sierraPath = join(root, "contracts", "target", "dev", "strk20_invoke_helper_Portage.contract_class.json");
const casmPath = join(root, "contracts", "target", "dev", "strk20_invoke_helper_Portage.compiled_contract_class.json");
const sierra = JSON.parse(readFileSync(sierraPath, "utf8"));
const casm = JSON.parse(readFileSync(casmPath, "utf8"));
const account = new Account(provider, address, privateKey);

console.log(`Network  : ${network}`);
console.log(`Chain ID : ${actualChainId}`);
console.log(`Deployer : ${address}`);
console.log("Declaring and deploying Portage…");

const { declare, deploy } = await account.declareAndDeploy({ contract: sierra, casm });
await provider.waitForTransaction(deploy.transaction_hash, { retries: 80, retryInterval: 3_000 });

const output = {
  network,
  chain_id: actualChainId,
  contract: "Portage",
  class_hash: declare.class_hash,
  address: deploy.contract_address,
  declare_tx: declare.transaction_hash,
  deploy_tx: deploy.transaction_hash,
  deployed_at: new Date().toISOString(),
};
const deploymentsDir = join(root, "contracts", "deployments");
mkdirSync(deploymentsDir, { recursive: true });
const outPath = join(deploymentsDir, `${network}.json`);
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);

console.log("\nDeployment confirmed.");
console.log(`class hash      : ${output.class_hash}`);
console.log(`contract address: ${output.address}`);
console.log(`declare tx      : ${output.declare_tx}`);
console.log(`deploy tx       : ${output.deploy_tx}`);
console.log(`wrote           : ${outPath}`);
console.log("Commit addresses and hashes only — never credentials.");
