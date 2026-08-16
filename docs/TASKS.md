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
- [ ] `hatch(seed)` — committed-seed deterministic RNG → creature (species + rarity).
- [ ] Fixed rarity table on-chain (public, verifiable).
- [ ] Creature NFT: mint, owner_of, transfer.
- [ ] Species metadata (biome, stage) readable on-chain.
- [ ] Marketplace: list / buy / cancel with protocol rake.
- [ ] Cairo tests: hatch determinism, rarity distribution, transfer, buy/sell.

### T2 — App: Portage client (Next.js)
- [ ] Rebrand page to Portage.fun (done: hero + wallet).
- [ ] Caravan UI: creature lineup cards.
- [ ] Portal UI: hatch button + reveal + on-chain proof badge.
- [ ] Marketplace UI: list/buy grid with rarity borders.
- [ ] Domain model (Species, Rarity, Stage) + contract client (read/write).

### T3 — Art: creature sprites (PixelLab)
- [ ] Rewrite `scripts/gen-assets.mjs` manifest for Portage creatures.
- [ ] Generate 6 base creatures (1 per biome) — pixel art, transparent bg.
- [ ] Generate evolution stages (Hatchling → Adult → Legend) for 2 biomes.
- [ ] Background (portal biome scene).

### T4 — Docs
- [ ] README (what/why/how-to-run) — in English.
- [ ] Fair RNG + marketplace notes.

## Wave 2 — Core loop

- [ ] App talks to deployed contract (hatch + read creatures).
- [ ] Marketplace buy/sell path via wallet.
- [ ] Idle expedition loop (off-chain progress + on-chain checkpoint).

## Wave 3 — STRK20 + demo

- [ ] Deploy to Sepolia/Mainnet (scripts/deploy.mjs).
- [ ] 3+ mainnet txs in `strk20.json`.
- [ ] Demo URL + 3-min video.
- [ ] Re-register on the hackathon hub with the new pitch.

## Definition of Done (v0)

A player can open a portal, hatch a verifiably-fair creature, send it on an
expedition, and trade it — on mainnet. Rarity table fixed and public.
