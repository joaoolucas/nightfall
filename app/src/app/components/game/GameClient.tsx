"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ZONES, zoneFor } from "@/game/world/zones";
import { creatureSpritePath } from "@/utils/portage";
import { battleList } from "@/game/sim/ai";
import { PLAYER_ID, companionAttack, expForLevel, handlingBonus, playerDefense, playerOf } from "@/game/sim/state";
import { capacity, inventoryWeight } from "@/game/world/items";
import { distance } from "@/game/core/grid";
import { canReach } from "@/game/sim/actions";
import { Backpack, Container, Equipment } from "./Inventory";
import Viewport from "./Viewport";
import { useGameSim } from "./useGameSim";
import styles from "./client.module.css";

/**
 * The game client.
 *
 * Viewport first, chrome around it: status, battle list, inventory and console —
 * the reading order of a top-down tile RPG, rather than the dashboard the old
 * shell used, where the world occupied under half the screen.
 */

function Bar({ value, max, tone }: { value: number; max: number; tone: "hp" | "exp" | "cap" }) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className={`${styles.bar} ${styles[`bar_${tone}`]}`}>
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

export default function GameClient() {
  const sim = useGameSim();
  const { state } = sim;
  const player = useMemo(() => state.entities.find((entity) => entity.id === PLAYER_ID) ?? playerOf(state), [state]);
  const targets = useMemo(() => battleList(state), [state]);
  const [openPileId, setOpenPileId] = useState<string | null>(null);
  const openPile = state.ground.find((pile) => pile.id === openPileId) ?? null;

  // A corpse that rots away or is walked away from closes itself, so the panel
  // can never show contents the Porter can no longer touch.
  useEffect(() => {
    if (openPileId && !openPile) setOpenPileId(null);
    else if (openPile && !canReach(state, openPile)) setOpenPileId(null);
  }, [openPileId, openPile, state]);

  // With auto-loot off, the nearest unlooted pile is offered for opening.
  const reachablePile = state.ground.find(
    (pile) => pile.items.length > 0 && distance(player, pile) <= 1,
  );

  // Only one creature is in the field, and it is the thing that actually fights.
  const active = state.entities.find((entity) => entity.kind === "companion");

  const weight = inventoryWeight(state.inventory);
  const maxWeight = capacity(state.progress.level);
  const zone = zoneFor(state.zoneId);

  return (
    <div className={styles.client}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Image src="/game-assets/brand/logo.png" alt="" width={30} height={30} className={styles.pixel} />
          <span><b>PORTAGE</b><small>.FUN</small></span>
        </div>
        <nav className={styles.zoneNav} aria-label="Routes">
          {ZONES.map((candidate, index) => {
            const locked = state.progress.level < candidate.requiredLevel;
            return (
              <button
                key={candidate.id}
                type="button"
                disabled={locked}
                aria-current={candidate.id === state.zoneId ? "page" : undefined}
                className={candidate.id === state.zoneId ? styles.zoneActive : ""}
                onClick={() => sim.changeZone(candidate.id)}
                title={locked ? `Unlocks at level ${candidate.requiredLevel}` : candidate.subtitle}
              >
                {String(index + 1).padStart(2, "0")} {candidate.name}
              </button>
            );
          })}
        </nav>
        <div className={styles.saveState}>
          <span className={sim.saveFailed ? styles.dotError : styles.dotLive} />
          {sim.saveFailed ? "SAVE UNAVAILABLE" : sim.hydrated ? "SAVED LOCALLY" : "LOADING"}
        </div>
      </header>

      <div className={styles.stage}>
        <Viewport sim={sim} />

        <aside className={styles.rail}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>{zone.name.toUpperCase()}</div>
            <div className={styles.statRow}><span>Health</span><b>{Math.ceil(player.hp)} / {player.maxHp}</b></div>
            <Bar value={player.hp} max={player.maxHp} tone="hp" />
            <div className={styles.statRow}><span>Level {state.progress.level}</span><b>{state.progress.exp} / {expForLevel(state.progress.level)}</b></div>
            <Bar value={state.progress.exp} max={expForLevel(state.progress.level)} tone="exp" />
            <div className={styles.statRow}><span>Capacity</span><b>{weight} / {maxWeight} oz</b></div>
            <Bar value={weight} max={maxWeight} tone="cap" />
            <div className={styles.statGrid}>
              <div><span>Creature atk</span><b>{active ? Math.round(companionAttack(state, active)) : "—"}</b></div>
              <div><span>Your defense</span><b>{Math.round(playerDefense(state))}</b></div>
              <div><span>Gold</span><b>{state.inventory.gold.toLocaleString()}</b></div>
              <div><span>Shards</span><b>{state.inventory.shards.toLocaleString()}</b></div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>Battle list <small>{targets.length}</small></div>
            <div className={styles.battleList}>
              {targets.length === 0 ? <p className={styles.empty}>Nothing in sight.</p> : null}
              {targets.map((entity) => (
                <button
                  key={entity.id}
                  type="button"
                  className={entity.id === player.targetId ? styles.battleActive : ""}
                  onClick={() => sim.setTarget(entity.id)}
                >
                  <em>{distance(player, entity)}</em>
                  <span>
                    <b>{entity.name}</b>
                    <i><em style={{ width: `${Math.max(0, (entity.hp / entity.maxHp) * 100)}%` }} /></i>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>Skills</div>
            <div className={styles.skills}>
              {(["melee", "shielding", "vitality"] as const).map((skill) => (
                <div key={skill}>
                  {/* The stored id stays "melee" so old saves keep working; the
                      Porter commands rather than swings, so the label does not. */}
                  <span>{skill === "melee" ? "handling" : skill}</span>
                  <b>{state.progress.skills[skill]}</b>
                </div>
              ))}
            </div>
          </section>

          {openPile ? <Container sim={sim} pile={openPile} onClose={() => setOpenPileId(null)} /> : null}

          {!openPile && reachablePile ? (
            <section className={styles.panel}>
              <div className={styles.panelHead}>Ground</div>
              <button type="button" className={styles.takeAll} onClick={() => setOpenPileId(reachablePile.id)}>
                Open {reachablePile.corpseOf ? `dead ${reachablePile.corpseOf}` : "the pile"}
              </button>
            </section>
          ) : null}

          <Equipment sim={sim} />
          <Backpack sim={sim} />

          <section className={styles.panel}>
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
                    <Image src={creatureSpritePath(companion.species, companion.stage)} alt="" width={30} height={30} className={styles.pixel} />
                    <span><b>{companion.name}</b><small>Lv. {companion.level}{inField ? " · in field" : ""}</small></span>
                  </button>
                );
              })}
            </div>
            <p className={styles.hint}>
              Only one creature fights at a time. You carry, direct and take the blows — your handling
              ({state.progress.skills.melee}) and weapon add {Math.round(handlingBonus(state))} to its attack.
            </p>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>Automation</div>
            {(["autoHunt", "autoPotion", "autoLoot"] as const).map((key) => (
              <label key={key} className={styles.toggle}>
                <input type="checkbox" checked={state.settings[key]} onChange={() => sim.toggleSetting(key)} />
                <span>{key === "autoHunt" ? "Auto-hunt" : key === "autoPotion" ? "Auto-potion" : "Auto-loot"}</span>
              </label>
            ))}
          </section>
        </aside>
      </div>

      <footer className={styles.console} aria-live="polite">
        {state.log.slice(0, 5).map((entry) => (
          <p key={entry.id} className={styles[`tone_${entry.tone}`]}>{entry.text}</p>
        ))}
        <p className={styles.tone_system}>
          {state.kills} defeated · {state.deaths} deaths · {Math.floor(state.playSeconds / 60)}m played
        </p>
      </footer>

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
