"use client";

import { expForLevel, handlingBonus, playerDefense, triesForSkill } from "@/game/sim/state";
import type { SkillId } from "@/game/core/types";
import GameWindow from "./GameWindow";
import UiIcon, { type UiIconName } from "./UiIcon";
import type { GameSim } from "./useGameSim";
import styles from "./client.module.css";

/**
 * Skills, and what each of them actually does.
 *
 * They were three numbers in a 60px box with no units and no explanation. A
 * skill that rises by use is only motivating if you can see it rising and know
 * what it buys, so each one shows its progress toward the next level and the
 * effect it is having right now.
 */

const SKILLS: readonly { id: SkillId; label: string; icon: UiIconName; blurb: (state: GameSim["state"]) => string }[] = [
  {
    id: "melee",
    label: "Handling",
    icon: "handling",
    blurb: (state) => `Adds ${Math.round(handlingBonus(state))} attack to the creature in the field.`,
  },
  {
    id: "shielding",
    label: "Shielding",
    icon: "shield",
    blurb: (state) => `Turns ${Math.round(playerDefense(state))} damage away from you each blow.`,
  },
  {
    id: "vitality",
    label: "Vitality",
    icon: "vitality",
    blurb: () => "Raises the health you carry into a fight.",
  },
];

export default function SkillsWindow({ sim, onClose }: { sim: GameSim; onClose: () => void }) {
  const { progress, kills, deaths, playSeconds } = sim.state;
  const nextLevel = expForLevel(progress.level);
  const hours = Math.floor(playSeconds / 3600);
  const minutes = Math.floor((playSeconds % 3600) / 60);

  return (
    <GameWindow title="Skills" subtitle={`Level ${progress.level}`} onClose={onClose}>
      <div className={styles.skillRow}>
        <UiIcon name="exp" />
        <div>
          <div className={styles.skillHead}>
            <b>Experience</b>
            <span>{progress.exp.toLocaleString()} / {nextLevel.toLocaleString()}</span>
          </div>
          <span className={`${styles.bar} ${styles.bar_exp}`}>
            <i style={{ width: `${Math.min(100, (progress.exp / nextLevel) * 100)}%` }} />
          </span>
        </div>
      </div>

      {SKILLS.map((skill) => {
        const level = progress.skills[skill.id];
        const needed = triesForSkill(level);
        const tries = progress.skillTries[skill.id];
        return (
          <div key={skill.id} className={styles.skillRow}>
            <UiIcon name={skill.icon} />
            <div>
              <div className={styles.skillHead}>
                <b>{skill.label}</b>
                <span>{level}</span>
              </div>
              <span className={`${styles.bar} ${styles.bar_skill}`}>
                <i style={{ width: `${Math.min(100, (tries / needed) * 100)}%` }} />
              </span>
              <p>{skill.blurb(sim.state)}</p>
            </div>
          </div>
        );
      })}

      <div className={styles.skillTally}>
        <div>
          <UiIcon name="attack" />
          <span>Kills<b>{kills.toLocaleString()}</b></span>
        </div>
        <div>
          <UiIcon name="skull" />
          <span>Deaths<b>{deaths.toLocaleString()}</b></span>
        </div>
        <div>
          <UiIcon name="hourglass" />
          <span>Afield<b>{hours}h {String(minutes).padStart(2, "0")}m</b></span>
        </div>
      </div>
    </GameWindow>
  );
}
