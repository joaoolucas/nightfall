/**
 * Verify the commit-reveal hatch.
 *
 * Two modes, because two different things need checking and only one of them
 * needs a chain:
 *
 *   --offline  Cross-check the client's poseidon against the vectors the Cairo
 *              tests pin. Cheap, no network, and it catches the failure that
 *              costs the most: a client that computes a digest the contract
 *              will not recognise, so the commit is paid for and the reveal
 *              always reverts as BAD_SECRET.
 *
 *   (default)  Drive a real commit → wait → reveal against a deployed contract,
 *              then recompute the roll from the `Hatched` event and assert the
 *              contract rolled what the public rules say it should have. This
 *              needs a chain because `get_block_hash_syscall` has no answer in
 *              the `cairo_test` VM — which is exactly why the happy path is
 *              verified here rather than in the unit tests.
 *
 * Usage:
 *   node scripts/verify-hatch.mjs --offline
 *   PORTAGE_RPC_URL=… DEPLOYER_ADDRESS=… DEPLOYER_PRIVATE_KEY=… \
 *     node scripts/verify-hatch.mjs
 *
 * The contract address comes from contracts/deployments/<network>.json, which
 * the deploy script writes, unless PORTAGE_ADDRESS overrides it.
 *
 * Sepolia is the intended target. The script refuses Mainnet unless told
 * explicitly, because a Mainnet hatch is a permanent public artifact and should
 * never happen because someone forgot which RPC was in their shell.
 */

import { Account, Contract, RpcProvider, constants, hash, num } from "starknet";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OFFLINE = process.argv.includes("--offline");
const ALLOW_MAINNET = process.env.CONFIRM_PORTAGE_MAINNET === "DEPLOY_PORTAGE_MAINNET";

/** Mirrors `commitment_digest` in portage.cairo. */
const commitmentDigest = (secret, caller) =>
  hash.computePoseidonHashOnElements([num.toBigInt(secret), num.toBigInt(caller)]);

/** Mirrors `mix_entropy` in portage.cairo. */
const mixEntropy = (secret, blockHash, commitBlock) =>
  hash.computePoseidonHashOnElements([
    num.toBigInt(secret),
    num.toBigInt(blockHash),
    BigInt(commitBlock),
  ]);

/**
 * The rarity table, duplicated from the contract on purpose.
 *
 * An independent verifier that imported the contract's own numbers would agree
 * with it by construction and prove nothing. These are transcribed from the
 * published table, so if the deployed weights ever drift from what the project
 * documents, this disagrees.
 */
const WEIGHTS = [
  ["common", 40],
  ["uncommon", 25],
  ["rare", 15],
  ["epic", 10],
  ["legendary", 7],
  ["mythic", 3],
];
const SPECIES = ["ember", "creek", "grove", "stone", "mist", "sky"];
const FELT_PRIME = 2n ** 251n + 17n * 2n ** 192n + 1n;

function rollRarity(seed, count) {
  const r = num.toBigInt(hash.computePoseidonHashOnElements([num.toBigInt(seed), BigInt(count)]));
  let roll = r % 100n;
  for (const [name, weight] of WEIGHTS) {
    if (roll < BigInt(weight)) return name;
    roll -= BigInt(weight);
  }
  return "mythic";
}

function rollSpecies(seed, count) {
  const s = num.toBigInt(
    hash.computePoseidonHashOnElements([num.toBigInt(seed), BigInt(count), 1n]),
  );
  return SPECIES[Number(s % 6n)];
}

