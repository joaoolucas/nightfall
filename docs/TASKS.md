# Portage.fun — task list (hackathon)

North star: `docs/SPEC.md` §9–10. Non-stop loop plan.

Sprint-specific privacy, submission, Mainnet evidence, security and demo tasks:
**[`docs/SPRINT_TASKS.md`](SPRINT_TASKS.md)**. Approved integration work must
follow **[`STRK20_INTEGRATION_PLAN.md`](../STRK20_INTEGRATION_PLAN.md)**.

## Locked decisions

- All content in **English**.
- Idle creature-collecting (not Werewolf).
- Provably-fair on-chain hatch (committed-seed deterministic RNG).
- Creatures = on-chain assets (NFT); marketplace with rake.
- 6 biomes: Ember, Creek, Grove, Stone, Mist, Sky.
- Rarities: Common · Uncommon · Rare · Epic · Legendary · Mythic.

## Wave 1 — Foundations (file-disjoint, parallel)

### T1 — Contracts: Portage core (Cairo)
- [x] `hatch(seed)` — committed-seed deterministic RNG → creature (species + rarity).
- [x] Fixed rarity table on-chain (public, verifiable).
- [x] Creature NFT: mint, owner_of, transfer.
- [x] Species metadata (biome, stage) readable on-chain.
- [x] Marketplace: list / buy / cancel with protocol rake.
- [x] Creature stats (health/attack/defense/speed) + exp + evolve (100/500 thresholds).
- [x] Cairo tests: 23 tests (determinism, rarity, transfer, buy/sell, stats, evolve, reverts).

### T2 — App: Portage client (Next.js)
- [x] Rebrand page to Portage.fun.
- [x] Caravan UI: creature lineup cards (with stats + exp bar).
- [x] Portal UI: hatch button + reveal + on-chain proof badge.
- [x] Marketplace UI: list/buy grid with rarity borders.
- [x] Domain model (Species, Rarity, Stage, stats) + contract client (read/write).
- [x] Evolve button (on-chain, owner + threshold-gated).

### T3 — Art: creature sprites (PixelLab)
- [x] Rewrite `scripts/gen-assets.mjs` manifest for Portage creatures.
- [x] Generate 6 base creatures (1 per biome) — pixel art, transparent bg.
- [x] Generate evolution stages (Hatchling → Adult → Legend) for 2 biomes.
- [x] Background (portal biome scene).

### T4 — Docs
- [x] README (what/why/how-to-run) — in English.
- [x] Fair RNG + marketplace + stats/exp notes (SPEC §5–7).

## Wave 2 — Core loop

- [x] App talks to deployed contract (hatch + read creatures) — client + hook wired.
- [x] Marketplace buy/sell path via wallet.
- [x] Idle expedition loop (cooldown-gated `expedition` on-chain + button in UI).
- [x] Stats + exp/evolution (SPEC §5) in contract and app.

## Wave 3 — STRK20 + demo

- [x] Registry updated to Portage.fun (hub PR #70, applied).
- [x] Game-native STRK20 Phase 1 implemented headlessly (Ready manual verification pending).
- [x] Guarded Sepolia/Mainnet deploy script + chain checks + deployment evidence output.
- [x] Strict `strk20.json` readiness/final/online validator.
- [x] Honest privacy/fairness/settlement copy + deploy runbook + <=3-min demo script.
- [x] Production app deployed and verified at `https://portage-topaz.vercel.app`.
- [ ] Verify shield/private-send/unshield manually with Ready on testnet.
- [ ] Replace caller-seeded hatch with manipulation-resistant commit/reveal or VRF.
- [ ] Implement/review real STRK marketplace settlement and Portage anonymizer.
- [ ] Deploy to Sepolia with a funded deployer and run smoke tests.
- [ ] Deploy reviewed contracts to Mainnet after explicit execution-time approval.
- [ ] Add 3+ verified Mainnet pool transactions to `strk20.json`.
- [x] Add the verified production demo URL to `strk20.json`.
- [ ] Record/publish the <=3-min video and pass final online validation.

## Definition of Done (v0)

A player can open a portal, hatch a verifiably-fair creature, send it on an
expedition, and trade it — on mainnet. Rarity table fixed and public.
