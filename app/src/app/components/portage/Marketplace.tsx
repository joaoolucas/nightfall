"use client";

import { useState } from "react";
import { num } from "starknet";
import styles from "./portage.module.css";
import { MOCK_CREATURES, type Creature } from "@/utils/creatures";
import type { Rarity } from "@/utils/portage";
import CreatureCard from "./CreatureCard";
import { PortageClient } from "@/utils/portage-client";
import { useStoreWallet } from "@/app/components/Wallet/walletContext";
import { usePortageState } from "./usePortageState";

// Ask prices keyed by rarity. Demo-mode uses these as fake prices; on-chain
// mode uses them as the `list(token_id, price)` u128 ask (small ints for now).
const MOCK_PRICES: Record<Rarity, number> = {
  common: 12,
  uncommon: 45,
  rare: 120,
  epic: 320,
  legendary: 900,
  mythic: 2400,
};

/** Marketplace — creature grid with a list/buy/cancel action and prices. */
export default function Marketplace() {
  const { onChain, loading, creatures } = usePortageState();
  const account = useStoreWallet((s) => s.account);
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const address = useStoreWallet((s) => s.address);
  const isConnected = useStoreWallet((s) => s.isConnected);

  // tokenId → currently listed (client-side mirror; demo toggles it, on-chain
  // flips it after the list/buy/cancel tx is submitted).
  const [listed, setListed] = useState<Record<number, boolean>>({});
  const [pending, setPending] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const items = onChain ? creatures : MOCK_CREATURES;

  function owns(creature: Creature): boolean {
    if (!address) return false;
    try {
      return num.toBigInt(creature.owner) === num.toBigInt(address);
    } catch {
      return false;
    }
  }

  async function handleClick(creature: Creature) {
    const tokenId = creature.tokenId;
    if (!onChain) {
      // Demo toggle — no chain involved.
      setListed((prev) => ({ ...prev, [tokenId]: !prev[tokenId] }));
      return;
    }
    if (!isConnected) {
      setNotice("Connect a wallet to trade on-chain.");
      return;
    }
    const wallet = account ?? myWalletAccount;
    if (!wallet) {
      setNotice("Connect a wallet to trade on-chain.");
      return;
    }

    const isListed = !!listed[tokenId];
    const isOwner = owns(creature);
    if (!isListed && !isOwner) {
      setNotice("Only the owner can list a creature.");
      return;
    }

    setPending(tokenId);
    setNotice(null);
    try {
      const client = new PortageClient(wallet);
      if (!isListed) {
        await client.list(wallet, tokenId, MOCK_PRICES[creature.rarity]);
      } else if (isOwner) {
        await client.cancel(wallet, tokenId);
      } else {
        await client.buy(wallet, tokenId);
      }
      setListed((prev) => ({ ...prev, [tokenId]: !isListed }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <p className={styles.kicker}>Marketplace</p>
        <h2 className={styles.title}>Trade creatures</h2>
        <p className={styles.sub}>
          List your creatures for STRK or buy from other Porters.
          {onChain ? " Settlement happens on-chain." : " Mock prices — on-chain settlement lands with the marketplace contract."}
        </p>
        <span className={`${styles.badge} ${onChain ? styles.badgeOn : styles.badgeDemo}`}>
          <span className={styles.proofDot} aria-hidden />
          {onChain ? "On-chain" : "Demo"}
        </span>
      </header>

      {onChain && loading ? (
        <p className={styles.notice}>Loading listings from the chain…</p>
      ) : (
        <div className={styles.grid}>
        {items.map((creature) => {
          const tokenId = creature.tokenId;
          const isListed = !!listed[tokenId];
          const isOwner = owns(creature);
          const price = MOCK_PRICES[creature.rarity];
          const busy = pending === tokenId;

          let label: string;
          let btnClass: string;
          let disabled = busy;
          if (onChain) {
            if (!isListed) {
              label = "List";
              btnClass = styles.listBtn;
              disabled = busy || !isOwner || !isConnected;
            } else if (isOwner) {
              label = "Cancel";
              btnClass = styles.cancelBtn;
            } else {
              label = "Buy";
              btnClass = styles.buyBtn;
              disabled = busy || !isConnected;
            }
          } else {
            label = isListed ? "Buy" : "List";
            btnClass = isListed ? styles.buyBtn : styles.listBtn;
          }

          return (
            <CreatureCard
              key={tokenId}
              creature={creature}
              footer={
                <div className={styles.market}>
                  <span className={styles.price}>
                    {price} <b>STRK</b>
                  </span>
                  <button
                    type="button"
                    className={btnClass}
                    onClick={() => handleClick(creature)}
                    disabled={disabled}
                  >
                    {busy ? "…" : label}
                  </button>
                </div>
              }
            />
          );
        })}
        </div>
      )}

      {notice ? <p className={`${styles.notice} ${styles.noticeError}`}>{notice}</p> : null}
    </section>
  );
}
