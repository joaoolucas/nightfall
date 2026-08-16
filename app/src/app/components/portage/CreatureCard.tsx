"use client";

import type { ReactNode } from "react";
import styles from "./portage.module.css";
import { shortAddress, type Creature } from "@/utils/creatures";
import { RARITY, SPECIES, STAGE } from "@/utils/portage";

/**
 * Shared creature card — species name, rarity badge (colored border) and stage
 * label. Used by both the Caravan and the Marketplace (which passes a footer).
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

      <p className={styles.cardOwner} title={creature.owner}>
        {shortAddress(creature.owner)}
      </p>

      {footer ? <div className={styles.cardFooter}>{footer}</div> : null}
    </article>
  );
}
