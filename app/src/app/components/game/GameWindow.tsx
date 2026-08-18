"use client";

import { useEffect } from "react";
import styles from "./client.module.css";

/**
 * A floating window over the world.
 *
 * The header used to carry the route tabs and the rail carried every panel at
 * once, which made all of it small. Anything consulted rather than watched —
 * skills, the backpack, where to hunt next — lives here instead, opened from
 * the icon bar, so the panels that *are* watched can be read at a glance.
 *
 * One window is open at a time. Overlapping windows are a real Tibia
 * behaviour, but they need dragging and z-order to be usable, and the value
 * here is legibility, not a desktop metaphor.
 */
export default function GameWindow({
  title,
  subtitle,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={`${styles.window} ${wide ? styles.windowWide : ""}`} role="dialog" aria-label={title}>
      <div className={styles.windowHead}>
        <span>
          {title}
          {subtitle ? <em>{subtitle}</em> : null}
        </span>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className={styles.windowBody}>{children}</div>
    </div>
  );
}
