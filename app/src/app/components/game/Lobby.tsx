"use client";

import { useState } from "react";
import styles from "./nightfall.module.css";
import {
  GAME_MODE_LABELS,
  GameMode,
  SEAT_COUNT,
} from "@/utils/game";
import { hasNightfallContract } from "@/utils/nightfall";

// A lobby seat. Static for now: no one has joined, so every seat is open. The
// connected wallet will occupy a seat in a later wave (join → buy-in flow).
function Seat({ index }: { index: number }) {
  const occupied = false; // wired later via lobby state
  return (
    <div className={`${styles.seat} ${occupied ? styles.seatOccupied : ""}`}>
      <span className={styles.seatIndex}>{index + 1}</span>
      <span className={styles.seatInfo}>
        <span className={styles.seatName}>{occupied ? "You" : "Open seat"}</span>
        <span className={styles.seatState}>{occupied ? "Joined" : "Waiting…"}</span>
      </span>
    </div>
  );
}

// The lobby: seat list, free vs staked mode toggle, and a (deliberately
// disabled) Start Game button to be wired to the contract in a later wave.
export default function Lobby() {
  const [mode, setMode] = useState<GameMode>("free");
  const contractReady = hasNightfallContract();

  return (
    <section className={styles.section} aria-label="Lobby">
      <h2 className={styles.sectionTitle}>Lobby</h2>

      <div className={styles.lobby}>
        <div className={styles.lobbyHead}>
          <span className={styles.lobbyTitle}>One Night · 6 players</span>
          <div className={styles.modeToggle} role="group" aria-label="Game mode">
            {(Object.keys(GAME_MODE_LABELS) as GameMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.modeBtn} ${mode === m ? styles.modeBtnActive : ""} ${
                  mode === m && m === "staked" ? styles.modeBtnActiveStaked : ""
                }`}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
              >
                {GAME_MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.seatList}>
          {Array.from({ length: SEAT_COUNT }, (_, i) => (
            <Seat key={i} index={i} />
          ))}
        </div>

        <button type="button" className={styles.startBtn} disabled>
          Start Game
        </button>
        <p className={styles.startHint}>
          {contractReady
            ? `Nightfall contract configured · starting in ${GAME_MODE_LABELS[mode]} mode (wired later).`
            : "Start Game is disabled until players join and the Nightfall contract is deployed."}
        </p>
        <p className={styles.modeNote}>
          {mode === "free"
            ? "Free mode — play for points on the leaderboard."
            : "Staked mode — buy-in goes to the pool, payouts settle privately via STRK20."}
        </p>
      </div>
    </section>
  );
}
