# Portage local idle game

Portage now includes a local-first, playable idle RPG loop. Blockchain features are intentionally outside this game-mode iteration.

## References and original direction

The interface hierarchy was informed by browser idle RPGs such as [PokéIdle](https://pokeidle.io/) and the readable combat/progression model associated with [Tibia](https://www.tibia.com/abouttibia/), while retaining Portage's original creatures, biomes, names, art and economy.

Patterns used:

- party and inventory remain visible around a central hunt;
- automatic real-time combat with an explicit camp/resume control;
- level-gated routes, escalating enemies and every-tenth-victory Wardens;
- practical automations such as auto-tonic and route advancement;
- offline catch-up, loot logs, permanent training and creature evolution.

No third-party characters, branding, names or assets are used.

## Playable loop

1. Enter **Hunt** with a three-creature caravan.
2. Deal deterministic party DPS while the active enemy damages caravan vitality.
3. Earn gold, shards and shared EXP after each victory.
4. Defeat a biome Warden every ten victories for crystals and possible relics.
5. Spend gold on permanent Attack, Armor and Fortune training.
6. Reconfigure the three-creature party and evolve eligible creatures with crystals.
7. Unlock harder routes with Porter levels.
8. Return after closing or backgrounding the game to collect up to eight hours of safe offline progress.

## Safety and fairness rules

- Enemy difficulty scales with bounded Porter mastery, never an unlimited kill counter.
- Offline rewards use the same party DPS and enemy damage assumptions as live combat.
- An offline party that cannot win safely makes camp instead of receiving fabricated victories.
- Successful offline returns preserve attrition and guarantee enough vitality to avoid an immediate unavoidable death.
- A defeat has a five-second recovery and a small, bounded gold loss.
- Three consecutive defeats make camp on the first route or retreat to a safer route elsewhere.
- Party changes, evolution and route changes preserve vitality ratio; they cannot be used as free healing.
- Combat RNG uses a saved deterministic LCG seed.

## Persistence

Save key: `portage-idle-save-v1`.

The client saves every three seconds, before unload and when the tab becomes hidden. Returning to a visible tab settles elapsed time. Saves have an explicit version and corrupt core numeric values fall back to safe defaults. If browser storage is unavailable, the HUD reports `SAVE UNAVAILABLE` rather than claiming progress is safe.

## Architecture

- `app/src/utils/idle-game.ts` — pure game state, combat, progression, loot, routes, offline simulation and save hydration.
- `app/src/app/components/portage/useIdleGame.ts` — timers, browser persistence and lifecycle integration.
- `app/src/app/components/portage/IdleGameViews.tsx` — hunt, caravan, map, training, codex and settings views.
- `app/src/utils/idle-game.test.ts` — deterministic engine and regression tests.

Run:

```bash
cd app
npm run test:game
npm run build
```
