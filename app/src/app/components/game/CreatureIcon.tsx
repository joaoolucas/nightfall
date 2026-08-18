"use client";

import type { Species, Stage } from "@/utils/portage";
import { creatureCharacterId } from "@/utils/world-art";
import { atlasNameOf } from "@/game/render/sprites";
import PixelIcon from "./PixelIcon";

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
 *
 * The same is true of monsters, which is what `SpriteIcon` is for: the battle
 * list shows what is actually walking towards you, not its name in a list.
 */

export function SpriteIcon({ charId, size = 24, label }: { charId: string; size?: number; label?: string }) {
  return <PixelIcon atlas={atlasNameOf(charId)} frame="idle-south" size={size} label={label} />;
}

export default function CreatureIcon({
  species,
  stage,
  size = 24,
  alt,
}: {
  species: Species;
  stage: Stage;
  size?: number;
  alt?: string;
}) {
  return <SpriteIcon charId={creatureCharacterId(species, stage)} size={size} label={alt} />;
}
