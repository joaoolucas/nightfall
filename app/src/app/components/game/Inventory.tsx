"use client";

import { useState } from "react";
import type { GroundPile, ItemStack } from "@/game/core/types";
import { capacity, carriedPotions, inventoryWeight, itemDef } from "@/game/world/items";
import GameWindow from "./GameWindow";
import ItemIcon from "./ItemIcon";
import UiIcon from "./UiIcon";
import type { GameSim } from "./useGameSim";
import styles from "./client.module.css";

/**
 * The backpack, an opened corpse, and the potion the Porter reaches for.
 *
 * Items move by dragging between the backpack and a container; the payload
 * names where a stack came from so the drop target knows whether it is looting
 * or storing.
 */

type Source =
  | { from: "backpack"; instanceId: string }
  | { from: "container"; instanceId: string; pileId: string };

const MIME = "application/x-portage-item";

function decode(event: React.DragEvent): Source | null {
  try {
    const raw = event.dataTransfer.getData(MIME);
    return raw ? (JSON.parse(raw) as Source) : null;
  } catch {
    return null;
  }
}

function Slot({ stack, source, onActivate, title, size = 32 }: {
  stack: ItemStack;
  source: Source;
  onActivate?: () => void;
  title: string;
  size?: number;
}) {
  return (
    <div
      className={styles.slot}
      title={title}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(MIME, JSON.stringify(source));
        event.dataTransfer.effectAllowed = "move";
      }}
      onDoubleClick={onActivate}
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onKeyDown={(event) => {
        if (!onActivate) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
    >
      <ItemIcon defId={stack.defId} size={size} />
      {stack.count > 1 ? <small>{stack.count}</small> : null}
    </div>
  );
}

function DropZone({ className, onDropSource, children, label }: {
  className: string;
  onDropSource: (source: Source) => void;
  children: React.ReactNode;
  label?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`${className} ${over ? styles.dropOver : ""}`}
      aria-label={label}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const source = decode(event);
        if (source) onDropSource(source);
      }}
    >
      {children}
    </div>
  );
}

/**
 * Which potion the Porter drinks when hurt.
 *
 * This replaced an auto-potion switch. Whether to be healed was never an
 * interesting decision; which of your potions to spend is, because the good
 * ones are worth carrying home instead.
 */
export function PotionChoice({ sim }: { sim: GameSim }) {
  const potions = carriedPotions(sim.state.inventory);
  const chosen = sim.state.settings.potionId;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>Potion <small>below 35%</small></div>
      <div className={styles.potionRow}>
        <button
          type="button"
          className={chosen === null ? styles.potionActive : ""}
          onClick={() => sim.choosePotion(null)}
          title="Drink nothing"
        >
          none
        </button>
        {potions.map((stack) => {
          const def = itemDef(stack.defId);
          return (
            <button
              key={stack.instanceId}
              type="button"
              className={chosen === stack.defId ? styles.potionActive : ""}
              onClick={() => sim.choosePotion(stack.defId)}
              title={`${def.name} — heals ${Math.round((def.heal ?? 0) * 100)}%`}
            >
              <ItemIcon defId={stack.defId} size={32} />
              <span>{stack.count}</span>
            </button>
          );
        })}
        {potions.length === 0 ? <p className={styles.empty}>No potions carried.</p> : null}
      </div>
    </section>
  );
}

export function BackpackWindow({ sim, onClose }: { sim: GameSim; onClose: () => void }) {
  const { stacks, gold, shards } = sim.state.inventory;
  const weight = inventoryWeight(sim.state.inventory);
  const maxWeight = capacity(sim.state.progress.level);

  return (
    <GameWindow title="Backpack" subtitle={`${stacks.length} stacks`} onClose={onClose}>
      <div className={styles.packStats}>
        <div><ItemIcon defId="gold" /><span>Gold<b>{gold.toLocaleString()}</b></span></div>
        <div><ItemIcon defId="shard" /><span>Shards<b>{shards.toLocaleString()}</b></span></div>
      </div>
      <div className={styles.skillRow}>
        <UiIcon name="capacity" />
        <div>
          <div className={styles.skillHead}>
            <b>Capacity</b>
            <span>{weight} / {maxWeight} oz</span>
          </div>
          <span className={`${styles.bar} ${styles.bar_cap}`}>
            <i style={{ width: `${Math.min(100, (weight / maxWeight) * 100)}%` }} />
          </span>
        </div>
      </div>
      <DropZone
        className={styles.packGrid}
        label="Backpack"
        onDropSource={(source) => {
          if (source.from === "container") sim.takeItem(source.pileId, source.instanceId);
        }}
      >
        {stacks.map((stack) => {
          const def = itemDef(stack.defId);
          return (
            <Slot
              key={stack.instanceId}
              stack={stack}
              source={{ from: "backpack", instanceId: stack.instanceId }}
              onActivate={() => (def.heal ? sim.use(stack.instanceId) : sim.drop(stack.instanceId))}
              title={`${def.name} · ${def.weight} oz · ${def.value} gold — double-click to ${def.heal ? "drink" : "drop"}`}
            />
          );
        })}
        {stacks.length === 0 ? <p className={styles.empty}>Empty.</p> : null}
      </DropZone>
    </GameWindow>
  );
}

export function Container({ sim, pile, onClose }: { sim: GameSim; pile: GroundPile; onClose: () => void }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        {pile.corpseOf ? `Dead ${pile.corpseOf}` : "Ground"}
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close container">×</button>
      </div>
      <DropZone
        className={styles.backpack}
        label="Container contents"
        onDropSource={(source) => {
          if (source.from === "backpack") sim.putItem(source.instanceId, pile.id);
        }}
      >
        {pile.items.map((stack) => (
          <Slot
            key={stack.instanceId}
            stack={stack}
            source={{ from: "container", instanceId: stack.instanceId, pileId: pile.id }}
            onActivate={() => sim.takeItem(pile.id, stack.instanceId)}
            title={`${itemDef(stack.defId).name} — double-click to take`}
          />
        ))}
        {pile.items.length === 0 ? <p className={styles.empty}>Nothing left.</p> : null}
      </DropZone>
      {pile.items.length > 0 ? (
        <button type="button" className={styles.takeAll} onClick={() => sim.takeAll(pile.id)}>Take all</button>
      ) : null}
    </section>
  );
}
