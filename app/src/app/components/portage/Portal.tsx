"use client";

import { useState } from "react";
import styles from "./portage.module.css";
import { MOCK_CREATURES, type Creature } from "@/utils/creatures";
import CreatureCard from "./CreatureCard";

/**
 * Portal — the hatch section (SPEC §7). A client-side mock: "Open Portal" picks
 * a random creature from the mock set and reveals it, with an on-chain proof
 * placeholder badge (the real hatch ABI does not exist yet).
 */
export default function Portal() {
  const [revealed, setRevealed] = useState<Creature | null>(null);
  const [opening, setOpening] = useState(false);

  function openPortal() {
    if (opening) return;
    setOpening(true);
    setRevealed(null);
    // Mock reveal beat: a short "portal opening", then a random creature drops.
    window.setTimeout(() => {
      const pick = MOCK_CREATURES[Math.floor(Math.random() * MOCK_CREATURES.length)];
      setRevealed(pick);
      setOpening(false);
    }, 900);
  }

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <p className={styles.kicker}>Hatch</p>
        <h2 className={styles.title}>Open a portal</h2>
        <p className={styles.sub}>
          Spend portal energy to conjure a creature. The rarity drop is provably
          fair — committed and verifiable on-chain.
        </p>
      </header>

      <div className={styles.portal}>
        <button
          type="button"
          className={styles.portalButton}
          onClick={openPortal}
          disabled={opening}
        >
          {opening ? "Opening portal…" : "Open Portal"}
        </button>

        {opening ? (
          <div className={styles.revealPlaceholder}>
            <span className={styles.revealPulse} aria-hidden />
            <p>A tear in the dark is widening…</p>
          </div>
        ) : revealed ? (
          <div className={styles.reveal}>
            <CreatureCard creature={revealed} />
            <span className={styles.proofBadge}>
              <span className={styles.proofDot} aria-hidden />
              On-chain proof — placeholder
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
