"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { zoneFor } from "@/game/world/zones";
import { PLAYER_ID, companionAttack, expForLevel, playerDefense, playerOf } from "@/game/sim/state";
import { capacity, inventoryWeight } from "@/game/world/items";
import { canReach } from "@/game/sim/actions";
import BattleLog from "./BattleLog";
import CreatureIcon from "./CreatureIcon";
import ItemIcon from "./ItemIcon";
import UiIcon, { type UiIconName } from "./UiIcon";
import { BackpackWindow, Container, PotionChoice } from "./Inventory";
import MapWindow from "./MapWindow";
import MarketWindow from "./MarketWindow";
import SkillsWindow from "./SkillsWindow";
import Viewport from "./Viewport";
import { useGameSim } from "./useGameSim";
import styles from "./client.module.css";

/**
 * The game client.
 *
 * The rail holds only what you watch while a fight is happening — your health,
 * who is fighting, what you drink. Skills, the backpack, the trading post and
 * the route map are consulted rather than watched, so they open as windows over
 * the world from the icon bar.
 */

type WindowId = "map" | "market" | "skills" | "backpack";

/** A reading with its icon and bar: the shape every measure in the rail takes. */
function Gauge({ icon, label, reading, value, max, tone }: {
  icon: UiIconName;
  label: string;
  reading: string;
  value: number;
  max: number;
  tone: "hp" | "exp" | "cap" | "over";
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={styles.gauge}>
      <UiIcon name={icon} />
      <div>
        <div className={styles.gaugeHead}>
          <span>{label}</span>
          <b>{reading}</b>
        </div>
        <span className={`${styles.bar} ${styles[`bar_${tone}`]}`}>
          <i style={{ width: `${pct}%` }} />
        </span>
      </div>
    </div>
  );
}

