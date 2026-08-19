"use client";

import { useState } from "react";
import styles from "./portage.module.css";
import { MOCK_CREATURES, type Creature } from "@/utils/creatures";
import CreatureCard from "./CreatureCard";
import {
  MEADOW_BACKGROUND_PATH,
  biomeBackgroundPath,
} from "@/utils/portage";
import {
  hasPortageContract,
  hatchDigest,
  PortageClient,
  randomFeltSeed,
  REVEAL_DELAY,
} from "@/utils/portage-client";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";

/**
 * Portal — the hatch section (SPEC §7).
 *
 * Hatching is two transactions now, because one was grindable: "Open Portal"
 * commits `poseidon(secret, caller)`, and the creature is only rolled when the
 * secret is revealed at least REVEAL_DELAY blocks later, against a block hash
 * that did not exist when the promise was made. Without a contract configured
 * it falls back to the mock reveal so the demo keeps working.
 */

/** Where the unrevealed secret waits. Losing it forfeits the commitment. */
const PENDING_HATCH_KEY = "portage-pending-hatch";
export default function Portal() {
  const onChain = hasPortageContract();
  const account = useStoreWallet((s) => s.account);
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const isConnected = useStoreWallet((s) => s.isConnected);

  const [revealed, setRevealed] = useState<Creature | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [hatching, setHatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);

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
      setHatching(true);
      setTxHash(null);
      try {
        const client = new PortageClient(wallet);
        // Two phases now, and the secret is the whole thing: lose it and the
        // commitment can never be revealed. It is written down before the
        // transaction is sent, so a wallet rejection or a closed tab after
        // signing still leaves something to redeem.
        const secret = randomFeltSeed();
        const digest = hatchDigest(secret, wallet.address);
        window.localStorage.setItem(
          PENDING_HATCH_KEY,
          JSON.stringify({ secret, digest, address: wallet.address }),
        );
        const res = await client.commitHatch(wallet, digest);
        setTxHash(res.transaction_hash);
        setPendingSecret(secret);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setOpening(false);
        setHatching(false);
      }
      return;
    }

    // Mock reveal beat: a 1.2s "portal opening" (swirling ring + pulsing glow),
    // then a random creature drops with a scale-in reveal.
    setOpening(true);
    setHatching(true);
    setRevealed(null);
    window.setTimeout(() => {
      const pick = MOCK_CREATURES[Math.floor(Math.random() * MOCK_CREATURES.length)];
      setRevealed(pick);
      setOpening(false);
      setHatching(false);
    }, 1200);
  }

  async function revealHatch() {
    if (opening || !pendingSecret) return;
    const wallet = account ?? myWalletAccount;
    if (!wallet) {
      setError("Connect the wallet that made the commitment.");
      return;
    }
    setError(null);
    setOpening(true);
    try {
      const client = new PortageClient(wallet);
      const res = await client.revealHatch(wallet, pendingSecret);
      setTxHash(res.transaction_hash);
      // Only now is the promise spent, so only now is the secret safe to drop.
      window.localStorage.removeItem(PENDING_HATCH_KEY);
      setPendingSecret(null);
    } catch (err) {
      // TOO_EARLY means the wait is not over; the secret must survive it.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOpening(false);
    }
  }

  // Show the revealed creature's biome behind the portal, or the neutral
  // meadow while waiting for a hatch.
  const biomeBg = revealed
    ? biomeBackgroundPath(revealed.species)
    : MEADOW_BACKGROUND_PATH;

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <p className={styles.kicker}>Hatch</p>
        <h2 className={styles.title}>Open a portal</h2>
        <p className={styles.sub}>
          Hatching takes two steps. Opening the portal publishes a sealed promise; the creature
          is rolled when you break the seal, at least {REVEAL_DELAY} blocks later, against a
          block hash that did not exist when you made it. Nobody — you included — can know the
          outcome in advance.
        </p>
        <span className={`${styles.badge} ${onChain ? styles.badgeOn : styles.badgeDemo}`}>
          <span className={styles.proofDot} aria-hidden />
          {onChain ? "On-chain" : "Demo"}
        </span>
      </header>

      <div className={styles.portal} style={{ backgroundImage: `url(${biomeBg})` }}>
        <span className={styles.portalOverlay} aria-hidden />

        <button
          type="button"
          className={styles.portalButton}
          onClick={openPortal}
          disabled={opening}
        >
          {opening ? "Opening portal…" : pendingSecret ? "Portal sealed" : "Open Portal"}
        </button>

        {pendingSecret ? (
          <button
            type="button"
            className={styles.portalButton}
            onClick={revealHatch}
            disabled={opening}
          >
            Break the seal
          </button>
        ) : null}

        {!onChain && isConnected && (
          <p className={styles.notice}>
            No Portage contract is configured — hatching runs in demo mode.
          </p>
        )}

        {hatching ? (
          <div className={styles.revealPlaceholder}>
            <span className={styles.portalRingWrap} aria-hidden>
              <span className={styles.portalRing} />
              <span className={styles.revealPulse} />
            </span>
            <p>A tear in the dark is widening…</p>
          </div>
        ) : txHash ? (
          <div className={styles.reveal}>
            <span className={styles.proofBadge}>
              <span className={styles.proofDot} aria-hidden />
              {pendingSecret ? "Promise sealed" : "Seal broken"} — tx {txHash.slice(0, 10)}…
              {txHash.slice(-6)}
            </span>
            <p className={styles.notice}>
              {pendingSecret
                ? `Wait ${REVEAL_DELAY} blocks, then break the seal. Keep this tab: the secret that opens your promise lives only in this browser.`
                : "Your new creature is joining the caravan."}
            </p>
          </div>
        ) : revealed ? (
          <div className={styles.reveal}>
            <CreatureCard creature={revealed} className={styles.revealCard} />
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
