# Deploy + Day 0 — getting on the hackathon scoreboard

This is the operational runbook to take Nightfall from local code to real
on-chain transactions. The scoreboard (`strk20.json`) is fed by **real
transactions** — never invent hashes.

## Prerequisites

- A Starknet wallet (Ready/Xverse) with Sepolia STRK for testing.
- A Scarb build (`cd contracts && scarb build`) — already done.
- The Nightfall class hash (compute at deploy time with starknet.js, see below).

## 1. Build artifacts

```bash
cd contracts && scarb build
# artifacts:
#   target/dev/strk20_invoke_helper_Nightfall.contract_class.json       (sierra)
#   target/dev/strk20_invoke_helper_Nightfall.compiled_contract_class.json (casm)
```

## 2. Deploy the Nightfall contract (Sepolia first)

The `Nightfall` contract has **no constructor args** — storage starts default.
Deploy via a standard UDC declare+deploy. `scripts/deploy.mjs` does this for you:

```bash
# mainnet (Alchemy) — put the RPC URL in .env first (see below)
node --env-file=.env scripts/deploy.mjs
```

`DEPLOYER_ADDRESS` / `DEPLOYER_PRIVATE_KEY` must be set in the environment
(never committed). The script reads `NIGHTFALL_RPC_URL` (Alchemy mainnet by
default) and writes `contracts/deployed.json`.

Declared class hash (computed from the built sierra):

```
0x3d4bb5af694af26f3a17040e14042a2b2956416ebdfd16743b6a1be3e2643bd
```

Manual steps (if not using the script):

1. Declare the sierra class → get the class hash.
2. Deploy an instance via the universal deployer (UDC) with calldata
   `[class_hash, salt, unique, constructor_calldata_len(=0)]`.

Record the deployed **contract address** in `app/.env.local`:

```bash
NEXT_PUBLIC_NIGHTFALL_ADDRESS=0x<deployed address>
```

and in `keeper/.env`:

```bash
NIGHTFALL_RPC_URL=https://starknet-sepolia.public.blastapi.io/rpc/v0_7
NIGHTFALL_CONTRACT_ADDRESS=0x<deployed address>
```

## 3. Day 0 — shield + first mainnet tx

The STRK20 pool is already live; the Day 0 bar is one shield and one
`privacy_invoke` round-trip. The app's STRK20 panel (`WalletAccountV6Tag`)
already does shield / private transfer / echo. Steps:

1. Connect wallet on the app, switch to the STRK20 network.
2. **Shield** a small amount of STRK → first tx.
3. Run the **Echo** action (the `StrkInvokeHelper` `privacy_invoke` round-trip)
   → second tx.

Each produces a real tx hash — capture them for `strk20.json`.

## 4. Fill `strk20.json` with real data

```json
{
  "transactions": [
    { "network": "mainnet", "hash": "0x...", "action": "shield" },
    { "network": "mainnet", "hash": "0x...", "action": "privacy_invoke echo" },
    { "network": "mainnet", "hash": "0x...", "action": "nightfall join_game" }
  ],
  "contracts": [
    { "name": "Nightfall", "address": "0x...", "classHash": "0x..." }
  ],
  "demo_video": "https://...",
  "demo_url": "https://..."
}
```

## 5. Demo readiness

- `demo_url` — deploy the Next.js app (Vercel) with `NEXT_PUBLIC_NIGHTFALL_ADDRESS`.
- `demo_video` — 3-min walkthrough: shield, join a table, night action, vote,
  reveal, settle.

## Order of operations tonight

1. Deploy `Nightfall` to Sepolia → test the full game loop in free mode.
2. Run Day 0 shield + echo on **mainnet** (3+ txs).
3. Deploy app to Vercel, record demo URL.
4. Fill `strk20.json` with the real hashes.
5. Push.

> No secrets in git: private keys, `.env`, `.env.local` stay ignored.
