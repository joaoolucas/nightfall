"use client";

import type { ReactNode } from "react";
import styles from "./portage.module.css";
import { shortAddress, type Creature } from "@/utils/creatures";
import { EXP_THRESHOLDS, RARITY, SPECIES, STAGE } from "@/utils/portage";

/**
 * Shared creature card — species name, rarity badge (colored border), stage
 * label, a compact stat row (HP / ATK / DEF / SPD) and an exp bar toward the
 * next evolution threshold. Used by the Caravan, Marketplace and Portal (which
 * may pass a footer).
 */
export default function CreatureCard({
  creature,
  footer,
}: {
  creature: Creature;
  footer?: ReactNode;
}) {
  const species = SPECIES[creature.species];
  const rarity = RARITY[creature.rarity];
  const stage = STAGE[creature.stage];
  const next = EXP_THRESHOLDS[creature.stage];
  const pct = next === null ? 100 : Math.min(100, Math.round((creature.exp / next) * 100));

  return (
    <article
      className={styles.card}
      style={{
        borderColor: rarity.borderColor,
        boxShadow: `inset 0 0 0 1px ${rarity.borderColor}, 0 14px 34px -22px ${rarity.glow}`,
      }}
    >
      <div className={styles.cardTop}>
        <span className={styles.cardId}>#{creature.tokenId}</span>
        <span className={styles.stagePill}>{stage.label}</span>
      </div>

      <h3 className={styles.cardName}>{species.label}</h3>
      <p className={styles.cardSub}>
        {species.example} · {species.element}
      </p>

      <span
        className={styles.rarityBadge}
        style={{ color: rarity.color, borderColor: rarity.borderColor }}
      >
        {rarity.label}
      </span>

      <div className={styles.statRow} aria-label="Creature stats">
        <span className={styles.stat}>
          <b className={styles.statValue}>{creature.health}</b>
          HP
        </span>
        <span className={styles.stat}>
          <b className={styles.statValue}>{creature.attack}</b>
          ATK
        </span>
        <span className={styles.stat}>
          <b className={styles.statValue}>{creature.defense}</b>
          DEF
        </span>
        <span className={styles.stat}>
          <b className={styles.statValue}>{creature.speed}</b>
          SPD
        </span>
      </div>

      <div className={styles.expBlock}>
        <div
          className={styles.expTrack}
          role="progressbar"
          aria-valuenow={creature.exp}
          aria-valuemin={0}
          aria-valuemax={next ?? creature.exp}
        >
          <span className={styles.expFill} style={{ width: `${pct}%` }} />
        </div>
        <span className={styles.expLabel}>
          {next === null ? `EXP ${creature.exp} · MAX` : `EXP ${creature.exp}/${next}`}
        </span>
      </div>

      <p className={styles.cardOwner} title={creature.owner}>
        {shortAddress(creature.owner)}
      </p>

      {footer ? <div className={styles.cardFooter}>{footer}</div> : null}
    </article>
  );
}
