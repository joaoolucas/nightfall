# Portage.fun — task list (hackathon)

North star: `docs/SPEC.md` §9–10. Non-stop loop plan.

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
- [ ] Idle expedition loop (off-chain progress + on-chain checkpoint via gain_exp).

## Wave 3 — STRK20 + demo

- [x] Registry updated to Portage.fun (hub PR #70, applied).
- [ ] Deploy to Sepolia/Mainnet (scripts/deploy.mjs).
- [ ] 3+ mainnet txs in `strk20.json`.
- [ ] Demo URL + 3-min video.

## Definition of Done (v0)

A player can open a portal, hatch a verifiably-fair creature, send it on an
expedition, and trade it — on mainnet. Rarity table fixed and public.
