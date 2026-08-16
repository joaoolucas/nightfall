"use client";

import type { CSSProperties } from 'react';
import styles from './uni.module.css';
import gameStyles from './components/game/nightfall.module.css';
import SelectWallet from './components/client/WalletHandle/SelectWallet';
import WalletAccountV6Tag from './components/client/WalletHandle/WalletAccountV6Tag';
import GameTable from './components/game/GameTable';
import Lobby from './components/game/Lobby';
import { StrkCoin, BtcCoin, EthCoin, UsdcCoin, ZecCoin } from './components/TokenIcons';

// Scattered, blurred token coins on the sides of the page (background ambience).
type BgToken = {
  Coin: (p: { size?: number }) => React.ReactElement;
  pos: CSSProperties;
  size: number;
  blur: number;
  opacity: number;
};
const BG_TOKENS: BgToken[] = [
  // Left edge
  { Coin: StrkCoin, pos: { top: '30%', left: '3%' }, size: 116, blur: 5, opacity: 0.55 },
  { Coin: BtcCoin, pos: { top: '38%', left: '18%' }, size: 92, blur: 4, opacity: 0.5 },
  { Coin: ZecCoin, pos: { top: '64%', left: '9%' }, size: 140, blur: 6, opacity: 0.5 },
  { Coin: EthCoin, pos: { top: '11%', left: '22%' }, size: 84, blur: 4, opacity: 0.5 },
  { Coin: UsdcCoin, pos: { top: '86%', left: '20%' }, size: 104, blur: 5, opacity: 0.5 },
  // Right edge
  { Coin: EthCoin, pos: { top: '7%', right: '18%' }, size: 128, blur: 5, opacity: 0.55 },
  { Coin: BtcCoin, pos: { top: '12%', right: '4%' }, size: 96, blur: 4, opacity: 0.5 },
  { Coin: StrkCoin, pos: { top: '54%', right: '6%' }, size: 132, blur: 6, opacity: 0.55 },
  { Coin: UsdcCoin, pos: { top: '76%', right: '9%' }, size: 104, blur: 5, opacity: 0.5 },
  { Coin: ZecCoin, pos: { top: '88%', right: '20%' }, size: 100, blur: 5, opacity: 0.48 },
  // Center accents (top & bottom)
  { Coin: BtcCoin, pos: { top: '5%', left: '42%' }, size: 116, blur: 5, opacity: 0.45 },
  { Coin: StrkCoin, pos: { bottom: '-1%', left: '48%' }, size: 124, blur: 6, opacity: 0.48 },
];

export default function Page() {
  return (
    <div className={styles.page}>
      <div className={styles.aurora} aria-hidden>
        {BG_TOKENS.map((t, i) => (
          <span
            key={i}
            className={styles.tok}
            style={{ ...t.pos, filter: `blur(${t.blur}px)`, opacity: t.opacity }}
          >
            <t.Coin size={t.size} />
          </span>
        ))}
      </div>

      <nav className={styles.nav}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tokens/strk20.png" alt="STRK20" className={styles.brandImg} />
          <span>Nightfall</span>
        </div>
        <SelectWallet variant="nav" />
      </nav>

      <header className={styles.hero}>
        <h1 className={styles.heroTitle}>
          Nightfall
          <br />
          <span className={styles.heroAccent}>One Night</span>
        </h1>
        <p className={styles.heroSub}>
          Provably-fair social deduction on Starknet. Stake STRK, deal hidden roles
          as encrypted notes, and hunt the werewolves — knowing the house can&apos;t cheat.
        </p>
      </header>

      <main>
        <GameTable />
        <Lobby />

        {/* STRK20 actions — shield / unshield / private transfer / echo. Kept intact
            for Day 0 scoring (shield + first mainnet tx). */}
        <section className={gameStyles.section} style={{ marginTop: 28 }} aria-label="STRK20 actions">
          <h2 className={gameStyles.sectionTitle}>STRK20 actions</h2>
          <WalletAccountV6Tag />
        </section>
      </main>

      <footer className={styles.footer}>
        <a href="https://strk20.starknet.io" target="_blank" rel="noreferrer">
          STRK20
        </a>
        <span className={styles.footerDot}>·</span>
        <span>Nightfall: One Night — powered by Starknet.js v10.4.0</span>
      </footer>
    </div>
  );
}
