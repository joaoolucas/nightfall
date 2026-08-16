"use client";

import { useState } from "react";
import styles from "./portage.module.css";
import { MOCK_CREATURES, type Creature } from "@/utils/creatures";
import CreatureCard from "./CreatureCard";
import { hasPortageContract, PortageClient, randomFeltSeed } from "@/utils/portage-client";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";

/**
 * Portal — the hatch section (SPEC §7). With a contract configured and a wallet
 * connected, "Open Portal" submits a real `hatch(account, seed)` tx with a
 * client-random felt252 seed. Without a contract it falls back to the mock
 * reveal so the demo keeps working.
 */
export default function Portal() {
  const onChain = hasPortageContract();
  const account = useStoreWallet((s) => s.account);
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const isConnected = useStoreWallet((s) => s.isConnected);

  const [revealed, setRevealed] = useState<Creature | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    if (opening) return;
    setError(null);

    // On-chain hatch — needs a contract + a connected wallet.
    if (onChain) {
      const wallet = account ?? myWalletAccount;
      if (!wallet) {
        setError("Connect a wallet to hatch on-chain.");
        return;
      }
      setOpening(true);
      setTxHash(null);
      try {
        const client = new PortageClient(wallet);
        const res = await client.hatch(wallet, randomFeltSeed());
        setTxHash(res.transaction_hash);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setOpening(false);
      }
      return;
    }

    // Mock reveal beat: a short "portal opening", then a random creature drops.
    setOpening(true);
    setRevealed(null);
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
        <span className={`${styles.badge} ${onChain ? styles.badgeOn : styles.badgeDemo}`}>
          <span className={styles.proofDot} aria-hidden />
          {onChain ? "On-chain" : "Demo"}
        </span>
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

        {!onChain && isConnected && (
          <p className={styles.notice}>
            No Portage contract is configured — hatching runs in demo mode.
          </p>
        )}

        {opening ? (
          <div className={styles.revealPlaceholder}>
            <span className={styles.revealPulse} aria-hidden />
            <p>A tear in the dark is widening…</p>
          </div>
        ) : txHash ? (
          <div className={styles.reveal}>
            <span className={styles.proofBadge}>
              <span className={styles.proofDot} aria-hidden />
              Hatched on-chain — tx {txHash.slice(0, 10)}…{txHash.slice(-6)}
            </span>
            <p className={styles.notice}>Your new creature is joining the caravan.</p>
          </div>
        ) : revealed ? (
          <div className={styles.reveal}>
            <CreatureCard creature={revealed} />
            <span className={styles.proofBadge}>
              <span className={styles.proofDot} aria-hidden />
              Demo reveal — no chain
            </span>
          </div>
        ) : null}

        {error ? <p className={`${styles.notice} ${styles.noticeError}`}>{error}</p> : null}
      </div>
    </section>
  );
}
