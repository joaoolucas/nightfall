"use client";

import { useState } from "react";
import styles from "./nightfall.module.css";
import {
  GamePhase,
  MVP_ROLES,
  PHASES,
  PHASE_LABELS,
  ROLE_LABELS,
  ROLE_TEAM,
  Role,
  Team,
  roleCardImage,
} from "@/utils/game";
import { useNightfallState } from "./useNightfallState";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import { castVote } from "@/utils/nightfall-write";

type RoleCardProps = {
  role: Role;
  revealed: boolean;
  onToggle: () => void;
};

// One role card: a hidden card-back until revealed, then the role's artwork,
// name and team chip. Static visuals for now — real reveal comes from the
// per-seat viewing key once the keeper/contract land.
function RoleCard({ role, revealed, onToggle }: RoleCardProps) {
  const team = ROLE_TEAM[role];
  const teamClass = team === Team.Wolves ? styles.teamWolves : styles.teamVillage;
  return (
    <button
      type="button"
      className={styles.roleCard}
      onClick={onToggle}
      title={revealed ? ROLE_LABELS[role] : "Hidden role (tap to peek)"}
      aria-label={revealed ? ROLE_LABELS[role] : "Hidden role"}
    >
      {revealed ? (
        <span className={styles.roleCardInner}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.roleCardImg}
            src={roleCardImage(role)}
            alt={ROLE_LABELS[role]}
            width={128}
            height={128}
          />
          <span className={styles.roleCardName}>{ROLE_LABELS[role]}</span>
          <span className={`${styles.roleCardTeam} ${teamClass}`}>{team}</span>
        </span>
      ) : (
        <span className={styles.roleCardBack}>
          <span className={styles.roleCardBackIcon}>🌑</span>
          <span className={styles.roleCardBackText}>Hidden</span>
        </span>
      )}
    </button>
  );
}

// The game table: a phase banner (Lobby→Deal→Night→Day→Vote→Reveal→Settle) and
// the 6 MVP role cards. Phase/seat state is read from the Fair Game Engine when
// a contract is configured; a minimal vote row scaffolds the on-chain write path.
export default function GameTable() {
  // Phase comes from the chain when a contract is configured; otherwise the
  // hook returns the static demo state (Lobby).
  const { phase: currentPhase, onChain, loading, error } = useNightfallState();
  const account = useStoreWallet((state) => state.account);
  const isConnected = useStoreWallet((state) => state.isConnected);
  // Which role cards are face-up. Defaults to all hidden (nothing dealt yet).
  const [revealed, setRevealed] = useState<Set<Role>>(new Set());

  // Vote-row scaffold (v0 write path). The voter's seat is a local input for now:
  // deriving it from the connected address needs a seat_of getter (later wave).
  const [voterSeat, setVoterSeat] = useState<string>("");
  const [targetSeat, setTargetSeat] = useState<string>("");
  const [pendingVote, setPendingVote] = useState<boolean>(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteTxHash, setVoteTxHash] = useState<string | null>(null);

  const canVote = onChain && isConnected && currentPhase === GamePhase.Vote;

  const toggleRole = (role: Role) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const handleCastVote = async () => {
    if (!account) return;
    const seat = Number(voterSeat);
    const target = Number(targetSeat);
    if (!Number.isInteger(seat) || seat < 0) {
      setVoteError("Your seat must be a non-negative integer (0..11).");
      return;
    }
    if (!Number.isInteger(target) || target < 0) {
      setVoteError("Target seat must be a non-negative integer (0..11).");
      return;
    }
    setPendingVote(true);
    setVoteError(null);
    setVoteTxHash(null);
    try {
      const hash = await castVote(account, seat, target);
      setVoteTxHash(hash);
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingVote(false);
    }
  };

  return (
    <section className={styles.section} aria-label="Game table">
      <h2 className={styles.sectionTitle}>Game table</h2>

      {/* Phase banner */}
      <div className={styles.phaseBanner}>
        <div className={styles.phaseRow}>
          <span className={styles.phaseLabel}>Phase</span>
          <span className={styles.phaseCurrent}>{PHASE_LABELS[currentPhase]}</span>
        </div>
        <div className={styles.phaseSteps}>
          {PHASES.map((phase, i) => {
            const isActive = phase === currentPhase;
            const isDone = phase < currentPhase;
            const cls = isActive
              ? styles.phaseStepActive
              : isDone
              ? styles.phaseStepDone
              : "";
            return (
              <span key={phase}>
                {i > 0 && <span className={styles.phaseArrow}>→</span>}
                <span className={`${styles.phaseStep} ${cls}`}>
                  <span className={styles.stepNum}>{i + 1}</span>
                  {PHASE_LABELS[phase]}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Role cards */}
      <div className={styles.roleGrid}>
        {MVP_ROLES.map((role) => (
          <RoleCard
            key={role}
            role={role}
            revealed={revealed.has(role)}
            onToggle={() => toggleRole(role)}
          />
        ))}
      </div>
      <p className={styles.roleHint}>
        Tap a card to peek — roles are dealt as encrypted notes once the game starts.
      </p>

      {/* Vote row — minimal on-chain write scaffold for the Vote phase. */}
      <div className={styles.votePanel}>
        <div className={styles.voteHead}>
          <span className={styles.voteTitle}>Cast vote</span>
          <span className={styles.voteBadge}>
            {currentPhase === GamePhase.Vote ? "Voting open" : "Voting closed"}
          </span>
        </div>
        <div className={styles.voteFields}>
          <label className={styles.voteField}>
            <span className={styles.voteLabel}>Your seat #</span>
            <input
              className={styles.voteInput}
              type="number"
              min={0}
              max={11}
              inputMode="numeric"
              placeholder="0"
              value={voterSeat}
              onChange={(e) => setVoterSeat(e.target.value)}
              aria-label="Your seat number"
            />
          </label>
          <label className={styles.voteField}>
            <span className={styles.voteLabel}>Target seat #</span>
            <input
              className={styles.voteInput}
              type="number"
              min={0}
              max={11}
              inputMode="numeric"
              placeholder="0"
              value={targetSeat}
              onChange={(e) => setTargetSeat(e.target.value)}
              aria-label="Target seat number"
            />
          </label>
          <button
            type="button"
            className={styles.voteBtn}
            disabled={!canVote || pendingVote}
            onClick={handleCastVote}
          >
            {pendingVote ? "Voting…" : "Cast Vote"}
          </button>
        </div>
        <p className={styles.voteHint}>
          Your seat is a manual input for now — a seat_of getter will derive it from
          your connected address in a later wave.
        </p>
        {voteError && (
          <p className={styles.txError} role="alert">
            Vote failed: {voteError}
          </p>
        )}
        {voteTxHash && (
          <p className={styles.txHash}>
            Submitted{" "}
            <a
              className={styles.txHashLink}
              href={`https://voyager.online/tx/${voteTxHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {voteTxHash.slice(0, 10)}…{voteTxHash.slice(-6)} ↗
            </a>
          </p>
        )}
      </div>

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
    </section>
  );
}
