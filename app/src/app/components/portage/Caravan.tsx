"use client";

import { useState } from "react";
import { num } from "starknet";
import styles from "./portage.module.css";
import CreatureCard from "./CreatureCard";
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

  const [evolving, setEvolving] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const count = onChain ? totalSupply : creatures.length;

  function owns(owner: string): boolean {
    if (!address) return false;
    try {
      return num.toBigInt(owner) === num.toBigInt(address);
    } catch {
      return false;
    }
  }

  async function evolve(creature: Creature) {
    const wallet = account ?? myWalletAccount;
    if (!wallet) {
      setNotice("Connect a wallet to evolve.");
      return;
    }
    setEvolving(creature.tokenId);
    setNotice(null);
    try {
      const client = new PortageClient(wallet);
      await client.evolve(wallet, creature.tokenId);
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setEvolving(null);
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
            const canEvolve = next !== null && creature.exp >= next;
            const isOwner = owns(creature.owner);
            const enabled =
              onChain && isConnected && canEvolve && isOwner && evolving !== creature.tokenId;

            return (
              <CreatureCard
                key={creature.tokenId}
                creature={creature}
                footer={
                  next !== null ? (
                    <div className={styles.evolveRow}>
                      <button
                        type="button"
                        className={styles.evolveBtn}
                        onClick={() => evolve(creature)}
                        disabled={!enabled}
                      >
                        {evolving === creature.tokenId ? "Evolving…" : "Evolve"}
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
    </section>
  );
}
