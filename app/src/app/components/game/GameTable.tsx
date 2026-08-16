"use client";

import { useState } from "react";
import styles from "./nightfall.module.css";
import {
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
// the 6 MVP role cards. All state is local/static for now — it will be driven by
// the Fair Game Engine once the contract + keeper land.
export default function GameTable() {
  // Phase comes from the chain when a contract is configured; otherwise the
  // hook returns the static demo state (Lobby).
  const { phase: currentPhase, onChain, loading, error } = useNightfallState();
  // Which role cards are face-up. Defaults to all hidden (nothing dealt yet).
  const [revealed, setRevealed] = useState<Set<Role>>(new Set());

  const toggleRole = (role: Role) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
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
