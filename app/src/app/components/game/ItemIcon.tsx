"use client";

import { itemAtlasFrame, itemDef } from "@/game/world/items";
import PixelIcon from "./PixelIcon";
import styles from "./client.module.css";

/**
 * An item's sprite, taken from the packed item atlas.
 *
 * Falls back to a drawn glyph while the sheet is still loading, or for an item
 * the art pipeline has not produced yet — the catalogue is deliberately allowed
 * to run ahead of the art.
 */

const GLYPH: Record<string, string> = {
  gold: "◉",
  shard: "✦",
  potion: "⚗",
  weapon: "†",
  armor: "▤",
  trophy: "♜",
  material: "◈",
};

const TINT: Record<string, string> = {
  gold: "#e0b45c",
  shard: "#8fd8e6",
  potion: "#d76a86",
  weapon: "#c9c2d6",
  armor: "#8ea3c4",
  trophy: "#c99a5e",
  material: "#a98fd6",
};

export default function ItemIcon({ defId, size = 32 }: { defId: string; size?: number }) {
  const def = itemDef(defId);
  return (
    <PixelIcon
      atlas="items"
      frame={itemAtlasFrame(defId)}
      size={size}
      label={def.name}
      fallback={
        <span className={styles.itemGlyph} style={{ width: size, height: size, color: TINT[def.kind] }} aria-hidden>
          {GLYPH[def.kind] ?? "◆"}
        </span>
      }
    />
  );
}
