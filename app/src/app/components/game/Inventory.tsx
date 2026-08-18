"use client";

import { useState } from "react";
import type { EquipSlot, GroundPile, ItemStack } from "@/game/core/types";
import { itemDef } from "@/game/world/items";
import ItemIcon from "./ItemIcon";
import type { GameSim } from "./useGameSim";
import styles from "./client.module.css";

/**
 * Backpack, worn equipment, and any opened corpse.
 *
 * Items move by dragging between the three, which is how this genre has always
 * handled loot: the payload names where a stack came from so the drop target
 * knows whether it is looting, storing, wearing or removing.
 */

type Source =
  | { from: "backpack"; instanceId: string }
  | { from: "container"; instanceId: string; pileId: string }
  | { from: "equipment"; slot: EquipSlot };

const MIME = "application/x-portage-item";

function encode(source: Source): string {
  return JSON.stringify(source);
}

function decode(event: React.DragEvent): Source | null {
  try {
    const raw = event.dataTransfer.getData(MIME);
    return raw ? (JSON.parse(raw) as Source) : null;
  } catch {
    return null;
  }
}

function Slot({
  stack,
  source,
  onActivate,
  title,
}: {
  stack: ItemStack;
  source: Source;
  onActivate?: () => void;
  title: string;
}) {
  return (
    <div
      className={styles.slot}
      title={title}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(MIME, encode(source));
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
      <ItemIcon defId={stack.defId} />
      {stack.count > 1 ? <small>{stack.count}</small> : null}
    </div>
  );
}

function DropZone({
  className,
  onDropSource,
  children,
  label,
}: {
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

const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: "Weapon",
  armor: "Armor",
  amulet: "Amulet",
};

export function Equipment({ sim }: { sim: GameSim }) {
  const { equipment } = sim.state.inventory;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>Equipment</div>
      <div className={styles.equipRow}>
        {(Object.keys(SLOT_LABEL) as EquipSlot[]).map((slot) => {
          const worn = equipment[slot];
          return (
            <DropZone
              key={slot}
              className={styles.equipSlot}
              label={SLOT_LABEL[slot]}
              onDropSource={(source) => {
                if (source.from === "backpack") sim.equip(source.instanceId);
              }}
            >
              {worn ? (
                <Slot
                  stack={worn}
                  source={{ from: "equipment", slot }}
                  onActivate={() => sim.unequip(slot)}
                  title={`${itemDef(worn.defId).name} — double-click to remove`}
                />
              ) : (
                <span className={styles.equipEmpty}>{SLOT_LABEL[slot]}</span>
              )}
            </DropZone>
          );
        })}
      </div>
    </section>
  );
}

export function Backpack({ sim }: { sim: GameSim }) {
  const { stacks } = sim.state.inventory;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>Backpack <small>{stacks.length}</small></div>
      <DropZone
        className={styles.backpack}
        label="Backpack"
        onDropSource={(source) => {
          if (source.from === "equipment") sim.unequip(source.slot);
          else if (source.from === "container") sim.takeItem(source.pileId, source.instanceId);
        }}
      >
        {stacks.map((stack) => {
          const def = itemDef(stack.defId);
          const action = def.slot ? "equip" : def.heal ? "use" : "drop";
          return (
            <Slot
              key={stack.instanceId}
              stack={stack}
              source={{ from: "backpack", instanceId: stack.instanceId }}
              onActivate={() => (def.slot || def.heal ? sim.use(stack.instanceId) : sim.drop(stack.instanceId))}
              title={`${def.name} · ${def.weight} oz — double-click to ${action}`}
            />
          );
        })}
        {stacks.length === 0 ? <p className={styles.empty}>Empty.</p> : null}
      </DropZone>
    </section>
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
        <button type="button" className={styles.takeAll} onClick={() => sim.takeAll(pile.id)}>
          Take all
        </button>
      ) : null}
    </section>
  );
}