function fail(message) {
  console.error(`verify-hatch: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Offline: agree with the Cairo tests, or say so loudly.
// ---------------------------------------------------------------------------

function runOffline() {
  // The same vectors asserted by test_poseidon_matches_starknet_js.
  const cases = [
    {
      what: "commitment_digest(0xC0FFEE, 'ALICE')",
      got: commitmentDigest("0xC0FFEE", "0x414C494345"),
      want: "0x750a5391ab75d5e231e6b3da71f9d953b5495a3d075f9bf9b43e9895249f0f8",
    },
    {
      what: "mix_entropy(0xAAA, 0xBBB, 7)",
      got: mixEntropy("0xAAA", "0xBBB", 7),
      want: "0x540c972064a535bfd9adf553e25192c00ea5f47dee634f17609cd7a33b4f206",
    },
  ];

  let bad = 0;
  for (const { what, got, want } of cases) {
    const ok = num.toBigInt(got) === num.toBigInt(want);
    console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
    if (!ok) {
      console.error(`      client:   ${got}`);
      console.error(`      contract: ${want}`);
      bad += 1;
    }
  }

  // A digest must depend on both halves, or the binding it claims is a lie.
  const a = commitmentDigest("0x1", "0xAAA");
  if (num.toBigInt(a) === num.toBigInt(commitmentDigest("0x1", "0xBBB"))) {
    console.error("FAIL  digest ignores the caller — a stolen secret would be redeemable");
    bad += 1;
  }
  if (num.toBigInt(a) === num.toBigInt(commitmentDigest("0x2", "0xAAA"))) {
    console.error("FAIL  digest ignores the secret");
    bad += 1;
  }

  if (bad) fail(`${bad} check(s) failed — the client and the contract disagree`);
  console.log("\nclient poseidon agrees with the contract.");
}

// ---------------------------------------------------------------------------
// Online: a real commit → wait → reveal, then recompute the roll.
// ---------------------------------------------------------------------------

async function runOnline() {
  const network = (process.env.PORTAGE_NETWORK ?? "sepolia").trim().toLowerCase();
  const rpcUrl = process.env.PORTAGE_RPC_URL?.trim();
  // Same names the deploy script uses, so one set of variables covers both.
  const accountAddress = (process.env.DEPLOYER_ADDRESS ?? process.env.PORTAGE_ACCOUNT)?.trim();
  const privateKey = (process.env.DEPLOYER_PRIVATE_KEY ?? process.env.PORTAGE_PRIVATE_KEY)?.trim();

  // The deploy writes the address down; read it rather than making someone
  // copy a hex string between two commands and get it subtly wrong.
  let address = process.env.PORTAGE_ADDRESS?.trim();
  if (!address) {
    const recorded = join(HERE, "..", "contracts", "deployments", `${network}.json`);
    try {
      address = JSON.parse(readFileSync(recorded, "utf8")).address;
      console.log(`contract: read from ${network}.json`);
    } catch {
      fail(
        `PORTAGE_ADDRESS is unset and ${recorded} does not exist — deploy first, ` +
          "or pass the address explicitly.",
      );
    }
  }
  if (!rpcUrl) fail("PORTAGE_RPC_URL is required");
  if (!accountAddress || !privateKey) {
    fail("DEPLOYER_ADDRESS and DEPLOYER_PRIVATE_KEY are required via the environment only");
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const chainId = await provider.getChainId();
  if (chainId === constants.StarknetChainId.SN_MAIN && !ALLOW_MAINNET) {
    fail(
      "refusing to hatch on Mainnet. A Mainnet hatch is permanent and public; " +
        "set CONFIRM_PORTAGE_MAINNET=DEPLOY_PORTAGE_MAINNET if that is really the intent.",
    );
  }
  console.log(`network : ${chainId === constants.StarknetChainId.SN_MAIN ? "MAINNET" : chainId}`);
  console.log(`contract: ${address}`);

  const abi = JSON.parse(
    readFileSync(join(HERE, "..", "app", "src", "abis", "portage.abi.json"), "utf8"),
  );
  // starknet.js >= 9 took (provider, address, privateKey); v10 takes a single options object.
  const account = new Account({ provider, address: accountAddress, signer: privateKey });
  const contract = new Contract({ abi, address, provider });

  // A secret nobody else has seen. It never leaves this process before the
  // reveal, which is the property the whole scheme rests on.
  const secretBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(secretBytes);
  secretBytes[0] &= 0x07;
  let secret = 0n;
  for (const b of secretBytes) secret = (secret << 8n) | BigInt(b);
  secret %= FELT_PRIME;
  const digest = commitmentDigest(num.toHex(secret), accountAddress);

  const countBefore = Number(
    num.toBigInt((await contract.call("get_hatch_count", [], { parseResponse: false }))[0]),
  );

  console.log("\ncommitting…");
  const commitTx = await account.execute([contract.populate("commit_hatch", [digest])]);
  await provider.waitForTransaction(commitTx.transaction_hash);
  console.log(`  tx ${commitTx.transaction_hash}`);

  const [storedDigest, commitBlock] = (
    await contract.call("get_commitment", [accountAddress], { parseResponse: false })
  ).map((v) => num.toBigInt(v));
  if (storedDigest !== num.toBigInt(digest)) {
    fail("the contract stored a different digest than the client computed");
  }
  console.log(`  commit block ${commitBlock}`);

  // The wait is the point: the block hash the roll uses does not exist yet.
  console.log("\nwaiting for the reveal delay (10 blocks)…");
  for (;;) {
    const head = await provider.getBlockNumber();
    if (BigInt(head) >= commitBlock + 10n) break;
    process.stdout.write(`  block ${head} / ${commitBlock + 10n}\r`);
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log("\nrevealing…");
  const revealTx = await account.execute([
    contract.populate("reveal_hatch", [num.toHex(secret)]),
  ]);
  const receipt = await provider.waitForTransaction(revealTx.transaction_hash);
  console.log(`  tx ${revealTx.transaction_hash}`);

  // Recompute the roll from the event and check the contract obeyed the public
  // table. This is the assertion that matters: not that a hatch happened, but
  // that it happened by the rules anyone can read.
  const value = receipt?.value ?? receipt;
  const events = value.events ?? [];
  const fromContract = events.filter(
    (e) => num.toBigInt(e.from_address) === num.toBigInt(address),
  );
  if (fromContract.length === 0) fail("the reveal emitted no event from the contract");

  const blockHashSeen = await provider
    .getBlockWithTxHashes(Number(commitBlock))
    .then((b) => b.block_hash)
    .catch(() => null);
  if (!blockHashSeen) fail(`could not read the hash of block ${commitBlock}`);

  const expectedSeed = mixEntropy(num.toHex(secret), blockHashSeen, commitBlock);
  const expectedRarity = rollRarity(expectedSeed, countBefore);
  const expectedSpecies = rollSpecies(expectedSeed, countBefore);

  console.log("\nrecomputed independently from the published rules:");
  console.log(`  commit block hash : ${blockHashSeen}`);
  console.log(`  mixed seed        : ${expectedSeed}`);
  console.log(`  expected rarity   : ${expectedRarity}`);
  console.log(`  expected species  : ${expectedSpecies}`);
  console.log(`  token id          : ${countBefore}`);

  const [, species, rarity] = await contract.call("get_creature", [BigInt(countBefore)], {
    parseResponse: false,
  });
  const gotSpecies = SPECIES[Number(num.toBigInt(species))];
  const gotRarity = WEIGHTS[Number(num.toBigInt(rarity))][0];
  console.log("\nwhat the chain actually stored:");
  console.log(`  rarity  : ${gotRarity}`);
  console.log(`  species : ${gotSpecies}`);

  if (gotRarity !== expectedRarity || gotSpecies !== expectedSpecies) {
    fail("the contract did not roll what the public rules say it should have");
  }
  console.log("\nthe hatch matches an independent recomputation.");
}

if (OFFLINE) runOffline();
else await runOnline();
