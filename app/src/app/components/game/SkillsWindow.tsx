"use client";

import { expForLevel, handlingBonus, playerDefense, triesForSkill } from "@/game/sim/state";
import type { SkillId } from "@/game/core/types";
import GameWindow from "./GameWindow";
import type { GameSim } from "./useGameSim";
import styles from "./client.module.css";

/**
 * Skills, and what each of them actually does.
 *
 * They were three numbers in a 60px box with no units and no explanation. A
 * skill that rises by use is only motivating if you can see it rising and know
 * what it buys, so each one now shows its progress toward the next level and
 * the effect it is having right now.
 */

const SKILLS: readonly { id: SkillId; label: string; blurb: (state: GameSim["state"]) => string }[] = [
  {
    id: "melee",
    label: "Handling",
    blurb: (state) => `Adds ${Math.round(handlingBonus(state))} attack to the creature in the field.`,
  },
  {
    id: "shielding",
    label: "Shielding",
    blurb: (state) => `Turns ${Math.round(playerDefense(state))} damage away from you each blow.`,
  },
  {
    id: "vitality",
    label: "Vitality",
    blurb: () => "Raises the health you carry into a fight.",
  },
];

export default function SkillsWindow({ sim, onClose }: { sim: GameSim; onClose: () => void }) {
  const { progress, kills, deaths, playSeconds } = sim.state;
  const nextLevel = expForLevel(progress.level);
  const hours = Math.floor(playSeconds / 3600);
  const minutes = Math.floor((playSeconds % 3600) / 60);

  return (
    <GameWindow title="Skills" subtitle={`level ${progress.level}`} onClose={onClose}>
      <div className={styles.skillRow}>
        <div className={styles.skillHead}>
          <b>Experience</b>
          <span>
            {progress.exp.toLocaleString()} / {nextLevel.toLocaleString()}
          </span>
        </div>
        <span className={`${styles.bar} ${styles.bar_exp}`}>
          <i style={{ width: `${Math.min(100, (progress.exp / nextLevel) * 100)}%` }} />
        </span>
      </div>

      {SKILLS.map((skill) => {
        const level = progress.skills[skill.id];
        const tries = progress.skillTries[skill.id];
        const needed = triesForSkill(level);
        return (
          <div key={skill.id} className={styles.skillRow}>
            <div className={styles.skillHead}>
              <b>{skill.label}</b>
              <span>{level}</span>
            </div>
            <span className={`${styles.bar} ${styles.bar_skill}`}>
              <i style={{ width: `${Math.min(100, (tries / needed) * 100)}%` }} />
            </span>
            <p>{skill.blurb(sim.state)}</p>
          </div>
        );
      })}

      <div className={styles.skillTally}>
        <div>
          <span>Kills</span>
          <b>{kills.toLocaleString()}</b>
        </div>
        <div>
          <span>Deaths</span>
          <b>{deaths.toLocaleString()}</b>
        </div>
        <div>
          <span>Time afield</span>
          <b>
            {hours}h {String(minutes).padStart(2, "0")}m
          </b>
        </div>
      </div>
    </GameWindow>
  );
}
