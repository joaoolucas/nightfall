"use client";

import { useEffect, useState } from "react";
import { atlasUrl, getSprite, loadAtlas } from "@/game/render/atlas";
import styles from "./client.module.css";

/**
 * One frame of a packed sheet, shown through a CSS window.
 *
 * Three components were each doing this by hand — creature portraits, item
 * slots, and now the interface icons — and each had drifted: one forgot
 * `background-repeat`, so a stretched box tiled the sheet four across. There is
 * one implementation now, and everything that draws a sprite outside the canvas
 * goes through it.
 *
 * Sizes should divide the source frame evenly. The art is 32px (icons, items)
 * and 48px (characters); a 32px icon at 16px drops every other pixel and turns
 * a shield into a smudge, which is why the client shows icons at their native
 * size and portraits at half.
 */

/** Load a sheet once, then re-render the components waiting on it. */
function useAtlas(name: string): void {
  const [, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    void loadAtlas(name).then(() => {
      if (alive) setVersion((version) => version + 1);
    });
    return () => {
      alive = false;
    };
  }, [name]);
}

export default function PixelIcon({
  atlas,
  frame,
  size,
  label,
  fallback = null,
}: {
  atlas: string;
  frame: string;
  size: number;
  label?: string;
  fallback?: React.ReactNode;
}) {
  useAtlas(atlas);
  const sprite = getSprite(atlas, frame);

  if (!sprite) {
    if (fallback) return <>{fallback}</>;
    // A hole is better than the wrong picture while the sheet is in flight.
    return <span className={styles.iconHole} style={{ width: size, height: size }} aria-hidden />;
  }

  const scale = size / sprite.w;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        width: size,
        height: size,
        flex: "none",
        backgroundImage: `url(${atlasUrl(atlas)})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: `-${sprite.x * scale}px -${sprite.y * scale}px`,
        backgroundSize: `${sprite.image.naturalWidth * scale}px ${sprite.image.naturalHeight * scale}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}
