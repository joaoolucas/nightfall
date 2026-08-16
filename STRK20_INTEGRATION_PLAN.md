# STRK20 Privacy Integration Plan — Portage.fun

Generated 2026-08-16 by the `strk20-privacy-integration` skill.
No implementation phase starts until this plan is approved.

## 1. Project snapshot

- Stack: Next.js 16, React 19, `starknet@10.4.0`, get-starknet wallet discovery
  `6.0.2`, Wallet API types `0.10.3`, Zustand, Cairo/Scarb contracts and Starknet
  Foundry tests.
- Wallet connection: `app/src/app/components/client/WalletHandle/SelectWallet.tsx:67`
  creates `WalletAccountV6`; supported specs are stored at line 92.
- Existing STRK20 actions:
  `app/src/app/components/client/WalletHandle/WalletAccountV6Tag.tsx:191-353`
  implements shield, private transfer, unshield, balance reads and a generic
  `privacy_invoke` echo demo.
- Game transaction layer: `app/src/utils/portage-client.ts:104-174` submits public
  hatch, list, buy, cancel, expedition and evolution calls.
- Game contract: `contracts/src/portage.cairo:360` exposes public hatch and
  `contracts/src/portage.cairo:446` records marketplace settlement without moving STRK.
- Builder type: a dapp whose users connect their own wallets, plus a team-owned
  Cairo game/marketplace protocol.
- Privacy goal inferred from `docs/SPEC.md`: private STRK payments for hatches and
  marketplace trades; hide the payer/user address from protocol actions where
  practical; delay publication of hatch outcomes until reveal.
- Environment: Ready wallet for integration tests; Mainnet is required for the
  final sprint evidence. No mainnet action runs without explicit approval.

## 2. Chosen route: Wallet API + app-specific marketplace anonymizer

Use `WalletAccountV6` for shield, private transfer and unshield. A private
marketplace purchase is protocol-specific, so it additionally requires a
team-owned, audited anonymizer that atomically withdraws shielded STRK, invokes
Portage settlement, pays the seller/rake and handles the NFT transfer.

The dapp never touches viewing keys, notes or proofs; the user's privacy-enabled
wallet performs STRK20 operations. The production anonymizer remains team-owned
Cairo code and must be reviewed and audited.

A scope correction is mandatory: STRK20 shields ERC-20 value, not NFT ownership.
The current public `owner_of` and creature metadata remain visible after mint or
transfer. “Private hatch until reveal” therefore needs a separate on-chain
commitment/reveal design; STRK20 can privately fund the hatch but cannot by itself
hide a publicly minted creature.

## 3. What this delivers — hidden vs visible

| Private | Public |
|---|---|
| Sender/receiver and amount of an in-pool STRK transfer | Shield and unshield amounts and timing |
| Shielded STRK balance inside the wallet/pool | Fact that an address interacted with the pool |
| User address behind a correctly designed marketplace anonymizer action | Marketplace action, NFT token ID, transfer, price/rake fields intentionally emitted by Portage |
| Hatch payment after STRK is already shielded | Public reveal commitment, reveal timing and the revealed creature |

The anonymizer can hide the buyer address from the payment leg, but public NFT
ownership can re-identify the buyer unless ownership is redesigned around an
unlinkable account. Wallet-mediated sub-accounts are not available yet, so do not
claim unlinkable NFT ownership in v0.

Do not bundle the original public shield and the private purchase unless the UI
explicitly explains the correlation leak. Shield first, wait for note maturity,
then purchase privately.

## 4. Prerequisites & versions

- Keep `starknet@10.4.0`.
- Pin `@starknet-io/get-starknet-discovery` to `6.0.3` (upgraded from `6.0.2`).
- Pin `@starknet-io/get-starknet-wallet-standard` to `6.0.3` (upgraded from `6.0.2`).
- Re-verified 2026-08-16: `6.0.4` is available but pulls Wallet API `0.10.4-beta.2`;
  Portage deliberately remains on the stable `6.0.3`/`0.10.3` combination.
- Keep `@starknet-io/types-js@0.10.3`.
- Test with Ready and compare against https://starknet-wallet-account.vercel.app/.
- Canonical Mainnet pool:
  `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`.
- Use `SN_MAIN` and an Alchemy RPC read from an environment variable; never commit
  the key.
- Freshness script could not run because Python is unavailable. Manual checks on
  2026-08-16 confirmed the stable pins and reference paths; npm now exposes 6.0.4
  with beta Wallet API types, so Portage retained 6.0.3. Re-run the bundled script
  when Python is installed.

## 5. Phase 1 — game-native wallet privacy 🟡 headless complete 2026-08-16; Ready verification pending

1. Upgrade both get-starknet packages to `6.0.3` and refresh the lockfile.
2. Extract STRK20 calls from the generic `WalletAccountV6Tag.tsx` demo into a
   typed service/hook used by Portage components.
3. Detect support with `supportedWalletApi`/`supportedSpecs`; never probe balances
   for capability detection.
4. Gracefully disable private actions for unsupported wallets and explain that
   Ready is the current test wallet.
