# Deployment and evidence runbook

Do not use Mainnet until both protocol blockers are closed. Hatch entropy is now
commit-reveal (step 4 proves it on a real chain); marketplace settlement still moves no
STRK and still needs an independently reviewed anonymizer. STRK20 app controls can be
verified separately with Ready.

## 1. Verify locally

```bash
npm ci
npm --prefix app ci
npm run build:contracts
npm run test:contracts
npm run build:app
npm run validate:submission
```

Expected contract baseline: 36 passing tests. `strk20.json` readiness validation allows
empty evidence; final validation does not.

Also run the offline hatch check, which needs no network:

```bash
npm run verify:hatch -- --offline
```

It cross-checks the client's poseidon against the vectors the Cairo tests pin. A failure
here is the expensive kind: the client would commit a digest the contract cannot recognise,
so the commit is paid for and every reveal reverts as `BAD_SECRET`.

## 2. A Sepolia deployer account

You need a funded Sepolia account. Create it yourself — never paste a key that also guards
Mainnet funds, and never commit one.

1. Create a throwaway account in Ready, Argent or Braavos, switched to Sepolia. (Or use
   `starkli signer keystore new` plus `starkli account deploy` if you prefer the CLI.)
2. Fund it from a Starknet Sepolia faucet. The account must be **deployed**, not merely
   generated — a fresh address is not an account until its first transaction deploys it,
   and most wallets do that for you once it holds funds.
3. Put the credentials in `app/.env.local`, which is gitignored. Do not put them in `.env`,
   which is committed.

There is no working keyless RPC any more (see the note in `scripts/deploy.mjs`). One
Alchemy key covers both networks — the same URL with the host swapped between
`starknet-mainnet` and `starknet-sepolia`.

## 3. Sepolia contract

```bash
PORTAGE_NETWORK=sepolia \
PORTAGE_RPC_URL=https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/YOUR_KEY \
DEPLOYER_ADDRESS=0x... \
DEPLOYER_PRIVATE_KEY=0x... \
npm run deploy
```

The script checks `SN_SEPOLIA`, waits for confirmation and writes
`contracts/deployments/sepolia.json`. Copy only the resulting address into
`app/.env.local` as `NEXT_PUBLIC_PORTAGE_ADDRESS`.

## 4. Prove the hatch is fair on a real chain

```bash
PORTAGE_RPC_URL=…same as above… \
DEPLOYER_ADDRESS=0x... \
DEPLOYER_PRIVATE_KEY=0x... \
npm run verify:hatch
```

This drives a real `commit_hatch` → wait 10 blocks → `reveal_hatch`, then recomputes the
roll from the commit block's hash using a transcription of the published rarity table, and
asserts the chain stored what those rules say it should have. The contract address is read
from `contracts/deployments/sepolia.json`.

This step exists because it cannot be a unit test: `get_block_hash_syscall` returns an
error in the `cairo_test` VM, and the entire fairness argument rests on that syscall. It is
also the only place that confirms `REVEAL_DELAY = 10` is actually enough on a real chain —
too low, and every reveal on Mainnet would fail after the commit was already paid for.

Record the two transaction hashes; they are the evidence that the hatch is manipulation
resistant, which is the precondition for deploying this contract to Mainnet at all.

Smoke test with Voyager links recorded separately:

- Connect Ready and confirm Wallet API `>=0.10.3` is shown as supported.
- Commit a hatch, wait the reveal delay, reveal it, then expedition, evolve, list, cancel.
- Confirm a reveal attempted before the delay is refused as TOO_EARLY rather than rolling.
- The hatch is manipulation resistant once step 4 passes; until it has run on this
  deployment, do not claim it.
- Do **not** execute the current unpaid `buy` path; the app disables it.
- Shield a small test amount, wait about 10 blocks, private-send, then unshield.
- Repeat unsupported-wallet and rejected-request paths.

## 5. Production app

Set Vercel variables from `app/.env.example`; never add deployer credentials. Deploy from
`app/`, test desktop/mobile, then set the GitHub repository Website to the production URL.

```bash
cd app
vercel                         # preview
vercel --prod                  # only after preview smoke test
```

Verified public production app: `https://portage-topaz.vercel.app` (HTTP 200, Wave 3 UI).
`portage.fun` and `www.portage.fun` point at the deployment but currently redirect anonymous
visitors to Vercel login; remove custom-domain deployment protection before using them as the demo URL.

## 6. Mainnet gate

Required before deployment:

- Commit-reveal hatch: implemented, and step 4 run against this exact deployment. A green
  local test suite is not enough — the syscall it depends on cannot run in the test VM.
- Standard NFT/operator flow and listing invalidation on ownership change.
- Actual STRK settlement, rake transfer, stale-price/replay/rollback tests.
- Team-owned Portage anonymizer reviewed independently; private payment/public NFT boundary approved.
- Emergency policy and low-value deployment account funded.

Then deploy with an explicit second guard:

```bash
PORTAGE_NETWORK=mainnet \
CONFIRM_PORTAGE_MAINNET=DEPLOY_PORTAGE_MAINNET \
PORTAGE_RPC_URL=https://your-mainnet-rpc \
DEPLOYER_ADDRESS=0x... \
DEPLOYER_PRIVATE_KEY=0x... \
npm run deploy
```

## 7. Mainnet evidence

After explicit approval at execution time, make at least three genuine low-value actions
that touch the canonical STRK20 pool, such as shield, mature private transfer and unshield.
Record each hash immediately in `strk20.json`; verify `SN_MAIN`, success and canonical pool
events on Voyager. Private transactions are relayed, so never attribute a user from the
transaction sender; deposits identify the account through topic1 of the pool `Deposit` event.

```bash
STRK20_MAINNET_RPC_URL=https://your-mainnet-rpc \
npm run validate:submission:final
```

Add verified Portage/anonymizer addresses, public demo URL and <=3-minute video URL, push,
and confirm the sprint hub refresh sees all evidence.
