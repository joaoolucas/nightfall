"use client";

import { useState } from "react";
import { num } from "starknet";
import styles from "./portage.module.css";
import CreatureCard from "./CreatureCard";
import CreatureDetail from "./CreatureDetail";
import { usePortageState } from "./usePortageState";
import { EXP_THRESHOLDS } from "@/utils/portage";
import { PortageClient } from "@/utils/portage-client";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import type { Creature } from "@/utils/creatures";

/** Your caravan — the creature lineup grid (home view, SPEC §7). */
export default function Caravan() {
  const { onChain, loading, error, totalSupply, creatures, refresh } = usePortageState();
  const account = useStoreWallet((s) => s.account);
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const address = useStoreWallet((s) => s.address);
  const isConnected = useStoreWallet((s) => s.isConnected);
  const provider = useStoreWallet((s) => s.provider);

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sparkle, setSparkle] = useState<string | null>(null);
  const [selected, setSelected] = useState<Creature | null>(null);

  const count = onChain ? totalSupply : creatures.length;

  function owns(owner: string): boolean {
    if (!address) return false;
    try {
      return num.toBigInt(owner) === num.toBigInt(address);
    } catch {
      return false;
    }
  }

  async function run(creature: Creature, action: "evolve" | "expedition") {
    const wallet = account ?? myWalletAccount;
    if (!wallet) {
      setNotice("Connect a wallet.");
      return;
    }
    setBusy(`${action}:${creature.tokenId}`);
    setNotice(null);
    try {
      const client = new PortageClient(wallet);
      const res =
        action === "evolve"
          ? await client.evolve(wallet, creature.tokenId)
          : await client.expedition(wallet, creature.tokenId);
      // Wait for the tx so refresh() reads post-tx state, not pre-tx.
      if (provider) {
        try {
          await provider.waitForTransaction(res.transaction_hash);
        } catch {
          /* refresh anyway */
        }
      }
      refresh();
      // Evolution sparkle: briefly burst the card that just evolved.
      if (action === "evolve") {
        const key = `${creature.tokenId}`;
        setSparkle(key);
        window.setTimeout(() => {
          setSparkle((current) => (current === key ? null : current));
        }, 1000);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <p className={styles.kicker}>Your caravan</p>
        <h2 className={styles.title}>Creature lineup</h2>
        <p className={styles.sub}>
          {count} creatures portaged home across six biomes.
        </p>
        <span className={`${styles.badge} ${onChain ? styles.badgeOn : styles.badgeDemo}`}>
          <span className={styles.proofDot} aria-hidden />
          {onChain ? "On-chain" : "Demo"}
        </span>
      </header>

      {loading ? (
        <p className={styles.notice}>Summoning the caravan from the chain…</p>
      ) : (
        <div className={styles.grid}>
          {creatures.map((creature) => {
            const next = EXP_THRESHOLDS[creature.stage];
            const isOwner = owns(creature.owner);
            const canEvolve = next !== null && creature.exp >= next;
            const ownerOnChain = onChain && isConnected && isOwner;
            const evolveEnabled = ownerOnChain && canEvolve && busy === null;
            const expeditionEnabled = ownerOnChain && next !== null && busy === null;
            const key = `${creature.tokenId}`;

            return (
              <CreatureCard
                key={creature.tokenId}
                creature={creature}
                className={sparkle === key ? styles.sparkleBurst : undefined}
                onOpen={() => setSelected(creature)}
                footer={
                  ownerOnChain && next !== null ? (
                    <div className={styles.evolveRow}>
                      <button
                        type="button"
                        className={styles.expeditionBtn}
                        onClick={() => run(creature, "expedition")}
                        disabled={!expeditionEnabled}
                      >
                        {busy === `expedition:${key}` ? "Exploring…" : "Expedition"}
                      </button>
                      <button
                        type="button"
                        className={styles.evolveBtn}
                        onClick={() => run(creature, "evolve")}
                        disabled={!evolveEnabled}
                      >
                        {busy === `evolve:${key}` ? "Evolving…" : "Evolve"}
                      </button>
                    </div>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}

      {error ? <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p> : null}
      {notice ? <p className={`${styles.notice} ${styles.noticeError}`}>{notice}</p> : null}

      {selected ? (
        <CreatureDetail creature={selected} onClose={() => setSelected(null)} />
      ) : null}
    </section>
  );
}