export default function GameClient() {
  const sim = useGameSim();
  const { state } = sim;
  const player = useMemo(() => state.entities.find((entity) => entity.id === PLAYER_ID) ?? playerOf(state), [state]);
  const active = state.entities.find((entity) => entity.kind === "companion");

  const [openWindow, setOpenWindow] = useState<WindowId | null>(null);
  const [openPileId, setOpenPileId] = useState<string | null>(null);
  const openPile = state.ground.find((pile) => pile.id === openPileId) ?? null;

  // A corpse that rots away or is walked away from closes itself, so the panel
  // can never show contents the Porter can no longer reach.
  useEffect(() => {
    if (openPileId && !openPile) setOpenPileId(null);
    else if (openPile && !canReach(state, openPile)) setOpenPileId(null);
  }, [openPileId, openPile, state]);

  const weight = inventoryWeight(state.inventory);
  const maxWeight = capacity(state.progress.level);
  const nextLevel = expForLevel(state.progress.level);
  const zone = zoneFor(state.zoneId);
  const toggle = (id: WindowId) => setOpenWindow((current) => (current === id ? null : id));

  // The map tab used to be labelled with the zone you were standing in, which
  // named the one place you could not travel to. It says what it opens now; the
  // zone you are in is on the panel below, where a reading belongs.
  const tabs: { id: WindowId; icon: React.ReactNode; label: string; title: string }[] = [
    { id: "map", icon: <UiIcon name="map" />, label: "Map", title: "Choose where to hunt" },
    { id: "market", icon: <ItemIcon defId="gold" />, label: "Market", title: "Sell your haul and buy supplies" },
    { id: "skills", icon: <UiIcon name="ledger" />, label: "Skills", title: "Your skills and your tally" },
    { id: "backpack", icon: <UiIcon name="pack" />, label: "Backpack", title: "What you are carrying" },
  ];

  return (
    <div className={styles.client}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Image src="/game-assets/brand/logo.png" alt="" width={32} height={32} className={styles.pixel} />
          <span><b>PORTAGE</b><small>.FUN</small></span>
        </div>

        <nav className={styles.iconBar} aria-label="Client windows">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={openWindow === tab.id ? styles.iconActive : ""}
              aria-pressed={openWindow === tab.id}
              onClick={() => toggle(tab.id)}
              title={tab.title}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className={styles.saveState}>
          <span className={sim.saveFailed ? styles.dotError : styles.dotLive} />
          {sim.saveFailed ? "SAVE FAILED" : sim.hydrated ? "SAVED" : "LOADING"}
        </div>
      </header>

      <div className={styles.stage}>
        <div className={styles.viewportWrap}>
          <Viewport sim={sim} />
          <BattleLog log={state.log} />
          {openWindow ? (
            <button
              type="button"
              className={styles.scrim}
              aria-label="Close window"
              onClick={() => setOpenWindow(null)}
            />
          ) : null}
          {openWindow === "map" ? <MapWindow sim={sim} onClose={() => setOpenWindow(null)} /> : null}
          {openWindow === "market" ? <MarketWindow sim={sim} onClose={() => setOpenWindow(null)} /> : null}
          {openWindow === "skills" ? <SkillsWindow sim={sim} onClose={() => setOpenWindow(null)} /> : null}
          {openWindow === "backpack" ? <BackpackWindow sim={sim} onClose={() => setOpenWindow(null)} /> : null}
        </div>

        <aside className={styles.rail}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>{zone.name} <small>Level {state.progress.level}</small></div>
            <Gauge
              icon="health"
              label="Health"
              reading={`${Math.ceil(player.hp)} / ${player.maxHp}`}
              value={player.hp}
              max={player.maxHp}
              tone="hp"
            />
            <Gauge
              icon="exp"
              label="Experience"
              reading={`${state.progress.exp.toLocaleString()} / ${nextLevel.toLocaleString()}`}
              value={state.progress.exp}
              max={nextLevel}
              tone="exp"
            />
            <Gauge
              icon="capacity"
              label="Capacity"
              reading={`${weight} / ${maxWeight} oz`}
              value={weight}
              max={maxWeight}
              tone={weight > maxWeight ? "over" : "cap"}
            />
            <div className={styles.statGrid}>
              <div>
                <UiIcon name="attack" />
                <span>Creature attack<b>{active ? Math.round(companionAttack(state, active)) : "—"}</b></span>
              </div>
              <div>
                <UiIcon name="shield" />
                <span>Your defense<b>{Math.round(playerDefense(state))}</b></span>
              </div>
              <div>
                <ItemIcon defId="gold" />
                <span>Gold<b>{state.inventory.gold.toLocaleString()}</b></span>
              </div>
              <div>
                <ItemIcon defId="shard" />
                <span>Shards<b>{state.inventory.shards.toLocaleString()}</b></span>
              </div>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.panelFill}`}>
            <div className={styles.panelHead}>Creatures <small>1 in field</small></div>
            <div className={styles.party}>
              {state.companions.map((companion) => {
                const inField = state.activeCompanionIds.includes(companion.id);
                return (
                  <button
                    key={companion.id}
                    type="button"
                    className={inField ? styles.partyActive : ""}
                    onClick={() => sim.summon(companion.id)}
                    disabled={inField}
                    title={inField ? `${companion.name} is in the field` : `Send ${companion.name} out`}
                  >
                    <CreatureIcon species={companion.species} stage={companion.stage} />
                    <span className={styles.partyText}>
                      <b>{companion.name}</b>
                      <small>Lv. {companion.level}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <PotionChoice sim={sim} />
          {openPile ? <Container sim={sim} pile={openPile} onClose={() => setOpenPileId(null)} /> : null}
        </aside>
      </div>

      {sim.catchUpProgress !== null ? (
        <div className={styles.overlay} role="status" aria-live="polite">
          <div className={styles.overlayCard}>
            <span>WELCOME BACK</span>
            <h2>Simulating the hunt you missed.</h2>
            <p>
              Your time away is replayed through the same combat rules you play with, not estimated — so this takes
              a moment.
            </p>
            <span className={`${styles.bar} ${styles.bar_exp}`}>
              <i style={{ width: `${Math.round(sim.catchUpProgress * 100)}%` }} />
            </span>
          </div>
        </div>
      ) : null}

      {sim.offlineTicks > 0 ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.overlayCard}>
            <span>WELCOME BACK</span>
            <h2>Your caravan kept hunting.</h2>
            <p>
              {Math.round((sim.offlineTicks * 100) / 1000 / 60)} minutes of hunting were replayed through the same
              combat rules you play with — not an estimate.
              {sim.awaySeconds > sim.offlineTicks * 0.1 + 60
                ? " After that your caravan made camp, so the rest of your time away earned nothing."
                : ""}
            </p>
            <button type="button" autoFocus onClick={sim.dismissOffline}>Continue</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
