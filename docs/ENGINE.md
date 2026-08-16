# Fair Game Engine — reusable protocol notes

Nightfall is the first title on a **reusable Fair Game Engine**. This page is
the "build your own title" guide for judges and other teams (a scoring bonus).

## The split

| Layer | What it owns | Where it lives today |
|---|---|---|
| **Generic engine** | hidden-state dealing, encrypted-note cards, anonymous voting, staked settlement (`privacy_invoke` entrypoints) | `contracts/src/lib.cairo` (`StrkInvokeHelper` = the `privacy_invoke` round-trip shape) |
| **Per-title config** | role set, phase order, night-action semantics, winner rule | `contracts/src/nightfall.cairo` |

A studio builds a new title by supplying its own role/phase/winner config; the
anonymizer + settlement plumbing is shared and unchanged.

## The on-chain contract surface (per title)

The game contract is an **STRK20 anonymizer**. The privacy pool invokes it via
`privacy_invoke` / `privacy_invoke_with_computation`; it runs the game logic and
returns `OpenNoteDeposit[]` so payouts land as shielded notes.

Nightfall v0 implements this as a plain state machine (public for the demo):

```
Lobby → Deal → Night → Day → Vote → Reveal → Settle
```

Entrypoints (see `contracts/src/nightfall.cairo`):

- `join_game` / `start_game(seed)` — lobby + deal (deterministic Fisher–Yates
  from a committed seed; trusted-dealer v0).
- `night_action(seat, target)` / `cast_vote(seat, target)` — per-seat private
  moves (anonymous on the pool in the STRK20 migration).
- `reveal_role(seat)` / `settle` — reveal + winner determination
  (village wins if any wolf-team seat is voted; wolves win otherwise).

## The STRK20 migration (privacy layer)

Per `docs/SPEC.md` §4, each v0 "public" step becomes a privacy primitive:

| v0 (plain) | STRK20 primitive |
|---|---|
| `start_game(seed)` public deal | role cards as `CreateEncNote` encrypted notes + per-seat viewing keys |
| `night_action` / `cast_vote` public | `privacy_invoke_with_computation` / anonymous channel transfers |
| public `get_role` | viewing-key-gated reveal |
| `settle` | `OpenNoteDeposit[]` private payouts |

The v0 `get_role` / `get_seed` public views are explicitly marked as
trusted-dealer placeholders to be removed when the privacy layer lands.

## Reuse checklist for a new title

1. Copy `nightfall.cairo` and replace the `Role` enum + `build_role_list` +
   `determine_winner` (your role set and win condition).
2. Keep the `Phase` machine (or reorder it — the guards are per-phase asserts).
3. Reuse `StrkInvokeHelper` / the anonymizer shape for buy-in + payout.
4. Ship your own `keeper` personas and app UI; the engine contract is the same.

## Security model (why "provably fair")

- **The house can't cheat** — roles are dealt from a committed seed and the
  settle rule is on-chain; the contract cannot see or override a player's card.
- **Strategy is private** — roles/actions/votes move as encrypted notes; an
  observer sees only the public tally.
- **Even AI opponents can't cheat** — each keeper seat holds only its own
  viewing key, so its knowledge is cryptographically limited to its seat.

This is the moat the platform sells: staked social games where cheating is
mathematically impossible.
