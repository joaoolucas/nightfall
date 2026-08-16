// ─── Nightfall platform config ───────────────────────────────────────────────
// The Fair Game Engine anonymizer contract address. v0 ships a placeholder; the
// sibling contracts worker deploys the real Nightfall anonymizer and this value
// is overridden via NEXT_PUBLIC_NIGHTFALL_ADDRESS at build time.
//
// `0x0` = not deployed → the Start Game / on-chain actions stay disabled until a
// real address is provided (same convention as Strk20EchoHelperSepolia).

export const NIGHTFALL_ADDRESS: string =
  process.env.NEXT_PUBLIC_NIGHTFALL_ADDRESS ?? "0x0";

/**
 * Declared class hash of the Nightfall Fair Game Engine (no constructor args).
 * Compute/refresh with: `node scripts/export-abi.mjs` + `hash.computeContractClassHash`,
 * or read `contracts/deployed.json` after a deploy. Used to deploy a fresh
 * instance from the UI (UDC deploy) once the class is declared.
 */
export const NIGHTFALL_CLASS_HASH =
  process.env.NEXT_PUBLIC_NIGHTFALL_CLASS_HASH ??
  "0x3d4bb5af694af26f3a17040e14042a2b2956416ebdfd16743b6a1be3e2643bd";

/** True once a real Nightfall contract address is configured. */
export function hasNightfallContract(): boolean {
  try {
    return BigInt(NIGHTFALL_ADDRESS) !== 0n;
  } catch {
    return false;
  }
}
