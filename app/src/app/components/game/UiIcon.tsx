"use client";

import PixelIcon from "./PixelIcon";

/**
 * The client's iconography, drawn by the same generator as the world.
 *
 * These were SVG glyphs, which was the wrong material: a vector shield beside a
 * pixel-art gold coin reads as two programs sharing a window. They are pixel
 * art now, in the world's palette, and they are shown at their native 32px —
 * halving them turns a claw into a smudge.
 */

export type UiIconName =
  | "health"
  | "exp"
  | "capacity"
  | "attack"
  | "shield"
  | "handling"
  | "vitality"
  | "map"
  | "ledger"
  | "pack"
  | "skull"
  | "hourglass";

export default function UiIcon({ name, size = 32, label }: { name: UiIconName; size?: number; label?: string }) {
  return <PixelIcon atlas="ui" frame={name} size={size} label={label} />;
}
