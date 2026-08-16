# Nightfall — Provably-Fair Privacy-Native Social Games

> A platform for staked social deduction games where cheating is mathematically
> impossible and player strategy is private. First title: **Nightfall: One Night**
> (One Night Werewolf). Built on [STRK20](https://strk20.starknet.io) on Starknet.

**Positioning:** "Provably-fair, privacy-native social gaming — play for real
stakes, know the house can't cheat, and keep your strategy private."

The game is the wedge. The company is the **Fair Game Engine**: a reusable Cairo
protocol (hidden-state dealing, encrypted-note cards, anonymous voting, staked
settlement) that any title plugs into.

## Repository layout

```
├── contracts/          # Scarb/Cairo: Fair Game Engine + Nightfall config
├── app/                # Next.js client (wallet, lobby, game UI)
├── keeper/             # AI player agents (off-chain, per-seat viewing key)
├── docs/               # SPEC.md (north star), TASKS.md, guides
├── scripts/gen-assets.mjs   # PixelLab art pipeline
├── game-assets/        # generated pixel art
├── strk20.json         # hackathon scoring: txs, contracts, demo
└── AGENTS.md           # orchestrator protocol
```

## Components

### `contracts/` — Fair Game Engine (trust-critical)

The game contract is an **STRK20 anonymizer**: the privacy pool invokes it via
`privacy_invoke` (or `privacy_invoke_with_computation` for arbitrary calldata),
it runs the game logic, and returns `OpenNoteDeposit[]` so payouts land as
shielded notes.

Current state (v0):

- `src/lib.cairo` — `StrkInvokeHelper`, a minimal `privacy_invoke` round-trip
  (echo) that exercises the STRK20 flow end to end.
- `src/nightfall.cairo` — the **One Night Werewolf state machine**: phases
  `Lobby → Deal → Night → Day → Vote → Reveal → Settle`, 6 MVP roles
  (Werewolf, Minion, Seer, Robber, Troublemaker, Villager), deterministic deal,
  night actions, anonymous vote tally, role reveal, and settle.

**v0 privacy caveat:** roles/seed/tally are public views and the deal is
deterministic from a public seed — a trusted-dealer placeholder. The STRK20
migration (encrypted notes + viewing keys, `privacy_invoke_with_computation`)
replaces it; see `docs/SPEC.md` §4.

Build & test:

```bash
cd contracts
scarb build      # compiles sierra/casm
scarb test       # 9 Cairo unit tests (state machine + winner rule + reverts)
```

Requires Scarb 2.18.0 (`contracts/.tool-versions`).

### `app/` — Next.js client

STRK20 starter kit rebranded to Nightfall: One Night. Wallet connect
(`get-starknet` v6), lobby (6 seats, free/staked toggle), game table (phase
banner + role cards with pixel art), and the STRK20 action panel (shield /
unshield / private transfer / echo) needed for Day 0 scoring.

```bash
cd app
npm install
cp .env.example .env.local    # add NEXT_PUBLIC_PROVIDER_URL (Alchemy key)
npm run dev                   # http://localhost:3000
```

### `keeper/` — AI player agents

Off-chain Node/TS service that fills empty seats with AI players. Each AI seat
holds a wallet + viewing key, decrypts **only its own** role note, and asks an
LLM (default `orcarouter/kimi/kimi-k3`) to decide its action/vote under a
persona (aggressive / cautious / deceptive). Submits via the same
`privacy_invoke` path as a human.

```bash
cd keeper
npm install
npm run typecheck
npm start        # prints a structured decision (works without an API key)
```

**Provable fairness:** the AI's knowledge is cryptographically limited to its
seat — even the operator cannot make an AI opponent cheat.

## Modes

- **Free** — points/leaderboard (acquisition funnel).
- **Staked** — buy-in → pool − rake → private payout.
- **Tournament** — stretch.

## Status

Wave 1 (foundations) landed: contract compiles + 9 tests, app builds, keeper
runs. Wave 2 wires app ↔ contract and keeper ↔ lobby; Wave 3 is STRK20
privacy + demo readiness. See `docs/TASKS.md` and `docs/SPEC.md` §8–9.

## Fair Game Engine — reuse notes

Nightfall is the first title on top of a reusable engine. The intended split
(SPEC §3) is:

- **Generic engine** — hidden-state dealing, encrypted-note cards, anonymous
  voting, staked settlement (`privacy_invoke` entrypoints).
- **Per-title config** — role set, phase order, winner rule (Nightfall =
  One Night Werewolf).

A studio builds a new title by supplying its own role/phase/winner config; the
anonymizer and settlement plumbing are shared. v0 hardcodes the Werewolf config
inside `nightfall.cairo`; the generic `GameEngine` trait extraction is queued in
`docs/TASKS.md` Wave 2/3.

## License

MIT — see `LICENSE`.
