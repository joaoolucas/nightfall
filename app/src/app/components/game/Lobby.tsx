"use client";

import { useState } from "react";
import styles from "./nightfall.module.css";
import {
  GAME_MODE_LABELS,
  GameMode,
  SEAT_COUNT,
} from "@/utils/game";
import { useNightfallState } from "./useNightfallState";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import { deployNightfall, joinGame, startGame } from "@/utils/nightfall-write";

// The Cairo contract allows up to MAX_PLAYERS (12) joined seats; v0 renders a
// 6-seat MVP table but the lobby still lets extra seats join on chain.
const MAX_PLAYERS = 12;

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

// A random felt252 seed for start_game. Roles are dealt deterministically from
// this seed (trusted-dealer path), so we draw fresh entropy per start.
function randomFeltSeed(): bigint {
  const words = new Uint32Array(4);
  globalThis.crypto.getRandomValues(words);
  let seed = 0n;
  for (const word of words) seed = (seed << 32n) | BigInt(word);
  // Keep within the felt252 field (2^251 - 1).
  return seed & ((1n << 251n) - 1n);
}

// The lobby: seat list, free vs staked mode toggle, and the on-chain write
// actions (join / start) wired to the Fair Game Engine through the wallet.
export default function Lobby() {
  const [mode, setMode] = useState<GameMode>("free");
  const { seatCount: onChainSeats, onChain, loading, error } = useNightfallState();
  const account = useStoreWallet((state) => state.account);
  const isConnected = useStoreWallet((state) => state.isConnected);

  // Which tx is in flight (only one at a time) + inline error/hash for the last attempt.
  const [pending, setPending] = useState<"join" | "start" | "deploy" | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<{
    classHash: string;
    contractAddress: string;
  } | null>(null);

  // On chain the first `onChainSeats` seats are occupied (join_game assigns
  // seats 0..n-1 sequentially); in demo mode every seat is an open placeholder.
  const occupiedCount = onChain ? onChainSeats : 0;
  // Render at least SEAT_COUNT rows; the contract allows up to MAX_PLAYERS (12),
  // so when more seats are joined on chain, render enough rows for them too.
  const displayedSeats = Math.max(SEAT_COUNT, onChainSeats);

  const canJoin = onChain && isConnected && onChainSeats < MAX_PLAYERS;
  const canStart = onChain && isConnected && onChainSeats >= 3;
  const canDeploy = isConnected && !onChain;

  const handleJoin = async () => {
    if (!account) return;
    setPending("join");
    setTxError(null);
    setTxHash(null);
    try {
      const hash = await joinGame(account);
      setTxHash(hash);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  };

  const handleStart = async () => {
    if (!account) return;
    setPending("start");
    setTxError(null);
    setTxHash(null);
    try {
      const hash = await startGame(account, randomFeltSeed());
      setTxHash(hash);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  };

  const handleDeploy = async () => {
    if (!account) return;
    setPending("deploy");
    setTxError(null);
    setTxHash(null);
    setDeployResult(null);
    try {
      const result = await deployNightfall(account);
      setDeployResult({
        classHash: result.classHash,
        contractAddress: result.contractAddress,
      });
    } catch (err) {
      setTxError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  };

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

        {!onChain && (
          <div className={styles.deployRow}>
            <button
              type="button"
              className={styles.deployBtn}
              disabled={!canDeploy || pending !== null}
              onClick={handleDeploy}
            >
              {pending === "deploy" ? "Deploying Nightfall…" : "Deploy Nightfall"}
            </button>
          </div>
        )}

        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.joinBtn}
            disabled={!canJoin || pending !== null}
            onClick={handleJoin}
          >
            {pending === "join" ? "Joining…" : "Join Game"}
          </button>
          <button
            type="button"
            className={styles.startBtn}
            disabled={!canStart || pending !== null}
            onClick={handleStart}
          >
            {pending === "start" ? "Starting…" : "Start Game"}
          </button>
        </div>

        {deployResult && (
          <div className={styles.deployResult}>
            <p className={styles.deployResultTitle}>Nightfall deployed ✓</p>
            <div className={styles.deployField}>
              <span>Contract address</span>
              <code>{deployResult.contractAddress}</code>
            </div>
            <div className={styles.deployField}>
              <span>Class hash</span>
              <code>{deployResult.classHash}</code>
            </div>
            <p className={styles.deployHint}>
              Paste the address into <code>.env.local</code> as{" "}
              <code>NEXT_PUBLIC_NIGHTFALL_ADDRESS={deployResult.contractAddress}</code>{" "}
              and restart the dev server.
            </p>
          </div>
        )}

        {txError && (
          <p className={styles.txError} role="alert">
            Transaction failed: {txError}
          </p>
        )}
        {txHash && (
          <p className={styles.txHash}>
            Submitted{" "}
            <a
              className={styles.txHashLink}
              href={`https://voyager.online/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {txHash.slice(0, 10)}…{txHash.slice(-6)} ↗
            </a>
          </p>
        )}

        <p className={styles.startHint}>
          {!onChain
            ? isConnected
              ? "No contract configured — deploy Nightfall to enable Join / Start."
              : "Connect a wallet and deploy Nightfall to enable Join / Start."
            : !isConnected
            ? "Connect a wallet to join the table and start the game."
            : onChainSeats < 3
            ? `${onChainSeats}/${MAX_PLAYERS} joined — need at least 3 players to start.`
            : onChainSeats < MAX_PLAYERS
            ? `${onChainSeats}/${MAX_PLAYERS} joined — ready to start in ${GAME_MODE_LABELS[mode]} mode.`
            : `Table full (${MAX_PLAYERS} players) — start the game in ${GAME_MODE_LABELS[mode]} mode.`}
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
