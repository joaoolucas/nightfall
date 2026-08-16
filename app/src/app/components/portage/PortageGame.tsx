"use client";

import Image from "next/image";
import { useState } from "react";
import SelectWallet from "../client/WalletHandle/SelectWallet";
import WalletAccountV6Tag from "../client/WalletHandle/WalletAccountV6Tag";
import { useStoreWallet } from "../Wallet/walletContext";
import { creatureSpritePath, speciesLabel } from "@/utils/portage";
import { shortAddress } from "@/utils/creatures";
import Caravan from "./Caravan";
import Marketplace from "./Marketplace";
import Portal from "./Portal";
import { usePortageState } from "./usePortageState";
import ui from "../../uni.module.css";
import styles from "./game-shell.module.css";

type View = "portal" | "caravan" | "expeditions" | "market" | "privacy" | "proofs";

const NAV: { id: View; icon: string; label: string }[] = [
  { id: "portal", icon: "◉", label: "Portal" },
  { id: "caravan", icon: "▦", label: "Caravan" },
  { id: "expeditions", icon: "⌁", label: "Expeditions" },
  { id: "market", icon: "◇", label: "Market" },
  { id: "proofs", icon: "✓", label: "Proofs" },
  { id: "privacy", icon: "◆", label: "Privacy" },
];

function Kickoff({ onStart }: { onStart: () => void }) {
  return (
    <main className={styles.kickoff}>
      <div className={styles.kickoffStars} aria-hidden />
      <section className={styles.kickoffCard}>
        <div className={styles.kickoffLogoWrap}>
          <Image src="/game-assets/brand/logo.png" alt="Portage.fun" width={112} height={112} className={styles.pixelImage} priority />
        </div>
        <p className={styles.kickoffEyebrow}>KICKOFF // PORTAGE PROTOCOL</p>
        <h1 className={styles.kickoffTitle}>Carry wonder<br /><span>through the portal.</span></h1>
        <p className={styles.kickoffCopy}>
          Build a living caravan, explore six biomes and move STRK privately while your revealed creatures remain publicly yours.
        </p>
        <div className={styles.kickoffSteps}>
          <div><b>01</b><span>Open a portal</span><small>Preview the deterministic hatch loop</small></div>
          <div><b>02</b><span>Grow the caravan</span><small>Expeditions, EXP and evolution</small></div>
          <div><b>03</b><span>Choose privacy</span><small>Shield and send STRK through Ready</small></div>
        </div>
        <button type="button" className={styles.kickoffButton} onClick={onStart}>
          Begin your Portage <span>→</span>
        </button>
        <p className={styles.kickoffFoot}>No wallet required to explore the demo world.</p>
      </section>
    </main>
  );
}

function ProofPanel() {
  return (
    <section className={styles.infoPanel}>
      <p className={styles.panelKicker}>PROOF TERMINAL</p>
      <h2>Verify, don&apos;t trust.</h2>
      <div className={styles.proofGrid}>
        <article><span className={styles.statusAmber}>PROTOTYPE</span><b>Hatch entropy</b><p>Deterministic and recomputable, but caller-seeded. Commit/reveal is required before Mainnet.</p></article>
        <article><span className={styles.statusGreen}>FIXED</span><b>Rarity table</b><p>Species and rarity weights live in Cairo and are covered by the contract test suite.</p></article>
        <article><span className={styles.statusGreen}>PUBLIC</span><b>Creature provenance</b><p>Token traits, stage, EXP and final NFT owner remain visible on Starknet.</p></article>
        <article><span className={styles.statusViolet}>PRIVATE STRK</span><b>Payment layer</b><p>Wallet-managed notes protect in-pool transfers. Shield and unshield legs remain public.</p></article>
      </div>
    </section>
  );
}

