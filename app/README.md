# Portage.fun app

Next.js 16 client for Portage's caravan, portal, expeditions, marketplace prototype and
STRK20 economy controls.

## Run

```bash
npm ci
cp .env.example .env.local
npm run build
npm run dev
```

`NEXT_PUBLIC_PORTAGE_ADDRESS=0x0` keeps game actions in mock mode. Configure the verified
Sepolia/Mainnet address only after deployment. RPC values belong in `.env.local`; never
put deployer keys in the app.

## STRK20 integration

- `src/utils/strk20.ts` — typed amount/address validation, capability detection,
  shield/private-transfer/unshield calls, explicit balance reads, fee read and bounded confirmation.
- `SelectWallet.tsx` — get-starknet 6.0.3 discovery and Wallet API `>=0.10.3` detection.
- `WalletAccountV6Tag.tsx` — Portage economy UI with honest public/private labels.

The app asks a privacy-enabled wallet to act through starknet.js 10.4.0. It never receives
viewing keys, notes or proofs. Balance access occurs only after the user clicks **Share
balance**. Shielding has two prompts (public ERC-20 approval, then pool deposit), and new
notes take roughly 10 blocks to mature.

Ready is the current manual-test wallet. Other wallets degrade to public mode. STRK20
hides in-pool ERC-20 transfers, not public creature metadata or NFT ownership.

References: [Wallet API overview](https://strk20-by-example.org/starknet-wallet-api/overview) ·
[starknet.js wiring](https://strk20-by-example.org/starknet-wallet-api/starknet-js) ·
[wallet test dapp](https://starknet-wallet-account.vercel.app/)
