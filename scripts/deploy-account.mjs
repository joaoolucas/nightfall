#!/usr/bin/env node
/** Deploy a counterfactual OpenZeppelin account on Sepolia. */

import { RpcProvider, Account, ec, constants } from "starknet";

const network = (process.env.PORTAGE_NETWORK ?? "sepolia").trim().toLowerCase();
const rpcUrl = process.env.PORTAGE_RPC_URL?.trim();
const address = process.env.DEPLOYER_ADDRESS?.trim();
const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const classHash = process.env.DEPLOYER_CLASS_HASH?.trim();

if (!rpcUrl) throw new Error("PORTAGE_RPC_URL is required");
if (!address || !privateKey) throw new Error("DEPLOYER_ADDRESS and DEPLOYER_PRIVATE_KEY are required");
if (!classHash) throw new Error("DEPLOYER_CLASS_HASH is required");

const provider = new RpcProvider({ nodeUrl: rpcUrl });
const actualChainId = await provider.getChainId();
const expectedChainId = network === "mainnet"
  ? constants.StarknetChainId.SN_MAIN
  : constants.StarknetChainId.SN_SEPOLIA;
if (actualChainId !== expectedChainId) {
  throw new Error(`RPC chain mismatch: expected ${expectedChainId}, received ${actualChainId}.`);
}

// Derive the public key from the private key
const pubKey = ec.starkCurve.getStarkKey(privateKey);
console.log(`Network  : ${network}`);
console.log(`Chain ID : ${actualChainId}`);
console.log(`Address  : ${address}`);
console.log(`PubKey   : ${pubKey}`);
console.log(`Class    : ${classHash}`);

// Create an account instance for deployment (not yet deployed)
const account = new Account({ provider, address, signer: privateKey });

console.log("\nDeploying account…");
const result = await account.deployAccount({
  classHash,
  constructorCalldata: [pubKey],
  addressSalt: pubKey,
});

console.log(`tx hash: ${result.transaction_hash}`);
console.log(`address: ${result.contract_address}`);

await provider.waitForTransaction(result.transaction_hash, { retries: 80, retryInterval: 3_000 });

console.log("\nAccount deployed successfully!");
console.log(`Transaction: ${result.transaction_hash}`);
console.log(`Address:     ${result.contract_address}`);
