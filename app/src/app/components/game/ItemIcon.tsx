"use client";

import { useState } from "react";
import { itemDef, itemSpritePath } from "@/game/world/items";
import styles from "./client.module.css";

/**
 * An item's sprite, with a drawn stand-in when the art is not there yet.
 *
 * The catalogue is deliberately allowed to run ahead of the art pipeline, so a
 * missing PNG has to degrade to something readable rather than a broken image.
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

export default function ItemIcon({ defId, size = 26 }: { defId: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const def = itemDef(defId);

  if (failed) {
    return (
      <span className={styles.itemGlyph} style={{ width: size, height: size, color: TINT[def.kind] }} aria-hidden>
        {GLYPH[def.kind] ?? "◆"}
      </span>
    );
  }
  return (
    // A plain img: next/image cannot report a load failure we can fall back from.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={itemSpritePath(defId)}
      alt={def.name}
      width={size}
      height={size}
      className={styles.pixel}
      onError={() => setFailed(true)}
    />
  );
}
