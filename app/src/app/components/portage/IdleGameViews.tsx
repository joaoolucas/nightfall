"use client";

import Image from "next/image";
import {
  IDLE_ZONES,
  creatureCombatStats,
  formatDuration,
  partyDps,
  partyMaxHp,
  upgradeCost,
  xpForCreatureLevel,
  xpForPlayerLevel,
  zoneFor,
  zoneIndex,
  zoneProgress,
  type UpgradeKey,
} from "@/utils/idle-game";
import { biomeBackgroundPath, creatureSpritePath, elementIconPath, RARITY, rarityLabel, speciesLabel, stageLabel } from "@/utils/portage";
import type { IdleGameController } from "./useIdleGame";
import IdleWorld from "./IdleWorld";
import styles from "./idle-game.module.css";

interface ViewProps { controller: IdleGameController }

function Bar({ value, max, tone = "green", label = "Progress" }: { value: number; max: number; tone?: "green" | "red" | "blue" | "gold"; label?: string }) {
  const width = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(Math.max(0, value))} className={`${styles.bar} ${styles[`bar_${tone}`]}`}><i style={{ width: `${width}%` }} /></span>;
}

export function IdleHunt({ controller }: ViewProps) {
  const { game } = controller;
  const zone = zoneFor(game.zoneId);
  const maxHp = partyMaxHp(game);
  const dps = partyDps(game);
  const killSeconds = Math.max(1, game.enemy.hp / dps);

  return (
    <section className={styles.huntView}>
      <div className={styles.huntToolbar}>
        <div><span>ACTIVE HUNT</span><b>{zone.name}</b><small>{zone.subtitle}</small></div>
        <div className={styles.huntStats}>
          <span><b>{dps.toFixed(1)}</b><small>DPS</small></span>
          <span><b>~{killSeconds.toFixed(1)}s</b><small>NEXT KILL</small></span>
          <span><b>{game.zoneKills}</b><small>ZONE KILLS</small></span>
        </div>
      </div>

      <div className={styles.worldStage}>
        <div className={styles.bossTrack}>
          <span>WARDEN</span>
          <div>{Array.from({ length: 10 }, (_, index) => <i key={index} className={index < zoneProgress(game) ? styles.trackDone : ""} />)}</div>
          <b>{zoneProgress(game)}/10</b>
        </div>
        <IdleWorld controller={controller} />
        {!game.running ? <div className={styles.camped}><b>CARAVAN CAMPED</b><span>Move freely or resume auto-hunt when ready.</span></div> : game.recoveringUntil > game.lastUpdatedAt ? <div className={styles.camped}><b>RECOVERING</b><span>The caravan will return to battle in a few seconds.</span></div> : null}
      </div>

      <div className={styles.huntActions}>
        <button type="button" className={game.running ? styles.pauseButton : styles.huntButton} onClick={controller.toggleRunning}>{game.running ? "Ⅱ Make camp" : "▶ Resume hunt"}</button>
        <button type="button" onClick={controller.drinkTonic} disabled={game.inventory.tonics <= 0 || game.partyHp >= maxHp}>⚗ Use tonic ({game.inventory.tonics})</button>
        <button type="button" onClick={() => controller.selectZone(IDLE_ZONES[Math.max(0, zoneIndex(game.zoneId) - 1)].id)} disabled={zoneIndex(game.zoneId) === 0}>← Previous route</button>
        <button type="button" onClick={() => controller.selectZone(IDLE_ZONES[Math.min(IDLE_ZONES.length - 1, zoneIndex(game.zoneId) + 1)].id)} disabled={zoneIndex(game.zoneId) === IDLE_ZONES.length - 1 || game.playerLevel < IDLE_ZONES[zoneIndex(game.zoneId) + 1].requiredLevel}>Next route →</button>
      </div>

      {controller.offlineReport ? (
        <div className={styles.offlineOverlay} role="dialog" aria-modal="true" aria-labelledby="offline-title" onKeyDown={(event) => { if (event.key === "Escape") controller.dismissOfflineReport(); }}>
          <div className={styles.offlineCard}>
            <span>WELCOME BACK, PORTER</span>
            <h2 id="offline-title">Your caravan kept hunting.</h2>
            <p>Time away: <b>{formatDuration(controller.offlineReport.seconds)}</b></p>
            <div><b>{controller.offlineReport.kills}<small>Victories</small></b><b>+{controller.offlineReport.gold}<small>Gold</small></b><b>+{controller.offlineReport.xp}<small>EXP</small></b><b>+{controller.offlineReport.shards}<small>Shards</small></b></div>
            <button type="button" autoFocus onClick={controller.dismissOfflineReport}>Collect and continue</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function IdleRoster({ controller }: ViewProps) {
  const { game } = controller;
  return (
    <section className={styles.panelView}>
      <header><span>CARAVAN MANAGEMENT</span><h2>Choose who carries the journey.</h2><p>Up to three creatures fight together. Every active member shares combat EXP.</p></header>
      <div className={styles.rosterGrid}>
        {game.creatures.map((creature) => {
          const active = game.activeIds.includes(creature.id);
          const stats = creatureCombatStats(creature);
          const xpNeed = xpForCreatureLevel(creature.level);
          const evolveLevel = creature.stage === "hatchling" ? 10 : creature.stage === "adult" ? 25 : null;
          const evolveCost = creature.stage === "hatchling" ? 3 : 8;
          const canEvolve = evolveLevel !== null && creature.level >= evolveLevel && game.inventory.crystals >= evolveCost;
          return (
            <article key={creature.id} className={`${styles.rosterCard} ${active ? styles.rosterActive : ""}`} style={{ "--rarity": RARITY[creature.rarity].borderColor } as React.CSSProperties}>
              <div className={styles.rosterArt}><Image src={creatureSpritePath(creature.species, creature.stage)} alt={creature.name} width={124} height={124} /><Image src={elementIconPath(creature.species)} alt="" width={25} height={25} /></div>
              <div className={styles.rosterName}><span>{rarityLabel(creature.rarity)} · {stageLabel(creature.stage)}</span><h3>{creature.name}</h3><small>{speciesLabel(creature.species)} companion</small></div>
              <div className={styles.levelRow}><b>LV. {creature.level}</b><span>{creature.xp}/{xpNeed} EXP</span></div>
              <Bar value={creature.xp} max={xpNeed} tone="blue" label={`${creature.name} experience`} />
              <div className={styles.miniStats}><span>♥ {stats.health}</span><span>⚔ {stats.attack}</span><span>◆ {stats.defense}</span><span>➶ {stats.speed}</span></div>
              <div className={styles.rosterButtons}>
                <button type="button" onClick={() => controller.toggleParty(creature.id)} disabled={!active && game.activeIds.length >= 3}>{active ? "Remove" : "Add to party"}</button>
                {evolveLevel !== null ? <button type="button" onClick={() => controller.evolve(creature.id)} disabled={!canEvolve}>Evolve · {evolveCost} ◈</button> : <button type="button" disabled>Final form</button>}
              </div>
              {evolveLevel !== null && creature.level < evolveLevel ? <small className={styles.requirement}>Evolution unlocks at level {evolveLevel}</small> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function IdleMap({ controller }: ViewProps) {
  const { game } = controller;
  return (
    <section className={styles.panelView}>
      <header><span>THE PORTAGE ROAD</span><h2>Six biomes. One growing caravan.</h2><p>Defeat wardens and gain Porter levels to reach harder, richer routes.</p></header>
      <div className={styles.mapRoute}>
        {IDLE_ZONES.map((zone, index) => {
          const unlocked = game.playerLevel >= zone.requiredLevel;
          const active = game.zoneId === zone.id;
          return (
            <article key={zone.id} className={`${styles.zoneCard} ${active ? styles.zoneActive : ""} ${!unlocked ? styles.zoneLocked : ""}`} style={{ backgroundImage: `linear-gradient(rgba(18,13,35,.36), rgba(18,13,35,.93)), url(${biomeBackgroundPath(zone.id)})` }}>
              <div><Image src={elementIconPath(zone.id)} alt="" width={34} height={34} /><span>ROUTE {String(index + 1).padStart(2, "0")}</span></div>
              <h3>{zone.name}</h3><p>{zone.subtitle}</p>
              <dl><div><dt>Enemy level</dt><dd>{zone.baseEnemyLevel}+</dd></div><div><dt>Gold / victory</dt><dd>{zone.rewardGold}+</dd></div><div><dt>EXP / victory</dt><dd>{zone.rewardXp}+</dd></div></dl>
              <button type="button" disabled={!unlocked} onClick={() => controller.selectZone(zone.id)}>{active ? "Reset this hunt" : unlocked ? "Travel here" : `Unlocks at level ${zone.requiredLevel}`}</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const UPGRADE_COPY: Record<UpgradeKey, { icon: string; name: string; copy: string; effect: string }> = {
  attack: { icon: "⚔", name: "Weapon drills", copy: "Practice coordinated strikes around the campfire.", effect: "+14% party DPS per rank" },
  armor: { icon: "◆", name: "Caravan wards", copy: "Reinforce packs, armor and emergency shelter.", effect: "+12% maximum vitality per rank" },
  fortune: { icon: "✦", name: "Trailcraft", copy: "Read tracks and find richer caches after battle.", effect: "+12% gold and better drops" },
};

export function IdleUpgrades({ controller }: ViewProps) {
  const { game } = controller;
  return (
    <section className={styles.panelView}>
      <header><span>CAMP TRAINING</span><h2>Invest today. Hunt forever.</h2><p>Permanent local upgrades affect online and offline progress.</p></header>
      <div className={styles.upgradeGrid}>
        {(Object.keys(UPGRADE_COPY) as UpgradeKey[]).map((key) => {
          const item = UPGRADE_COPY[key];
          const cost = upgradeCost(game, key);
          return <article key={key}><i>{item.icon}</i><span>RANK {game.upgrades[key]}</span><h3>{item.name}</h3><p>{item.copy}</p><b>{item.effect}</b><button type="button" disabled={game.gold < cost} onClick={() => controller.purchaseUpgrade(key)}>Train · {cost} gold</button></article>;
        })}
      </div>
      <div className={styles.powerSummary}><span>Current hunting power</span><b>{partyDps(game).toFixed(1)} DPS</b><b>{partyMaxHp(game)} VITALITY</b><b>{Math.round((1 + game.upgrades.fortune * .12) * 100)}% GOLD</b></div>
    </section>
  );
}

export function IdleCodex({ controller }: ViewProps) {
  const { game } = controller;
  return (
    <section className={styles.panelView}>
      <header><span>WAYFARER CODEX</span><h2>What the caravan has learned.</h2><p>Creature families and wardens discovered across every route.</p></header>
      <div className={styles.codexGrid}>
        {IDLE_ZONES.map((zone) => {
          const discovered = game.playerLevel >= zone.requiredLevel;
          return <article key={zone.id} className={!discovered ? styles.codexUnknown : ""}><Image src={creatureSpritePath(zone.id, "adult")} alt="" width={110} height={110} /><div><span>{discovered ? SPECIES_LABEL(zone.id) : "UNDISCOVERED"}</span><h3>{discovered ? zone.enemyNames.join(" · ") : "??? · ??? · ???"}</h3><p>{discovered ? `${zone.name} warden appears every tenth victory.` : `Reach Porter level ${zone.requiredLevel} to reveal this entry.`}</p></div></article>;
        })}
      </div>
    </section>
  );
}

function SPECIES_LABEL(species: (typeof IDLE_ZONES)[number]["id"]): string {
  return `${speciesLabel(species)} fauna`;
}

export function IdleSettings({ controller }: ViewProps) {
  const { game } = controller;
  return (
    <section className={styles.panelView}>
      <header><span>LOCAL SAVE</span><h2>Your road, on this device.</h2><p>Portage currently stores progress only in this browser. No account or wallet is needed.</p></header>
      <div className={styles.settingsCard}>
        <div><b>Save format</b><span>Portage idle v{game.version}</span></div>
        <div><b>Accounted hunt time</b><span>{formatDuration(game.totalPlaySeconds)}</span></div>
        <div><b>Total victories</b><span>{game.kills}</span></div>
        <div><b>Offline limit</b><span>8 hours</span></div>
        <hr />
        <button type="button" className={styles.dangerButton} onClick={() => { if (window.confirm("Reset all local Portage progress? This cannot be undone.")) controller.reset(); }}>Reset local adventure</button>
      </div>
    </section>
  );
}

export function PlayerProgress({ controller }: ViewProps) {
  const { game } = controller;
  return <><div className={styles.playerXp}><span>PORTER LV. {game.playerLevel}</span><b>{game.playerXp} / {xpForPlayerLevel(game.playerLevel)} EXP</b></div><Bar value={game.playerXp} max={xpForPlayerLevel(game.playerLevel)} tone="blue" label="Porter experience" /></>;
}
