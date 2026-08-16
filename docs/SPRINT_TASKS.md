# STRK20 Private Sprint — submission and build checklist

This checklist translates the official sprint prompt into repo-specific work for
Portage.fun. Privacy implementation follows `STRK20_INTEGRATION_PLAN.md` and does
not begin until that plan is approved.

## P0 — Registration and eligibility

- [x] Public repository contains code and commits.
- [x] Canonical registry contains exactly one Portage entry:
  `https://github.com/joaoolucas/nightfall`, Telegram `mortiee_eth`.
- [x] Registration describes Portage.fun as a Gaming project.
- [x] Confirmed canonical `registry.json` on 2026-08-16.
- [ ] Keep repository public through judging.
- [ ] **Do not open a second application PR.** Registration is complete.

## P0 — Required repository metadata

- [x] Root `strk20.json` exists with all four required fields.
- [ ] Add three Starknet **Mainnet** transaction hashes that genuinely touched:
  `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`.
- [ ] Validate every submitted hash on Voyager and confirm `SN_MAIN`.
- [ ] Add all deployed Portage/helper/anonymizer contract addresses.
- [ ] Add a public 3-minute demo video URL.
- [ ] Set the GitHub repository Website to the production demo URL (GitHub CLI unavailable);
  verified fallback `demo_url` is present in `strk20.json`.
- [x] Validate `strk20.json` as strict JSON after every update (`npm run validate:submission`).

## P0 — Skill and official context

- [x] Install `starkience/strk20-agent-skills`.
- [x] Fetch and read `https://strk20-by-example.org/llms-full.txt`.
- [x] Load the starter kit and `awesome-strk20` as ignored local references.
- [x] Read the sprint `IDEAS.md` and privacy-route guidance.
- [x] Write repo-specific `STRK20_INTEGRATION_PLAN.md`.
- [x] Plan approved by the 2026-08-16 Wave 3 kickoff; Phase 1 execution authorized.
- [ ] Install Python and run the skill freshness checker; manual version/path
  checks passed while Python was unavailable.

## P0 — Honest product/privacy boundary

- [x] Change copy from “private creature ownership” to the deliverable truth:
  private STRK payment; public NFT ownership after reveal.
- [x] Add a “What stays private?” explainer to the game and README.
- [x] Never claim the STRK20 ERC-20 pool hides NFT metadata or `owner_of`.
- [x] Document that private activity must not infer identity from transaction `sender`
  (it is the relayer); pool deposit history uses `Deposit` event topic1.
- [ ] Keep balance reads user-initiated; capability detection must not trigger a
  balance consent prompt.

## P0 — Wallet API hardening

- [x] Upgrade get-starknet discovery + wallet-standard `6.0.2 → 6.0.3`.
- [x] Extract STRK20 actions from the generic starter panel into a Portage service.
- [x] Gate private actions using `supportedWalletApi`/`supportedSpecs >= 0.10.3`.
- [x] Gracefully degrade for unsupported wallets; recommend Ready for testing.
- [x] Replace hardcoded demo amounts with validated inputs and token decimals.
- [x] Explain two-step shielding: public ERC-20 approval, then pool deposit.
- [x] Display note maturity (~10 blocks) before spending newly shielded funds.
- [x] Read the Mainnet pool fee onchain; never hardcode the amount or promise free privacy.
- [x] Add bounded confirmation waits and “submitted, check explorer” fallback.
- [x] Normalize all Starknet addresses via bigint before comparisons.
- [x] Surface onchain screening rejection as a protocol outcome, not an app bug.

## P0 — Real STRK20 game integration

- [x] Remove the generic echo demo and expose Portage-branded shield/send/unshield actions.
- [ ] Design private marketplace settlement:
  shielded STRK → listing validation → NFT transfer → seller proceeds + 2.5% rake.