5. Add a Portage economy drawer for shield, private send and unshield; keep
   balance access behind an explicit user action/consent.
6. Label shield as two prompts (ERC-20 approval then deposit), show note maturity,
   pool fees, screening outcomes, timeout recovery and explorer links.
7. Verify with Ready on testnet before any Mainnet run.

Headless implementation: package pins, `app/src/utils/strk20.ts`, capability gating,
validated inputs, explicit balance consent, public/private copy, onchain Mainnet fee read,
bounded confirmation and unsupported-wallet fallback are complete. The generic Echo UI
was removed. Manual Ready shield/transfer/unshield and screening-path verification remains
the phase boundary; no Mainnet action was performed.

## 6. Phase 2 — private marketplace settlement

1. Specify the atomic flow on paper: shielded STRK withdrawal → validate listing
   and price → transfer NFT → seller proceeds/rake → output note or explicit
   public payout policy.
2. Decide what must remain public in `Sold`; remove public buyer/payment fields
   that would defeat the intended privacy without sacrificing auditability.
3. Study `packages/ekubo_swap_anonymizer` and
   `packages/vesu_lending_anonymizer`; Portage must not use the generic echo helper
   as its production settlement contract.
4. Team implements and tests its own Cairo anonymizer, including rollback,
   slippage/price binding, replay protection, token allowlisting, rake math and
   stranded-fund tests.
5. Independent review/audit before Mainnet deployment.
6. Replace `PortageClient.buy()` with a Wallet API action batch that invokes the
   audited helper. The UI must distinguish “private payment” from public NFT
   ownership.

## 7. Phase 3 — private-funded hatch and delayed reveal

1. Replace caller-selected `hatch(seed)` with a manipulation-resistant
   commit-reveal/VRF design; never market the current seed-grindable flow as fair.
2. Store only a hatch commitment before reveal; define expiry, cancellation and
   refund behavior.
3. Add private STRK payment through a reviewed hatch anonymizer or shared Portage
   anonymizer.
4. Reveal mints/publishes the creature. Clearly state that the reveal and final
   NFT owner are public.
5. Track Wallet API sub-accounts as the entry criterion for unlinkable public game
   identities; do not block v0 on this unshipped wallet capability.

## 8. Testing

- Headless: `npm ci`, `npx tsc --noEmit`, `npm run build`, `scarb build`,
  `scarb test`.
- Ready extension: capability detection, shield, note maturity, private transfer,
  unshield, rejected screening and unsupported-wallet fallback.
- Marketplace helper: success, stale listing, wrong token, changed price, revert
  rollback, duplicate/replay, rake rounding and no stranded funds.
- Hatch: commitment secrecy, reveal determinism, timeout/refund and seed-grinding
  resistance.
- Mainnet smoke test only after explicit approval and audit readiness.

Private transactions are relayed, so analytics must never attribute users from the
transaction sender. Any shield leaderboard/history reads the pool `Deposit` event
and filters its first indexed key. Portage gameplay leaderboards should use
Portage events and disclose that those actions are public.

## 9. Compliance & security notes

- Deposit screening is enforced onchain on every route; self-hosted proving does
  not bypass it.
- Selective disclosure can answer legitimate requests without exposing unrelated
  users, but is not automatic compliance or regulator endorsement.
- Never store viewing keys or private keys in frontend, backend, config or repo.
- The team owns legal decisions and the anonymizer's review, audit, deployment and
  maintenance.

## 10. Open items to re-verify at build time

- Run `scripts/check_freshness.py --quick` after installing Python.
- WalletAccount guide and package dist-tags were re-fetched 2026-08-16; repeat before Mainnet.
- Confirm Ready/Xverse support and Wallet API sub-account status.
- Read the live pool fee with `get_fee_amount`; do not hardcode it.
- Decide seller settlement privacy and whether the NFT's public owner is acceptable.
- Obtain funded deployment accounts without putting secrets in chat or files.

## 11. Sprint evidence

- Registration is already present in the canonical registry for
  `https://github.com/joaoolucas/nightfall`, Telegram `mortiee_eth`, slug `portage`.
  Do not open a second registration PR.
- Keep root `strk20.json` valid after every deploy.
- Record at least three genuine Mainnet transactions that touched the canonical
  pool (recommended: shield, private transfer, unshield/private Portage action).
- Add every deployed Portage/anonymizer address to `contracts`.
- Add the 3-minute demo link and a public deployment/Website URL.

## 12. Links

- Concepts: https://strk20-by-example.org/what-is-strk20
- Wallet API route: https://strk20-by-example.org/starknet-wallet-api/overview
- starknet.js wiring: https://strk20-by-example.org/starknet-wallet-api/starknet-js
- React integration: https://strk20-by-example.org/starknet-wallet-api/starknet-start-hook
- Private DeFi/invoke: https://strk20-by-example.org/starknet-wallet-api/private-defi
- Anonymizer anatomy: https://strk20-by-example.org/helpers/privacy-invoke
- Compliance/screening: https://strk20-by-example.org/compliance
- SDK/reference contracts: https://github.com/starkware-libs/starknet-privacy
