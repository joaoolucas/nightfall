"use client";

import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import Image from "next/image";
import styles from "./portage.module.css";
import { shortAddress, type Creature } from "@/utils/creatures";
import {
  EXP_THRESHOLDS,
  RARITY,
  SPECIES,
  STAGE,
  creatureSpritePath,
  elementIconPath,
} from "@/utils/portage";

/**
 * Shared creature card — species name, rarity badge (colored border), stage
 * label, a compact stat row (HP / ATK / DEF / SPD) and an exp bar toward the
 * next evolution threshold. Used by the Caravan, Marketplace and Portal (which
 * may pass a footer).
 */
export default function CreatureCard({
  creature,
  footer,
  className,
  onOpen,
}: {
  creature: Creature;
  footer?: ReactNode;
  /** Extra animation classes (e.g. hatch reveal, evolution sparkle). */
  className?: string;
  /** Open the creature detail modal (makes the card clickable). */
  onOpen?: () => void;
}) {
  const species = SPECIES[creature.species];
  const rarity = RARITY[creature.rarity];
  const stage = STAGE[creature.stage];
  const next = EXP_THRESHOLDS[creature.stage];
  const pct = next === null ? 100 : Math.min(100, Math.round((creature.exp / next) * 100));

  // The rarity color is exposed as a CSS custom property so the card name can
  // pick up a rarity-tinted shimmer/gradient for Epic+ creatures (pure CSS).
  const cardStyle = {
    borderColor: rarity.borderColor,
    boxShadow: `inset 0 0 0 1px ${rarity.borderColor}, 0 14px 34px -22px ${rarity.glow}, 0 0 22px -6px ${rarity.glow}`,
    "--rarity-color": rarity.color,
  } as CSSProperties;

  // Enter / Space open the detail modal only when the card itself is focused
  // (not one of its footer buttons, which have their own handlers).
  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (!onOpen) return;
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  }

  return (
    <article
      className={[styles.card, onOpen ? styles.cardClickable : "", className]
        .filter(Boolean)
        .join(" ")}
      data-rarity={creature.rarity}
      style={cardStyle}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      tabIndex={onOpen ? 0 : undefined}
      aria-haspopup={onOpen ? "dialog" : undefined}
    >
      <div className={styles.cardTop}>
        <span className={styles.cardId}>#{creature.tokenId}</span>
        <span className={styles.stagePill}>{stage.label}</span>
      </div>

      <div className={styles.spriteWrap}>
        <Image
          className={styles.spriteImg}
          src={creatureSpritePath(creature.species, creature.stage)}
          alt={`${species.label} ${stage.label} sprite`}
          width={96}
          height={96}
          unoptimized
        />
      </div>

      <h3 className={styles.cardName}>{species.label}</h3>
      <p className={styles.cardSub}>
        {species.example} · {species.element}
      </p>

      <div className={styles.badgeRow}>
        <span
          className={styles.rarityBadge}
          style={{ color: rarity.color, borderColor: rarity.borderColor }}
        >
          {rarity.label}
        </span>
        <span className={styles.elementBadge} title={`${species.element} element`}>
          <Image
            src={elementIconPath(creature.species)}
            alt=""
            width={16}
            height={16}
            unoptimized
            aria-hidden
          />
          {species.element}
        </span>
      </div>

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

      {footer ? (
        // Stop footer button clicks from bubbling up and opening the modal.
        <div className={styles.cardFooter} onClick={(e) => e.stopPropagation()}>
          {footer}
        </div>
      ) : null}
    </article>
  );
}