- [ ] Decide seller settlement mode: private output note vs explicit public payout.
- [ ] Minimize `Sold` event fields so it does not re-publish buyer/payment privacy.
- [ ] Design and team-implement a Portage anonymizer using public audited patterns.
- [ ] Add atomic rollback, stale-price, token allowlist, replay and stranded-fund tests.
- [ ] Independent review/audit before Mainnet.
- [ ] Wire marketplace Buy to `strk20InvokeTransaction([...])` and the audited helper.

## P0 — Fair hatch and reveal correctness

- [ ] Replace direct caller-chosen `hatch(seed)`; current design permits seed grinding.
- [ ] Implement commit-reveal, VRF or another manipulation-resistant entropy source.
- [ ] Bind commitment to player/action and protect against replay/front-running.
- [ ] Define reveal timeout, cancellation, refund and unrevealed-hatch behavior.
- [ ] Publish a verifier panel that recomputes species/rarity from final entropy.
- [ ] Add private STRK funding for hatch after marketplace settlement is proven.
- [ ] Keep pre-reveal state commitment-only; mint/publicize at reveal.

## P1 — Standard asset/economy quality

- [ ] Upgrade creature ownership to a standard Starknet NFT interface (SRC-5 +
  expected NFT metadata/transfer behavior).
- [ ] Implement actual STRK transfer/rake settlement; event-only accounting is not payment.
- [ ] Add marketplace approval/operator flow and protect listings from ownership changes.
- [ ] Add pagination/indexing for owner inventory, listings and activity.
- [ ] Add portal energy regeneration and costs to create the idle return loop.
- [ ] Add economy limits and emergency pause/upgrade policy before Mainnet.

## P1 — Game and demo UX

- [ ] First-session onboarding: connect → shield → portal → reveal → expedition → trade.
- [ ] Add privacy state labels: Public, Shielding, Private balance, Private payment,
  Public reveal.
- [ ] Add transaction timeline with two shield prompts, maturity and explorer links.
- [ ] Add error/retry states for wallet rejection, RPC timeout, screening and stale listing.
- [ ] Add sound toggle + hatch/evolution audio (respect reduced motion/sound settings).
- [ ] Add empty/loading/skeleton states and mobile wallet testing.
- [ ] Capture polished desktop and mobile screenshots for README/social/demo.

## P1 — Deployment and evidence

- [x] Fix env names consistently: `PORTAGE_RPC_URL` and
  `NEXT_PUBLIC_PORTAGE_ADDRESS`; remove stale Nightfall naming.
- [x] Configure browser/server Starknet RPCs via environment variables with safe public fallbacks.
- [ ] Deploy Portage to Sepolia and run hatch/expedition/evolve/list/buy smoke tests.
- [ ] Deploy reviewed Portage + anonymizer contracts to Mainnet.
- [ ] Run three low-value pool actions with a funded account after explicit approval.
- [ ] Immediately write hashes/addresses to `strk20.json` and push.
- [x] Deploy app to Vercel and verify the public production URL returns the Wave 3 UI.
- [ ] Verify the GitHub Website/deployment status and sprint hub refresh see all evidence.

## P1 — Three-minute demo script

- [ ] 0:00–0:20 — problem and Portage fantasy.
- [ ] 0:20–0:45 — connect Ready; explain public vs private.
- [ ] 0:45–1:15 — shield STRK and show pool transaction.
- [ ] 1:15–1:45 — open portal, fair commitment/reveal and rarity proof.
- [ ] 1:45–2:20 — expedition/evolution and creature detail.
- [ ] 2:20–2:45 — private marketplace payment + public NFT transfer boundary.
- [ ] 2:45–3:00 — Mainnet hashes, contracts, architecture and next step.
- [ ] Keep final cut at or under three minutes; captions and readable explorer zoom.

## P2 — Post-v0 differentiation

- [ ] Private payment requests/marketplace escrow for creature OTC trades.
- [ ] Selective disclosure receipt: prove a purchase without exposing unrelated balance.
- [ ] Track wallet-mediated sub-accounts for unlinkable game identities when shipped.
- [ ] Privacy-aware leaderboard/history using correct pool events, never relayer sender.
- [ ] Guilds, weekly raids, referral/quest rewards and anti-sybil design.
