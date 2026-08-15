# Nightfall — Provably-Fair Privacy-Native Social Games

> A platform for staked social deduction games where cheating is mathematically
> impossible and player strategy is private. First title: **Nightfall: One Night**
> (One Night Werewolf). Built on [STRK20](https://strk20.starknet.io).

## 1. Vision

Every social/staked game today is a black box: the server sees every card and role,
can cheat, be bribed, or ban winners, and every player's identity, strategy, and
winnings are public. Those two facts make **staked social games with cryptographic
integrity** a category that literally cannot exist today — and STRK20 makes it possible.

**Positioning:** "Provably-fair, privacy-native social gaming — play for real stakes,
know the house can't cheat, and keep your strategy private."

The game is the wedge. The company is the **Fair Game Engine**: a reusable Cairo
protocol (hidden-state dealing, encrypted-note cards, anonymous voting, staked
settlement) that any title plugs into.

## 2. Business model

| Line | How |
|---|---|
| Rake on staked prize pools | % of buy-in pool, on-chain (contract parameter) |
| Tournament / season passes | entry fees, blind structures, sponsored pools |
| B2B licensing | studios build on the Fair Game Engine (revenue share) |
| Cosmetics | avatars/skins as NFTs |

## 3. System architecture

```
┌──────────────────────────────────────────────────────────┐
│  app/         Next.js client (wallet, lobby, game UI)    │
├──────────────────────────────────────────────────────────┤
│  keeper/      AI player agents (off-chain, per-seat VK)  │
├──────────────────────────────────────────────────────────┤
│  contracts/   Cairo: Fair Game Engine + Nightfall config │
│               (anonymizer: privacy_invoke entrypoints)   │
└──────────────────────────────────────────────────────────┘
```

- **`contracts/`** — the trust-critical part. The game contract is an **STRK20
  anonymizer**: the privacy pool invokes it via `privacy_invoke` (or
  `privacy_invoke_with_computation` for arbitrary calldata), it runs the game logic,
  and returns `OpenNoteDeposit[]` so payouts land as shielded notes.
- **`app/`** — Next.js (from the STRK20 starter kit). Wallet connect
  (`get-starknet` v6), lobby, role cards, action/vote UI, phase timers.
- **`keeper/`** — spawns AI players: each seat holds a viewing key, decrypts *only its
  own* role note, asks an LLM (Gemini 3.7 Flash) to decide the action/vote under a
  persona, and submits through the same `privacy_invoke` path as a human.
- **`docs/`** — spec, README, guides (judging: 15% docs).

## 4. STRK20 integration (the scoring core)

| STRK20 primitive | Nightfall use |
|---|---|
| Shielded balances (`deposit`) | staked buy-in |
| Encrypted notes (`CreateEncNote`) | role cards, private messages |
| Private transfers (`UseNote`/`CreateEncNote`) | night actions, anonymous votes |
| Anonymizer contract (`privacy_invoke`) | the game contract itself |
| `privacy_invoke_with_computation` | arbitrary game calldata (action args) |
| Open notes (`OpenNoteDeposit`) | private payouts |
| Viewing keys | role reveal + audit/compliance |
| Session keys + paymaster | gasless, scoped per-game permissions |

Two integration paths (both are anonymizer entrypoints):

1. **Simple** (`privacy_invoke(token, pool_address, note_id)`) — buy-in and payout
   round-trips. Mirrors `cairo/src/lib.cairo` in the starter kit.
2. **Rich** (`privacy_invoke_with_computation` + `InvokeExternal` calldata) — game
   actions with arguments (vote target, seer check target, robber swap). Mirrors
   `packages/shadow_account_anonymizer` in `starknet-privacy`.

## 5. Game design — One Night Werewolf

### Roles (MVP)

| Role | Team | Night action |
|---|---|---|
| Werewolf | Wolves | sees other wolves |
| Minion | Wolves | sees wolves (wolves don't see them) |
| Seer | Village | checks one player's role |
| Robber | Village | swaps own role with another player |
| Troublemaker | Village | swaps two other players' roles |
| Villager | Village | no action |

Stretch: Drunk, Insomniac, Doppelgänger, Tanner (independent win condition).

### Phases (turn-based state machine)

1. **Lobby** — join, buy-in (free or staked).
2. **Deal** — committed seed (trusted-dealer v0; STARK-proven shuffle v2) → assign
   roles as encrypted notes, one per seat.
3. **Night** — fixed order: Werewolf → Minion → Seer → Robber → Troublemaker. Each
   action is a private transfer in the player↔game channel, executed in a time window
   (default action if none).
4. **Day** — timed discussion (off-chain chat).
5. **Vote** — anonymous on-chain vote (channel transfer); only the tally is public.
6. **Reveal** — each player reveals final role via viewing key.
7. **Settle** — winner determination + private payout (staked mode).

### Modes

- **Free** — points/leaderboard (acquisition funnel).
- **Staked** — buy-in → pool − rake → private payout.
- **Tournament** — stretch.

## 6. AI players (keeper)

- Each AI seat = a wallet + viewing key, identical to a human.
- Decrypts **only its own seat's** role note → provable no-peeking.
- LLM (Gemini 3.7 Flash via OpenRouter) decides actions/votes under a persona
  (aggressive, cautious, deceptive) given public game state + its own hidden info.
- Submits via the same `privacy_invoke` path; paymaster-sponsored.
- **Moat claim:** even the AI opponents cannot cheat — their knowledge is
  cryptographically limited to their seat.

## 7. Repo layout

```
├── contracts/          # Scarb: Fair Game Engine + Nightfall
├── app/                # Next.js client
├── keeper/             # AI player service (Node/TS)
├── docs/               # SPEC.md, README, guides
├── scripts/gen-assets.mjs   # PixelLab art pipeline
├── game-assets/        # generated pixel art
├── strk20.json         # hackathon scoring: txs, contracts, demo
└── AGENTS.md           # orchestrator protocol
```

## 8. v0 scope (16 days)

| Phase | Days | Deliverable |
|---|---|---|
| A. Foundation | ~3 | starter kit running, Day 0 (shield + 1st mainnet tx) |
| B. Core loop | ~6 | contract (lobby→deal→night→vote→settle) + app happy path (2-3 wallets) |
| C. Polish | ~4 | session keys/paymaster, swap roles, 3-min demo video |
| D. Buffer | ~3 | 3 mainnet txs, README/docs, license |

## 9. Definition of Done (v0)

- One Night Werewolf playable on **mainnet**, free + staked modes.
- 3+ mainnet transactions touching the STRK20 pool, listed in `strk20.json`.
- Public demo URL + 3-minute demo video.
- README + docs + license; the Fair Game Engine documented as reusable (other teams
  can build on it — a judging bonus).
