"use client";

import { useState } from "react";
import type { LogEntry } from "@/game/core/types";
import styles from "./client.module.css";

/**
 * The battle log, floating over the world rather than occupying a strip beneath
 * it.
 *
 * It used to be a fixed band along the bottom, which cost the viewport a
 * hundred and thirty pixels it never earned back — most of the time the log is
 * repeating "you defeated coalback". Over the canvas it can be read when it
 * matters and collapsed when it does not.
 */
export default function BattleLog({ log, lines = 6 }: { log: readonly LogEntry[]; lines?: number }) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`${styles.battleLog} ${open ? "" : styles.battleLogClosed}`}>
      <button
        type="button"
        className={styles.battleLogToggle}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>LOG</span>
        <em>{open ? "▾" : "▴"}</em>
      </button>
      {open ? (
        <div className={styles.battleLogBody} aria-live="polite">
          {log.slice(0, lines).map((entry) => (
            <p key={entry.id} className={styles[`tone_${entry.tone}`]}>{entry.text}</p>
          ))}
          {log.length === 0 ? <p className={styles.tone_system}>Nothing has happened yet.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
