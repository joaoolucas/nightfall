"use client";

import { useState } from "react";
import styles from "./nightfall.module.css";
import {
  GAME_MODE_LABELS,
  GameMode,
  SEAT_COUNT,
} from "@/utils/game";
import { useNightfallState } from "./useNightfallState";

// A lobby seat. Seats are assigned sequentially on chain, so the first
// `occupiedCount` seats show as joined; demo mode leaves every seat open.
function Seat({ index, occupied }: { index: number; occupied: boolean }) {
  return (
    <div className={`${styles.seat} ${occupied ? styles.seatOccupied : ""}`}>
      <span className={styles.seatIndex}>{index + 1}</span>
      <span className={styles.seatInfo}>
        <span className={styles.seatName}>
          {occupied ? `Player ${index + 1}` : "Open seat"}
        </span>
        <span className={styles.seatState}>{occupied ? "Joined" : "Waiting…"}</span>
      </span>
    </div>
  );
}

// The lobby: seat list, free vs staked mode toggle, and a (deliberately
// disabled) Start Game button to be wired to the contract in a later wave.
export default function Lobby() {
  const [mode, setMode] = useState<GameMode>("free");
  const { seatCount: onChainSeats, onChain, loading, error } = useNightfallState();
  // On chain the first `onChainSeats` seats are occupied (join_game assigns
  // seats 0..n-1 sequentially); in demo mode every seat is an open placeholder.
  const occupiedCount = onChain ? onChainSeats : 0;
  // Render at least SEAT_COUNT rows; the contract allows up to MAX_PLAYERS (12),
  // so when more seats are joined on chain, render enough rows for them too.
  const displayedSeats = Math.max(SEAT_COUNT, onChainSeats);

  return (
    <section className={styles.section} aria-label="Lobby">
      <h2 className={styles.sectionTitle}>Lobby</h2>

      <div className={styles.lobby}>
        <div className={styles.lobbyHead}>
          <span className={styles.lobbyTitle}>
            One Night · {onChain ? `${onChainSeats}/${displayedSeats}` : `${displayedSeats}`} players
          </span>
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
          {Array.from({ length: displayedSeats }, (_, i) => (
            <Seat key={i} index={i} occupied={i < occupiedCount} />
          ))}
        </div>

        <button type="button" className={styles.startBtn} disabled>
          Start Game
        </button>
        <p className={styles.startHint}>
          {onChain
            ? `Nightfall contract configured · starting in ${GAME_MODE_LABELS[mode]} mode (wired later).`
            : "Start Game is disabled until players join and the Nightfall contract is deployed."}
        </p>
        <p className={styles.modeNote}>
          {mode === "free"
            ? "Free mode — play for points on the leaderboard."
            : "Staked mode — buy-in goes to the pool, payouts settle privately via STRK20."}
        </p>

        <div className={styles.chainStatus}>
          {loading ? (
            <span className={styles.chainLoading}>Syncing on-chain state…</span>
          ) : (
            <span
              className={`${styles.chainBadge} ${
                onChain ? styles.chainBadgeOn : styles.chainBadgeOff
              }`}
            >
              {onChain ? "on-chain" : "demo (no contract)"}
            </span>
          )}
          {error && <span className={styles.chainError}>{error}</span>}
        </div>
      </div>
    </section>
  );
}
