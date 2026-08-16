// ─── Nightfall platform config ───────────────────────────────────────────────
// The Fair Game Engine anonymizer contract address. v0 ships a placeholder; the
// sibling contracts worker deploys the real Nightfall anonymizer and this value
// is overridden via NEXT_PUBLIC_NIGHTFALL_ADDRESS at build time.
//
// `0x0` = not deployed → the Start Game / on-chain actions stay disabled until a
// real address is provided (same convention as Strk20EchoHelperSepolia).

export const NIGHTFALL_ADDRESS: string =
  process.env.NEXT_PUBLIC_NIGHTFALL_ADDRESS ?? "0x0";

/** True once a real Nightfall contract address is configured. */
export function hasNightfallContract(): boolean {
  try {
    return BigInt(NIGHTFALL_ADDRESS) !== 0n;
  } catch {
    return false;
  }
}
