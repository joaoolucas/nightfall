"use client";

import Image from "next/image";
import { useState } from "react";
import { activeCreatures, partyMaxHp, xpForCreatureLevel, zoneFor, zoneIndex } from "@/utils/idle-game";
import { creatureSpritePath, rarityLabel, stageLabel } from "@/utils/portage";
import {
  IdleCodex,
  IdleHunt,
  IdleMap,
  IdleRoster,
  IdleSettings,
  IdleUpgrades,
  PlayerProgress,
} from "./IdleGameViews";
import { useIdleGame } from "./useIdleGame";
import ui from "../../uni.module.css";
import styles from "./game-shell.module.css";

type View = "hunt" | "caravan" | "map" | "upgrades" | "codex" | "settings";

const NAV: { id: View; icon: string; label: string }[] = [
  { id: "hunt", icon: "⚔", label: "Hunt" },
  { id: "caravan", icon: "▦", label: "Caravan" },
  { id: "map", icon: "⌁", label: "World Map" },
  { id: "upgrades", icon: "↑", label: "Training" },
  { id: "codex", icon: "◇", label: "Codex" },
  { id: "settings", icon: "◆", label: "Save" },
];

function Kickoff({ onStart }: { onStart: () => void }) {
  return (
    <main className={styles.kickoff}>
      <div className={styles.kickoffStars} aria-hidden />
      <section className={styles.kickoffCard}>
        <div className={styles.kickoffLogoWrap}>
          <Image src="/game-assets/brand/logo.png" alt="Portage.fun" width={112} height={112} className={styles.pixelImage} priority />
        </div>
        <p className={styles.kickoffEyebrow}>AN IDLE CARAVAN RPG</p>
        <h1 className={styles.kickoffTitle}>Carry wonder<br /><span>through the wilds.</span></h1>
        <p className={styles.kickoffCopy}>
          Walk through living pixel biomes, assemble three companions, track wild creatures, defeat Wardens and return to the rewards your caravan earned while away.
        </p>
        <div className={styles.kickoffSteps}>
          <div><b>01</b><span>Explore the world</span><small>Move with WASD or click across six biomes</small></div>
          <div><b>02</b><span>Hunt while idle</span><small>Auto-roam tracks spawns for up to 8 hours</small></div>
          <div><b>03</b><span>Train the caravan</span><small>Level, evolve and unlock permanent upgrades</small></div>
        </div>
        <button type="button" className={styles.kickoffButton} onClick={onStart}>
          Enter the wilds <span>→</span>
        </button>
        <p className={styles.kickoffFoot}>Playable without an account. Progress is saved locally in this browser.</p>
      </section>
    </main>
  );
}

