# Portage.fun — "beautiful game" task list

Goal: turn the functional v0 into a **polished, beautiful** idle
creature-collector. Organized by impact → effort. All English.

## Wave 4 — Visual identity (foundation)

- [ ] **Logo** — a round portal ring with a creature silhouette stepping through (PixelLab or SVG).
- [ ] **Favicon / app icon** — replace the starter icon.
- [ ] **Typography** — a cozy/pixel display font (e.g. Silkscreen / VT323 / Press Start 2P) + body font.
- [ ] **Biome backgrounds** — one portal background per biome (Ember/Creek/Grove/Stone/Mist/Sky), matching the creature palette.
- [ ] **Element icons** — 6 small glyphs (fire/water/nature/earth/shadow/light) for badges.

## Wave 5 — Complete the creatures (content)

- [ ] Sprites for **all 6 species × 3 stages** (currently only Ember + Creek have stages):
  - [ ] Bramble (Grove) — hatchling/adult/legend
  - [ ] Shard (Stone) — hatchling/adult/legend
  - [ ] Wisp (Mist) — hatchling/adult/legend
  - [ ] Aurora (Sky) — hatchling/adult/legend

## Wave 6 — Card & UI polish

- [ ] CreatureCard renders the **real sprite** (not placeholder) + rarity glow ring + element badge.
- [ ] **Rarity effects** — colored glow/sparkle by rarity (Common→Mythic).
- [ ] **Exp bar** — smooth, with a fill animation and threshold label.
- [ ] **Creature detail modal** — full stats, species lore, stage progression.
- [ ] **Responsive** — mobile-first grid (most players are on phones).

## Wave 7 — Game feel & animation

- [ ] **Portal hatch animation** — portal swirls open → creature revealed (suspense beat).
- [ ] **Reveal** — rarity flash/shake before the card settles.
- [ ] **Evolution** — sparkle burst when a creature evolves.
- [ ] **Micro-interactions** — hover lift, press scale, card flip.
- [ ] (stretch) **Sound** — soft chime on hatch/evolve.

## Wave 8 — Mechanics that make it a game

- [ ] **Portal energy** — hatch costs energy; energy regenerates over time (idle loop).
- [ ] **Leaderboard** — top collectors / strongest creatures.
- [ ] **Onboarding** — first-open walkthrough ("open a portal, hatch, send on expedition").
- [ ] (stretch) **Guilds / weekly raids**.

## Wave 9 — STRK20 privacy (the moat)

- [ ] Private hatch — what you conjure stays private until revealed (encrypted notes).
- [ ] Private trades — marketplace listings through the pool.
- [ ] Viewing keys for reveal/audit.

## Wave 10 — Demo readiness

- [ ] Deploy (Sepolia → Mainnet) + 3 mainnet txs in `strk20.json`.
- [ ] Vercel demo URL + 3-min video.
- [ ] README screenshots.

## Order of attack (tonight)

1. **Wave 4+5 in parallel** (art is file-disjoint from app) — logo, fonts, biome
   backgrounds, element icons, and the 12 missing creature sprites.
2. **Wave 6** — wire real sprites + rarity effects + detail modal + responsive.
3. **Wave 7** — hatch/evolve animations.
4. **Wave 8** — portal energy (small contract + UI).
5. **Wave 9** — STRK20 privacy (the scoring core, do as much as time allows).
6. **Wave 10** — deploy + demo.
