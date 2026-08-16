"use client";

import { Fragment, useEffect } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import styles from "./portage.module.css";
import type { Creature } from "@/utils/creatures";
import {
  EXP_THRESHOLDS,
  LORE,
  RARITY,
  SPECIES,
  STAGE,
  STAGE_LIST,
  creatureSpritePath,
  elementIconPath,
} from "@/utils/portage";

/**
 * Creature detail modal — large sprite, species/example name, element + rarity
 * badges, full stat block, exp + stage progression (Hatchling → Adult → Legend
 * with thresholds 100/500), owner address and a one-line species lore.
 *
 * Closes on backdrop click, the ✕ button, or the Escape key.
 */
export default function CreatureDetail({
  creature,
  onClose,
}: {
  creature: Creature;
  onClose: () => void;
}) {
  // Escape-to-close, registered for the lifetime of the open modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const species = SPECIES[creature.species];
  const rarity = RARITY[creature.rarity];
  const stage = STAGE[creature.stage];
  const next = EXP_THRESHOLDS[creature.stage];
  const pct = next === null ? 100 : Math.min(100, Math.round((creature.exp / next) * 100));
  const stageIndex = STAGE_LIST.indexOf(creature.stage);

  const modalStyle = {
    borderColor: rarity.borderColor,
    boxShadow: `inset 0 0 0 1px ${rarity.borderColor}, 0 0 46px -8px ${rarity.glow}`,
    "--rarity-color": rarity.color,
  } as CSSProperties;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`${species.label} ${stage.label} details`}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.modalClose}
          onClick={onClose}
          aria-label="Close details"
        >
          ×
        </button>

        <div className={styles.modalSpriteWrap}>
          <Image
            className={styles.modalSprite}
            src={creatureSpritePath(creature.species, creature.stage)}
            alt={`${species.label} ${stage.label} sprite`}
            width={160}
            height={160}
            unoptimized
          />
        </div>

        <h3 className={styles.modalName}>{species.label}</h3>
        <p className={styles.modalSub}>
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

        <div className={styles.modalStats} aria-label="Creature stats">
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

        <p className={styles.modalLore}>{LORE[creature.species]}</p>

        <div className={styles.stageProgression} aria-label="Evolution stages">
          {STAGE_LIST.map((s, i) => {
            const isCurrent = s === creature.stage;
            const isPast = i < stageIndex;
            const threshold = i < STAGE_LIST.length - 1 ? EXP_THRESHOLDS[s] : null;

            return (
              <Fragment key={s}>
                <span
                  className={[
                    styles.stageStep,
                    isCurrent ? styles.stageStepCurrent : "",
                    isPast ? styles.stageStepDone : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span className={styles.stageDot} aria-hidden />
                  {STAGE[s].label}
                </span>
                {threshold !== null ? (
                  <span className={styles.stageConnector} aria-hidden>
                    {threshold} EXP →
                  </span>
                ) : null}
              </Fragment>
            );
          })}
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

        <p className={styles.modalOwner} title={creature.owner}>
          <span className={styles.modalOwnerLabel}>Owner</span>
          {creature.owner}
        </p>
      </div>
    </div>
  );
}
