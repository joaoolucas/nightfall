# Deployment and evidence runbook

Do not use Mainnet until both protocol blockers are closed: manipulation-resistant hatch
entropy and real STRK/NFT marketplace settlement with independent review. STRK20 app
controls can be verified separately with Ready.

## 1. Verify locally

```bash
npm ci
npm --prefix app ci
npm run build:contracts
npm run test:contracts
npm run build:app
npm run validate:submission
```

Expected contract baseline: 24 passing tests. `strk20.json` readiness validation allows
empty evidence; final validation does not.

## 2. Sepolia contract

Use a low-value funded deployer. Do not save its private key in this repository.

```bash
PORTAGE_NETWORK=sepolia \
PORTAGE_RPC_URL=https://your-sepolia-rpc \
DEPLOYER_ADDRESS=0x... \
DEPLOYER_PRIVATE_KEY=0x... \
npm run deploy
```

The script checks `SN_SEPOLIA`, waits for confirmation and writes
`contracts/deployments/sepolia.json`. Copy only the resulting address into
`app/.env.local` as `NEXT_PUBLIC_PORTAGE_ADDRESS`.

Smoke test with Voyager links recorded separately:

- Connect Ready and confirm Wallet API `>=0.10.3` is shown as supported.
- Hatch prototype, expedition, evolve, list and cancel.
- Do **not** describe the caller-seeded hatch as manipulation-resistant.
- Do **not** execute the current unpaid `buy` path; the app disables it.
- Shield a small test amount, wait about 10 blocks, private-send, then unshield.
- Repeat unsupported-wallet and rejected-request paths.

## 3. Production app

Set Vercel variables from `app/.env.example`; never add deployer credentials. Deploy from
`app/`, test desktop/mobile, then set the GitHub repository Website to the production URL.

```bash
cd app
vercel                         # preview
vercel --prod                  # only after preview smoke test
```

## 4. Mainnet gate

Required before deployment:

- Commit/reveal or VRF hatch design, replay/front-running protection and timeout/refund tests.
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

## 5. Mainnet evidence

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
