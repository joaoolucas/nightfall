"use client";

import { ZONES } from "@/game/world/zones";
import GameWindow from "./GameWindow";
import type { GameSim } from "./useGameSim";
import styles from "./client.module.css";

/**
 * Where to hunt.
 *
 * The routes used to be a strip of tabs in the header, which said nothing about
 * what any of them were — you picked a name and found out. Each route now shows
 * its terrain, what it is, and what it costs to get in, because choosing a
 * hunting ground is the one decision a Porter makes between fights.
 */
export default function MapWindow({ sim, onClose }: { sim: GameSim; onClose: () => void }) {
  const { level } = sim.state.progress;

  return (
    <GameWindow title="Hunting grounds" subtitle={`level ${level}`} onClose={onClose} wide>
      <div className={styles.mapGrid}>
        {ZONES.map((zone, index) => {
          const locked = level < zone.requiredLevel;
          const here = zone.id === sim.state.zoneId;
          return (
            <button
              key={zone.id}
              type="button"
              disabled={locked || here}
              className={`${styles.mapCard} ${here ? styles.mapCardHere : ""} ${locked ? styles.mapCardLocked : ""}`}
              onClick={() => {
                sim.changeZone(zone.id);
                onClose();
              }}
            >
              <span
                className={styles.mapSwatch}
                style={{ backgroundImage: `url(/game-assets/world/tilesets/${zone.id}/wang_0.png)` }}
                aria-hidden
              />
              <span className={styles.mapCardText}>
                <b>
                  {String(index + 1).padStart(2, "0")} {zone.name}
                </b>
                <small>{zone.subtitle}</small>
                <em>{locked ? `Locked — needs level ${zone.requiredLevel}` : here ? "You are hunting here" : "Travel here"}</em>
              </span>
            </button>
          );
        })}
      </div>
    </GameWindow>
  );
}
