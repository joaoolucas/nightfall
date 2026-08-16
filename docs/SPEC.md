# Portage.fun — Idle Creature-Collecting on Starknet

> A cozy idle creature-collecting game with **provably-fair on-chain hatches**,
> **ownable, tradable creatures**, and a **player-driven marketplace** — built on
> STRK20 privacy on Starknet.

## 1. Vision

Collect games are a black box: the server decides which creature drops, can rig
the odds, and owns your collection. **Portage.fun** makes the RNG mathematically
verifiable on-chain and makes every creature a real asset you own, trade, and
take across the game.

**Positioning:** "Provably-fair creature collecting — every hatch is verified
on-chain, and every creature is yours."

## 2. The fantasy

You are a **Porter** — a traveler who opens **portals** into wild biomes and
*portages* (carries) creatures back through them. Your creatures grow, evolve,
and go on expeditions for you. Your collection is a living caravan.

## 3. Core loop

1. **Open a Portal (hatch)** — spend energy/shards to open a portal and conjure
   a creature. The result is a **provably-fair RNG roll committed on-chain**: you
   can verify the rarity that dropped was mathematically fair.
2. **Expeditions (idle)** — creatures explore biomes over real time and return
   with resources (shards, evolution mats). Progress runs off-chain and is
   check-pointed on-chain.
3. **Evolve** — spend resources to evolve a creature through 3 stages
   (Hatchling → Adult → Legend). Evolution changes art + stats and can change rarity.
4. **Trade** — creatures are on-chain assets. Trade, list, and buy on the
   marketplace; rarity and provenance are verifiable.
5. **Gather** — guilds, weekly raids, and a leaderboard turn a solo idle loop
   into a community game.

## 4. Creatures — original, authored IP

No Pokémon clones. Creatures are original and tied to **6 biomes**, each with a
distinct element and silhouette language.

| Biome | Element | Theme | Example creature |
|---|---|---|---|
| Ember | Fire | embers, cinders | **Brazalho** — a smoldering lizard |
| Creek | Water | rain, current | **Gotilho** — a droplet frog |
| Grove | Nature | leaves, roots | **Folharo** — a leafy fox |
| Stone | Earth | rock, crystal | **Cristalino** — a geode bear |
| Mist | Shadow | fog, whisper | **Nebulino** — a wisp moth |
| Sky | Light | aurora, wind | **Aurino** — a feathered kite |

**Rarities:** Common · Uncommon · Rare · Epic · Legendary · Mythic.

## 5. Provably-fair RNG (the on-chain core)

- A **hatch** commits a seed, then reveals a creature deterministically
  (Fisher–Yates over the species pool, Poseidon-hashed from the seed + block).
- The roll, rarity table, and result are all on-chain — a player (or anyone) can
  recompute and verify the hatch was fair.
- **Privacy (STRK20):** ownership and trades move through shielded transfers;
  *what* you hatch can stay private until you choose to reveal it.

This reuses the exact proving pattern already built in the Nightfall engine
(committed-seed deal + deterministic shuffle), repurposed for creature rolls.

## 6. Marketplace + economy

- Creatures are NFTs; trades settle on-chain with a small **rake** to the protocol.
- **Portal energy** and **evolution mats** are earned idle, bought, or won in raids.
- Rare creatures are genuinely scarce: the rarity table is fixed on-chain, so
  neither the team nor anyone else can print legendaries.

## 7. Identity — visual direction

**Name:** Portage.fun — from *portage*, carrying a load between places (the
journey between biomes).

**Look & feel:**
- **Style:** pixel art (reuses the existing PixelLab pipeline).
- **Palette:** deep portal violet/indigo (`#3b2a63`, `#6d4fc2`), caravan amber
  (`#f0a93a`), biome greens (`#3e7d5a`), night sky (`#14102a`).
- **Tone:** cozy, collectible, "adventure scrapbook" — warm UI, creature-forward
  cards, soft glow around portals.
- **Logo concept:** a round portal ring with a small creature silhouette
  stepping through.

**UI concepts:**
- Home = your **caravan** (creature lineup) + an active portal.
- Hatch screen = the portal opening, with the reveal + on-chain proof badge.
- Marketplace = grid of creature cards with rarity borders.

## 8. Components (repo)

```
├── contracts/          # Cairo: hatch RNG, creatures (NFT), marketplace, energy
├── app/                # Next.js client: caravan, portal, marketplace
├── scripts/            # art pipeline (gen-assets.mjs) + deploy
├── strk20.json         # hackathon scoring
└── docs/               # SPEC + guides
```

## 9. v0 scope (hackathon)

- [ ] On-chain **hatch** with provably-fair RNG (commit seed → reveal creature).
- [ ] Creature NFT (mint, own, transfer) with rarity + species metadata.
- [ ] Idle **expedition** loop (off-chain progress, on-chain checkpoint).
- [ ] Marketplace: list / buy / trade (rake on settlement).
- [ ] Pixel-art creatures for at least 2 biomes × 3 stages.
- [ ] 3+ mainnet txs in `strk20.json` + demo URL + video.

## 10. Definition of Done (v0)

- A player can **open a portal**, **hatch a verifiably-fair creature**, send it
  on an **expedition**, and **trade it** — on mainnet.
- Rarity table fixed on-chain and publicly verifiable.
- Live demo + 3-min video + 3 mainnet txs in `strk20.json`.
