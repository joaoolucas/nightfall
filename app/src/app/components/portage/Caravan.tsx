"use client";

import styles from "./portage.module.css";
import { MOCK_CREATURES } from "@/utils/creatures";
import CreatureCard from "./CreatureCard";

/** Your caravan — the creature lineup grid (home view, SPEC §7). */
export default function Caravan() {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <p className={styles.kicker}>Your caravan</p>
        <h2 className={styles.title}>Creature lineup</h2>
        <p className={styles.sub}>
          {MOCK_CREATURES.length} creatures portaged home across six biomes.
        </p>
      </header>

      <div className={styles.grid}>
        {MOCK_CREATURES.map((creature) => (
          <CreatureCard key={creature.tokenId} creature={creature} />
        ))}
      </div>
    </section>
  );
}
