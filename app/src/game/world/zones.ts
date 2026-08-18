import type { Species } from "@/utils/portage";

/**
 * The six routes, in the order a Porter unlocks them.
 *
 * These moved out of the retired idle module: they describe the world, not the
 * incremental loop that used to consume them. Enemy names now live on the
 * monster templates, so a zone only carries presentation and gating.
 */

export interface ZoneDefinition {
  id: Species;
  name: string;
  subtitle: string;
  requiredLevel: number;
}

export const ZONES: readonly ZoneDefinition[] = [
  { id: "ember", name: "Cinderpath", subtitle: "Warm ruins and restless sparks", requiredLevel: 1 },
  { id: "creek", name: "Moon Creek", subtitle: "Silver currents beneath old bridges", requiredLevel: 5 },
  { id: "grove", name: "Rootwild", subtitle: "Living paths under an ancient canopy", requiredLevel: 10 },
  { id: "stone", name: "Crystal Delve", subtitle: "Deep tunnels that remember every footstep", requiredLevel: 16 },
  { id: "mist", name: "Whisper Fen", subtitle: "Fog, lanterns and things without shadows", requiredLevel: 24 },
  { id: "sky", name: "Aurora Reach", subtitle: "Islands carried by the high wind", requiredLevel: 34 },
] as const;

export function zoneFor(id: Species): ZoneDefinition {
  return ZONES.find((zone) => zone.id === id) ?? ZONES[0];
}

export function zoneIndex(id: Species): number {
  return Math.max(0, ZONES.findIndex((zone) => zone.id === id));
}
