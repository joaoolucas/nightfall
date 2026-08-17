# Portage local idle game

Portage now includes a local-first, playable idle RPG loop. Blockchain features are intentionally outside this game-mode iteration.

## References and original direction

The interface hierarchy was informed by browser idle RPGs such as [PokéIdle](https://pokeidle.io/) and the readable combat/progression model associated with [Tibia](https://www.tibia.com/abouttibia/). World architecture research also covered [BrowserQuest](https://github.com/mozilla/BrowserQuest), [Reldens](https://github.com/damian-pastorini/reldens) and Phaser's React bridge patterns. Portage retains original creatures, biomes, names, models, art and economy.

Patterns used:

- party and inventory remain visible around a central top-down world;
- tile movement with WASD, arrow keys or click-to-move;
- camera follow, solid terrain/props, depth-sorted entities and a minimap;
- authored outposts with NPCs, structures, ambient Porters and spawn regions;
- auto-roam pathfinding from the outpost to live creature encounters;
- automatic real-time combat only after the player reaches the target;
- level-gated routes, escalating enemies and every-tenth-victory Wardens;
- practical automations such as auto-tonic and route advancement;
- offline catch-up, loot logs, permanent training and creature evolution.

No third-party characters, branding, names or assets are used.

## Playable loop

1. Enter **Hunt** at a populated biome outpost with a three-creature caravan.
2. Walk manually or let auto-roam pathfind through the tile world to a marked spawn.
3. Enter spatial combat only when the Porter reaches an adjacent tile.
4. Deal deterministic party DPS while the active enemy damages caravan vitality.
5. Earn gold, shards and shared EXP after each victory.
6. Watch the next creature respawn in a different region and travel to it.
7. Defeat a biome Warden every ten victories for crystals and possible relics.
8. Spend gold on permanent Attack, Armor and Fortune training.
9. Reconfigure the party, evolve creatures and unlock harder routes.
10. Leave auto-roam enabled, then return after closing or backgrounding the game to collect up to eight hours of safe offline progress. Manual mode never fabricates unseen encounters.

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
- `app/src/utils/world-engine.ts` — deterministic biome maps, collision grid, props, spawn regions and A* pathfinding.
- `app/src/app/components/portage/useIdleGame.ts` — timers, browser persistence and lifecycle integration.
- `app/src/app/components/portage/IdleWorld.tsx` — canvas renderer, camera, movement, animated Porter models, ambient NPCs, minimap and spatial encounter bridge.
- `app/src/app/components/portage/IdleGameViews.tsx` — hunt, caravan, map, training, codex and settings views.
- `app/src/utils/idle-game.test.ts` — deterministic engine and regression tests.

Run:

```bash
cd app
npm run test:game
npm run build
```