export default function PortageGame() {
  const [started, setStarted] = useState(false);
  const [view, setView] = useState<View>("portal");
  const [autoExplore, setAutoExplore] = useState(false);
  const [portalAlerts, setPortalAlerts] = useState(true);
  const { creatures, onChain } = usePortageState();
  const address = useStoreWallet((state) => state.address);
  const isConnected = useStoreWallet((state) => state.isConnected);
  const privacySupported = useStoreWallet((state) => state.privacySupported);
  const squad = creatures.slice(0, 3);

  if (!started) return <Kickoff onStart={() => setStarted(true)} />;

  return (
    <div className={`${ui.page} ${styles.game}`}>
      <h1 className={styles.srOnly}>Portage.fun game dashboard</h1>
      <header className={styles.topbar}>
        <button type="button" className={styles.brandButton} onClick={() => setStarted(false)} title="Return to kickoff">
          <Image src="/game-assets/brand/logo.png" alt="" width={38} height={38} className={styles.pixelImage} />
          <span><b>PORTAGE</b><small>.FUN</small></span>
        </button>
        <nav className={styles.mainNav} aria-label="Game sections">
          {NAV.map((item) => (
            <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined} className={view === item.id ? styles.navActive : ""} onClick={() => setView(item.id)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <SelectWallet variant="nav" />
      </header>

      <div className={styles.dashboard}>
        <aside className={styles.leftRail}>
          <section className={styles.frame}>
            <div className={styles.profileHead}>
              <div className={styles.avatar}><Image src={creatureSpritePath("ember", "adult")} alt="" width={54} height={54} className={styles.pixelImage} /></div>
              <div><span>PORTER</span><b>{isConnected ? shortAddress(address) : "Wayfarer_01"}</b><small>Caravan rank 12</small></div>
            </div>
            <div className={styles.levelBar}><span style={{ width: "58%" }} /></div>
            <div className={styles.resourceGrid}>
              <div><span>⚡</span><b>84</b><small>Energy</small></div>
              <div><span>✦</span><b>2,448</b><small>Shards</small></div>
              <div><span>◆</span><b>{privacySupported ? "READY" : "PUBLIC"}</b><small>STRK mode</small></div>
              <div><span>◎</span><b>{creatures.length}</b><small>Creatures</small></div>
            </div>
          </section>

          <section className={styles.frame}>
            <div className={styles.frameTitle}><span>ACTIVE CARAVAN</span><small>{squad.length}/3</small></div>
            <div className={styles.squadList}>
              {squad.map((creature, index) => (
                <button key={creature.tokenId} type="button" onClick={() => setView("caravan")}>
                  <Image src={creatureSpritePath(creature.species, creature.stage)} alt="" width={44} height={44} className={styles.pixelImage} />
                  <span><b>{speciesLabel(creature.species)}</b><small>{creature.stage} · {creature.rarity}</small><i><em style={{ width: `${Math.min(100, 42 + index * 21)}%` }} /></i></span>
                </button>
              ))}
            </div>
          </section>

          <section className={`${styles.frame} ${styles.inventory}`}>
            <div className={styles.frameTitle}><span>PACK</span><small>6/20</small></div>
            <div className={styles.inventoryGrid}>{["✦", "◈", "⚗", "⌁", "◇", "+"].map((item, index) => <button type="button" key={`${item}-${index}`}>{item}<small>{index < 5 ? index * 3 + 2 : ""}</small></button>)}</div>
          </section>
        </aside>

        <main className={styles.centerStage}>
          <div className={styles.stageHeader}>
            <div><span>WORLD // BIOME GATE</span><b>{NAV.find((item) => item.id === view)?.label}</b></div>
            <div className={styles.worldStatus}><span className={onChain ? styles.liveDot : styles.demoDot} />{onChain ? "STARKNET LIVE" : "DEMO REALM"}</div>
          </div>
          <div className={styles.stageViewport}>
            {view === "portal" ? <Portal /> : null}
            {view === "caravan" || view === "expeditions" ? <Caravan /> : null}
            {view === "market" ? <Marketplace /> : null}
            {view === "privacy" ? <div className={styles.privacyView}><WalletAccountV6Tag /></div> : null}
            {view === "proofs" ? <ProofPanel /> : null}
          </div>
          <div className={styles.stageFooter}>
            <span>ZONE 01 · PORTAL MEADOW</span>
            <div><button type="button" aria-label="Zoom in">＋</button><button type="button" aria-label="Zoom out">−</button></div>
          </div>
        </main>

        <aside className={styles.rightRail}>
          <section className={styles.frame}>
            <div className={styles.frameTitle}><span>AUTOMATIONS</span><small>LOCAL</small></div>
            <label className={styles.toggleRow}><input type="checkbox" checked={autoExplore} onChange={(event) => setAutoExplore(event.target.checked)} /><span><b>Expedition reminder</b><small>Notify when energy is restored</small></span><i /></label>
            <label className={styles.toggleRow}><input type="checkbox" checked={portalAlerts} onChange={(event) => setPortalAlerts(event.target.checked)} /><span><b>Portal alerts</b><small>Highlight a ready portal</small></span><i /></label>
            <label className={`${styles.toggleRow} ${styles.toggleDisabled}`}><input type="checkbox" disabled /><span><b>Auto-evolve</b><small>Coming after economy limits</small></span><i /></label>
            <p className={styles.localOnly}>Interface preferences only — no unattended wallet transactions.</p>
          </section>

          <section className={`${styles.frame} ${styles.activityFrame}`}>
            <div className={styles.activityTabs}><button className={styles.activityActive}>DEMO FEED</button><button>GUILD</button></div>
            <div className={styles.activityFeed}>
              <p><time>NOW</time><span><b>Portal Meadow</b> is stable. A soft violet signal is coming through.</span></p>
              <p><time>19:42</time><span><b>Ripple</b> returned with 18 shards and 24 EXP.</span></p>
              <p><time>19:31</time><span>A new <b>Rare Bramble</b> appeared in the public market.</span></p>
              <p><time>19:04</time><span>STRK20 controls are <b>installed</b>. Wallet capability still required.</span></p>
              <p><time>18:50</time><span>The caravan crossed into <b>Mist</b>. Wisp gained +1 speed.</span></p>
            </div>
            <button type="button" className={styles.activityCta} onClick={() => setView("portal")}>Return to portal <span>▶</span></button>
          </section>
        </aside>
      </div>
    </div>
  );
}