export default function PortageGame() {
  const [started, setStarted] = useState(false);
  const [view, setView] = useState<View>("hunt");
  const controller = useIdleGame();
  const { game } = controller;
  const party = activeCreatures(game);
  const maxHp = partyMaxHp(game);
  const zone = zoneFor(game.zoneId);

  if (!started) return <Kickoff onStart={() => setStarted(true)} />;

  return (
    <div className={`${ui.page} ${styles.game}`}>
      <h1 className={styles.srOnly}>Portage.fun idle caravan game</h1>
      <header className={styles.topbar}>
        <button type="button" className={styles.brandButton} onClick={() => setStarted(false)} title="Return to kickoff">
          <Image src="/game-assets/brand/logo.png" alt="" width={38} height={38} className={styles.pixelImage} />
          <span><b>PORTAGE</b><small>.FUN</small></span>
        </button>
        <nav className={styles.mainNav} aria-label="Game sections">
          {NAV.map((item) => (
            <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined} className={view === item.id ? styles.navActive : ""} onClick={() => setView(item.id)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className={styles.saveBadge}><span className={controller.saveStatus === "failed" ? styles.errorDot : styles.liveDot} /><b>{controller.saveStatus === "failed" ? "SAVE UNAVAILABLE" : controller.hydrated ? "SAVED LOCALLY" : "LOADING SAVE"}</b><small>{game.running ? "HUNTING" : "CAMPED"}</small></div>
      </header>

      <div className={styles.dashboard}>
        <aside className={styles.leftRail}>
          <section className={styles.frame}>
            <div className={styles.profileHead}>
              <div className={styles.avatar}><Image src={creatureSpritePath(party[0]?.species ?? "ember", party[0]?.stage ?? "adult")} alt="" width={54} height={54} className={styles.pixelImage} /></div>
              <div><span>PORTER</span><b>WAYFARER_01</b><small>{zone.name} · {game.running ? "Hunting" : "At camp"}</small></div>
            </div>
            <PlayerProgress controller={controller} />
            <div className={styles.resourceGrid}>
              <div><span>●</span><b>{game.gold.toLocaleString()}</b><small>Gold</small></div>
              <div><span>✦</span><b>{game.shards.toLocaleString()}</b><small>Shards</small></div>
              <div><span>⚗</span><b>{game.inventory.tonics}</b><small>Tonics</small></div>
              <div><span>◎</span><b>{game.kills}</b><small>Victories</small></div>
            </div>
          </section>

          <section className={styles.frame}>
            <div className={styles.frameTitle}><span>ACTIVE CARAVAN</span><small>{party.length}/3</small></div>
            <div className={styles.squadList}>
              {party.map((creature) => (
                <button key={creature.id} type="button" onClick={() => setView("caravan")}>
                  <Image src={creatureSpritePath(creature.species, creature.stage)} alt="" width={44} height={44} className={styles.pixelImage} />
                  <span><b>{creature.name}</b><small>Lv. {creature.level} · {rarityLabel(creature.rarity)} {stageLabel(creature.stage)}</small><i><em style={{ width: `${Math.min(100, (creature.xp / xpForCreatureLevel(creature.level)) * 100)}%` }} /></i></span>
                </button>
              ))}
            </div>
            <div className={styles.partyVitality}><span>PARTY VITALITY</span><b>{Math.ceil(game.partyHp)} / {maxHp}</b><i><em style={{ width: `${Math.max(0, Math.min(100, (game.partyHp / maxHp) * 100))}%` }} /></i></div>
          </section>

          <section className={`${styles.frame} ${styles.inventory}`}>
            <div className={styles.frameTitle}><span>TRAVEL PACK</span><small>LOCAL</small></div>
            <div className={styles.inventoryGrid}>
              <button type="button" onClick={controller.drinkTonic} aria-label={`Use tonic, ${game.inventory.tonics} available`} title="Restore 42% vitality">⚗<small aria-hidden>{game.inventory.tonics}</small></button>
              <button type="button" onClick={() => setView("caravan")} aria-label={`${game.inventory.crystals} evolution crystals`} title="Evolution crystals">◈<small aria-hidden>{game.inventory.crystals}</small></button>
              <button type="button" onClick={() => setView("codex")} aria-label={`${game.inventory.relics} Warden relics`} title="Warden relics">♜<small aria-hidden>{game.inventory.relics}</small></button>
              <button type="button" onClick={() => setView("upgrades")} aria-label={`Attack training rank ${game.upgrades.attack}`} title="Training">⚔<small aria-hidden>{game.upgrades.attack}</small></button>
              <button type="button" onClick={() => setView("map")} aria-label="Open six-route world map" title="Route map">⌁<small aria-hidden>6</small></button>
              <button type="button" onClick={() => setView("settings")} aria-label="Open local save settings" title="Local save">◆<small aria-hidden>✓</small></button>
            </div>
          </section>
        </aside>

        <main className={styles.centerStage}>
          <div className={styles.stageHeader}>
            <div><span>WORLD // {zone.name.toUpperCase()}</span><b>{NAV.find((item) => item.id === view)?.label}</b></div>
            <div className={styles.worldStatus}><span className={game.running ? styles.liveDot : styles.demoDot} />{game.engaged ? "IN COMBAT" : game.running ? "ROAMING" : "CARAVAN CAMPED"}</div>
          </div>
          <div className={styles.stageViewport}>
            {view === "hunt" ? <IdleHunt controller={controller} /> : null}
            {view === "caravan" ? <IdleRoster controller={controller} /> : null}
            {view === "map" ? <IdleMap controller={controller} /> : null}
            {view === "upgrades" ? <IdleUpgrades controller={controller} /> : null}
            {view === "codex" ? <IdleCodex controller={controller} /> : null}
            {view === "settings" ? <IdleSettings controller={controller} /> : null}
          </div>
          <div className={styles.stageFooter}>
            <span>ROUTE {String(zoneIndex(game.zoneId) + 1).padStart(2, "0")} · {zone.name.toUpperCase()} · {game.zoneKills} VICTORIES</span>
            <div><button type="button" aria-label="Open map" onClick={() => setView("map")}>⌁</button><button type="button" aria-label="Open caravan" onClick={() => setView("caravan")}>▦</button></div>
          </div>
        </main>

        <aside className={styles.rightRail}>
          <section className={styles.frame}>
            <div className={styles.frameTitle}><span>AUTOMATIONS</span><small>ACTIVE</small></div>
            <label className={styles.toggleRow}><input type="checkbox" checked={game.settings.autoRoam} onChange={() => controller.toggleSetting("autoRoam")} /><span><b>Auto-roam</b><small>Pathfind to the next wild spawn</small></span><i /></label>
            <label className={styles.toggleRow}><input type="checkbox" checked={game.settings.autoPotion} onChange={() => controller.toggleSetting("autoPotion")} /><span><b>Auto-tonic</b><small>Heal below 30% vitality</small></span><i /></label>
            <label className={styles.toggleRow}><input type="checkbox" checked={game.settings.autoAdvance} onChange={() => controller.toggleSetting("autoAdvance")} /><span><b>Advance routes</b><small>Move after 25 victories when unlocked</small></span><i /></label>
            <p className={styles.localOnly}>Combat and offline rewards are simulated locally. Maximum offline progress: 8 hours.</p>
          </section>

          <section className={`${styles.frame} ${styles.activityFrame}`}>
            <div className={styles.activityTabs}><button className={styles.activityActive}>HUNT LOG</button><button onClick={() => setView("codex")}>CODEX</button></div>
            <div className={styles.activityFeed}>
              {game.log.map((entry, index) => (
                <p key={entry.id}><time>{index === 0 ? "NOW" : `#${String(entry.id).padStart(2, "0")}`}</time><span className={styles[`log_${entry.tone}`]}>{entry.text}</span></p>
              ))}
            </div>
            <button type="button" className={styles.activityCta} onClick={controller.toggleRunning}>{game.running ? "Make camp" : "Resume the hunt"}<span>{game.running ? "Ⅱ" : "▶"}</span></button>
          </section>
        </aside>
      </div>
    </div>
  );
}
