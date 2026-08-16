#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { constants, RpcProvider } from "starknet";

const FINAL = process.argv.includes("--final");
const ONLINE = process.argv.includes("--online");
const POOL = BigInt("0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a");
const FELT = /^0x[0-9a-fA-F]{1,64}$/;
const REQUIRED_KEYS = ["transactions", "contracts", "demo_video", "demo_url"];

function fail(message) {
  console.error(`strk20.json: ${message}`);
  process.exitCode = 1;
}
function validUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch { return false; }
}

let submission;
try {
  submission = JSON.parse(readFileSync(resolve("strk20.json"), "utf8"));
} catch (error) {
  fail(`invalid JSON (${error.message})`);
  process.exit();
}

const keys = Object.keys(submission).sort();
if (JSON.stringify(keys) !== JSON.stringify([...REQUIRED_KEYS].sort())) {
  fail(`must contain exactly: ${REQUIRED_KEYS.join(", ")}`);
}
if (!Array.isArray(submission.transactions)) fail("transactions must be an array");
if (!Array.isArray(submission.contracts)) fail("contracts must be an array");
for (const [label, values] of [["transaction", submission.transactions], ["contract", submission.contracts]]) {
  if (!Array.isArray(values)) continue;
  const normalized = new Set();
  values.forEach((value, index) => {
    if (typeof value !== "string" || !FELT.test(value) || BigInt(value) === 0n) {
      fail(`${label}s[${index}] is not a non-zero Starknet felt`);
      return;
    }
    const canonical = BigInt(value).toString(16);
    if (normalized.has(canonical)) fail(`${label}s contains a duplicate at index ${index}`);
    normalized.add(canonical);
  });
}
for (const key of ["demo_video", "demo_url"]) {
  if (typeof submission[key] !== "string") fail(`${key} must be a string`);
  else if (submission[key] && !validUrl(submission[key])) fail(`${key} must be an http(s) URL`);
}

if (FINAL) {
  if (submission.transactions.length < 3) fail("final submission needs at least 3 Mainnet transactions");
  if (submission.contracts.length < 1) fail("final submission needs at least 1 deployed contract");
  if (!validUrl(submission.demo_video)) fail("final submission needs demo_video");
  if (!validUrl(submission.demo_url)) fail("final submission needs demo_url");
}

if (ONLINE && !process.exitCode) {
  const rpcUrl = process.env.STRK20_MAINNET_RPC_URL?.trim();
  if (!rpcUrl) {
    fail("--online requires STRK20_MAINNET_RPC_URL");
  } else {
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    const chainId = await provider.getChainId();
    if (chainId !== constants.StarknetChainId.SN_MAIN) fail(`RPC is not SN_MAIN (${chainId})`);
    for (const hash of submission.transactions) {
      try {
        const receipt = await provider.getTransactionReceipt(hash);
        const value = receipt?.value ?? receipt;
        if (value.execution_status === "REVERTED") fail(`${hash} reverted`);
        const touchedPool = (value.events ?? []).some((event) => {
          try { return BigInt(event.from_address) === POOL; } catch { return false; }
        });
        if (!touchedPool) fail(`${hash} has no event emitted by the canonical STRK20 pool`);
      } catch (error) {
        fail(`${hash} could not be verified (${error.message})`);
      }
    }
    for (const address of submission.contracts) {
      try { await provider.getClassHashAt(address); }
      catch (error) { fail(`${address} is not a deployed Mainnet contract (${error.message})`); }
    }
  }
}

if (!process.exitCode) {
  console.log(`strk20.json is valid (${FINAL ? "final" : "readiness"}${ONLINE ? ", online SN_MAIN checked" : ""}).`);
}
