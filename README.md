# Nightfall — Provably-Fair Privacy-Native Social Games

Play **One Night Werewolf** for real stakes on Starknet, with STRK20 privacy:
the house can't cheat, and your role, strategy, and winnings stay private.

- **Contracts** (`contracts/`) — Cairo Fair Game Engine (STRK20 anonymizer)
- **App** (`app/`) — Next.js client (wallet, lobby, game UI)
- **Keeper** (`keeper/`) — AI player agents (per-seat viewing key)

## Quick start

```bash
# contracts (needs Scarb 2.18.0)
cd contracts && scarb build && scarb test

# app
cd app && npm install && cp .env.example .env.local && npm run dev

# keeper
cd keeper && npm install && npm run typecheck && npm start
```

Full guide, architecture, and the Fair Game Engine reuse notes:
**[docs/README.md](docs/README.md)** · **[docs/SPEC.md](docs/SPEC.md)**

License: MIT.
