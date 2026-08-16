# Portage.fun — Idle Creature-Collecting on Starknet

> Product target: a cozy idle creature-collecting game with manipulation-resistant,
> publicly verifiable hatches, ownable creatures and private STRK payment support on Starknet.
> The current prototype is not Mainnet-ready; §6–7 list the open security gates.

## 1. Vision

Collect games are a black box: the server decides which creature drops, can rig
the odds, and owns your collection. **Portage.fun** makes the RNG mathematically
verifiable on-chain and makes every creature a real asset you own, trade, and
take across the game.

**Target positioning after the entropy gate is complete:** "Provably-fair creature
collecting — every hatch is verified on-chain, and every creature is yours."

## 2. The fantasy

You are a **Porter** — a traveler who opens **portals** into wild biomes and
*portages* (carries) creatures back through them. Your creatures grow, evolve,
and go on expeditions for you. Your collection is a living caravan.

## 3. Core loop

1. **Open a Portal (hatch)** — spend energy/shards to open a portal and conjure
   a creature. Target flow: commit before entropy is known, then reveal a roll that
   anyone can recompute. The current caller-seeded prototype does not satisfy this yet.
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
| Ember | Fire | embers, cinders | **Cinderling** — a smoldering lizard |
| Creek | Water | rain, current | **Ripple** — a droplet frog |
| Grove | Nature | leaves, roots | **Bramble** — a leafy fox |
| Stone | Earth | rock, crystal | **Shard** — a geode bear |
| Mist | Shadow | fog, whisper | **Wisp** — a mist moth |
| Sky | Light | aurora, wind | **Aurora** — a feathered kite |

**Rarities:** Common · Uncommon · Rare · Epic · Legendary · Mythic.

## 5. Creature stats, exp & evolution (idle loop)

Every creature has stats derived from its **species + rarity + stage**, plus an
**exp** balance. This is the idle progression — inspired by the OpenTibia
monster model (`health`, `attack`, `defense`, `speed`, `exp`) and its exp curve.

### Stats

- **Base stats per species** (each biome has a profile):
  | Species | Health | Attack | Defense | Speed |
  |---|---|---|---|---|
  | Ember | 60 | 90 | 50 | 70 |
  | Creek | 90 | 60 | 60 | 60 |
  | Grove | 100 | 50 | 80 | 50 |
  | Stone | 80 | 60 | 100 | 40 |
  | Mist | 50 | 80 | 40 | 100 |
  | Sky | 60 | 70 | 50 | 90 |

- **Rarity multiplier:** Common ×1 · Uncommon ×1.3 · Rare ×1.6 · Epic ×2.0 ·
  Legendary ×2.5 · Mythic ×3.5.
- **Stage multiplier:** Hatchling ×0.5 · Adult ×1.0 · Legend ×2.0.
- `final = base_species × rarity_mult × stage_mult` (integer math on-chain).

### Exp & evolution

- Expeditions earn exp over time (idle); exp is checkpointed on-chain via
  `gain_exp(token_id, amount)`.
- Level thresholds drive **evolution** (`evolve(token_id)`):
  - Hatchling → Adult at **100 exp**
  - Adult → Legend at **500 exp**
- Evolving upgrades the stage (and thus the stats via the stage multiplier).
- `expYield` is a creature stat (how much exp it earns per expedition tick),
  scaled by rarity so rarer creatures progress faster.

## 6. Target fair RNG (the on-chain core)

- Target design: a **hatch** commits before entropy is known, then reveals a creature
  deterministically with replay/front-running protection and timeout/refund behavior.
- The roll, fixed rarity table and revealed result remain on-chain so anyone can recompute them.
- **Current security gate:** the prototype accepts a caller-provided seed and is grindable;
  it must not be called manipulation-resistant or deployed to Mainnet before commit/reveal or VRF.
- **Privacy (STRK20):** shielded STRK can make the payment leg private. Revealed creature
  metadata and NFT `owner_of` remain public; STRK20 does not hide NFT ownership.

## 7. Marketplace + economy

- Creatures are NFTs; the target settlement transfers STRK on-chain with a small **rake**.
  The current prototype records marketplace accounting without moving STRK, so buying stays
  disabled until real settlement and the reviewed Portage anonymizer are deployed.
- **Portal energy** and **evolution mats** are earned idle, bought, or won in raids.
- Rare creatures are genuinely scarce: the rarity table is fixed on-chain, so
  neither the team nor anyone else can print legendaries.

## 8. Identity — visual direction

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

## 9. Components (repo)

```
├── contracts/          # Cairo: hatch RNG, creatures (NFT), marketplace, energy
├── app/                # Next.js client: caravan, portal, marketplace
├── scripts/            # art pipeline (gen-assets.mjs) + deploy
├── strk20.json         # hackathon scoring
└── docs/               # SPEC + guides
```

## 10. v0 scope (hackathon)

- [ ] On-chain **hatch** with provably-fair RNG (commit seed → reveal creature).
- [ ] Creature NFT (mint, own, transfer) with rarity + species metadata.
- [ ] Idle **expedition** loop (off-chain progress, on-chain checkpoint).
- [ ] Marketplace: list / buy / trade (rake on settlement).
- [ ] Pixel-art creatures for at least 2 biomes × 3 stages.
- [ ] 3+ mainnet txs in `strk20.json` + demo URL + video.

## 11. Definition of Done (v0)

- A player can **open a portal**, **hatch a verifiably-fair creature**, send it
  on an **expedition**, and **trade it** — on mainnet.
- Rarity table fixed on-chain and publicly verifiable.
- Live demo + 3-min video + 3 mainnet txs in `strk20.json`.
