"use client";

import { useState } from "react";
import styles from "./portage.module.css";
import { MOCK_CREATURES } from "@/utils/creatures";
import type { Rarity } from "@/utils/portage";
import CreatureCard from "./CreatureCard";

// Fake STRK ask prices keyed by rarity — placeholder until the marketplace ABI
// and real settlement exist.
const MOCK_PRICES: Record<Rarity, number> = {
  common: 12,
  uncommon: 45,
  rare: 120,
  epic: 320,
  legendary: 900,
  mythic: 2400,
};

/** Marketplace — mock creature grid with a list/buy toggle and fake STRK prices. */
export default function Marketplace() {
  // tokenId → is currently listed (mock). No on-chain listing/settlement yet.
  const [listed, setListed] = useState<Record<number, boolean>>({});

  function toggle(tokenId: number) {
    setListed((prev) => ({ ...prev, [tokenId]: !prev[tokenId] }));
  }

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <p className={styles.kicker}>Marketplace</p>
        <h2 className={styles.title}>Trade creatures</h2>
        <p className={styles.sub}>
          List your creatures for STRK or buy from other Porters. Mock prices —
          on-chain settlement lands with the marketplace contract.
        </p>
      </header>

      <div className={styles.grid}>
        {MOCK_CREATURES.map((creature) => {
          const isListed = !!listed[creature.tokenId];
          const price = MOCK_PRICES[creature.rarity];
          return (
            <CreatureCard
              key={creature.tokenId}
              creature={creature}
              footer={
                <div className={styles.market}>
                  <span className={styles.price}>
                    {price} <b>STRK</b>
                  </span>
                  <button
                    type="button"
                    className={isListed ? styles.buyBtn : styles.listBtn}
                    onClick={() => toggle(creature.tokenId)}
                  >
                    {isListed ? "Buy" : "List"}
                  </button>
                </div>
              }
            />
          );
        })}
      </div>
    </section>
  );
}
