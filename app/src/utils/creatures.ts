// Typed creature model + mock dataset for the Portage.fun UI shell.
//
// No on-chain wiring yet: the creature NFT ABI does not exist. These typed mocks
// stand in for the real token data until the Cairo contract is deployed.

import type { Rarity, Species, Stage } from "./portage";
import { creatureStats } from "./portage";

/** A portaged creature — mirrors the on-chain NFT metadata (tokenId + traits). */
export interface Creature {
  tokenId: number;
  species: Species;
  rarity: Rarity;
  stage: Stage;
  owner: string;
  /** Derived combat stats (base × rarity × stage). */
  health: number;
  attack: number;
  defense: number;
  speed: number;
  /** Progress toward the next evolution threshold. */
  exp: number;
}

/** Shorten an owner address for display ("0x0471…938d"). */
export function shortAddress(addr: string): string {
  return addr.length <= 13 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Typed mock lineup — one creature per biome (SPEC §4 flagship examples), with
 * varied rarities and stages so the grid exercises every visual state.
 */
export const MOCK_CREATURES: Creature[] = [
  {
    tokenId: 1,
    species: "ember",
    rarity: "uncommon",
    stage: "adult",
    owner: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    ...creatureStats("ember", "uncommon", "adult"),
    exp: 250,
  },
  {
    tokenId: 2,
    species: "creek",
    rarity: "common",
    stage: "hatchling",
    owner: "0x06d9f1e2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1",
    ...creatureStats("creek", "common", "hatchling"),
    exp: 100,
  },
  {
    tokenId: 3,
    species: "grove",
    rarity: "rare",
    stage: "adult",
    owner: "0x02a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4",
    ...creatureStats("grove", "rare", "adult"),
    exp: 500,
  },
  {
    tokenId: 4,
    species: "stone",
    rarity: "epic",
    stage: "adult",
    owner: "0x05162738495a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3",
    ...creatureStats("stone", "epic", "adult"),
    exp: 320,
  },
  {
    tokenId: 5,
    species: "mist",
    rarity: "legendary",
    stage: "legend",
    owner: "0x070c4f8e1d2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0",
    ...creatureStats("mist", "legendary", "legend"),
    exp: 500,
  },
  {
    tokenId: 6,
    species: "sky",
    rarity: "mythic",
    stage: "hatchling",
    owner: "0x0382a9c4d6e1f0b2a3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8",
    ...creatureStats("sky", "mythic", "hatchling"),
    exp: 40,
  },
];
