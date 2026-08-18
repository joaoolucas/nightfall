"use client";

import type { Species, Stage } from "@/utils/portage";
import { creatureCharacterId } from "@/utils/world-art";
import { atlasUrl, getSprite } from "@/game/render/atlas";
import { atlasNameOf } from "@/game/render/sprites";
import styles from "./client.module.css";

/**
 * A creature's portrait, taken from the very sprite it is drawn with in the
 * world.
 *
 * There used to be two independent art sets: card art under `creatures/` and
 * world sprites under `world/characters/`. Nothing kept them in step, so the
 * roster showed a green lizard beside an ember salamander of the same name, and
 * every regeneration widened the gap. The world sprite is the creature; this
 * reads its south-facing idle frame straight out of the same atlas the renderer
 * uses, so a creature can never look like two different animals again.
 */
export default function CreatureIcon({
  species,
  stage,
  size = 30,
  alt = "",
}: {
  species: Species;
  stage: Stage;
  size?: number;
  alt?: string;
}) {
  const atlas = atlasNameOf(creatureCharacterId(species, stage));
  const sprite = getSprite(atlas, "idle-south");

  if (!sprite) {
    // The atlas has not arrived yet; a hole is better than the wrong creature.
    return <span className={styles.creaturePlaceholder} style={{ width: size, height: size }} aria-hidden />;
  }

  const scale = size / sprite.w;
  return (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${atlasUrl(atlas)})`,
        backgroundRepeat: "no-repeat",
        flex: "none",
        backgroundPosition: `-${sprite.x * scale}px -${sprite.y * scale}px`,
        backgroundSize: `${sprite.image.naturalWidth * scale}px ${sprite.image.naturalHeight * scale}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}
