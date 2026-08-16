# Nightfall — Overnight task list (hackathon)

North star: `docs/SPEC.md` §9. This list is the Supervisor's execution plan
for one overnight loop. Checkboxes are updated as work lands.

## Locked constraints

- Turn-based, not real-time.
- Free + staked modes.
- AI agents (keeper), not scripted bots.
- Fair Game Engine is reusable; Nightfall is the first title.
- Never commit `.env` / keys.
- Commit after every stable feature or fix.

## Wave 0 — Orchestrator (done)

- [x] Supervisor = `openai-codex/gpt-5.6-sol`
- [x] Reviewer = `claude-bridge/claude-opus-5`
- [x] Worker/Merger = `orcarouter/deepseek/deepseek-v4-pro-0813`
- [x] Architect = `orcarouter/grok/grok-4.6`

## Wave 1 — Foundations (file-disjoint, parallel)

### T1 — Contracts: Fair Game Engine + Nightfall v0
- [x] Replace echo-only helper with a real game contract.
- [x] State machine: Lobby → Deal → Night → Day → Vote → Reveal → Settle.
- [x] Roles MVP: Werewolf, Minion, Seer, Robber, Troublemaker, Villager.
- [x] `privacy_invoke` buy-in / payout (`OpenNoteDeposit`).
- [x] Game actions via calldata (join, start, night action, vote, reveal, settle).
- [x] Cairo tests for happy path + invalid transitions (9/9 pass).
- [x] Keep echo helper as a separate module (StrkInvokeHelper).

### T2 — App: Nightfall shell on starter kit
- [x] Rebrand page to Nightfall: One Night.
- [x] Lobby UI: create/join table, seat list, free vs staked.
- [x] Game table UI: phase banner, role cards (hidden/revealed), action + vote.
- [x] Keep wallet connect + STRK20 actions.
- [x] Wire constants for Nightfall contract address (env, default 0x0).

### T3 — Keeper: AI seat service skeleton
- [x] `keeper/package.json` + TypeScript entry.
- [x] Personas (aggressive / cautious / deceptive).
- [x] Decide loop with structured output (action / vote).
- [x] Default LLM via OrcaRouter (kimi-k3).
- [x] Mock chain adapter so it runs without a live game.

### T4 — Docs
- [x] Root README (what / why / how to run).
- [x] Fair Game Engine reuse notes.
- [x] Keep SPEC as source of truth.

## Wave 2 — Core loop (after Wave 1 builds)

- [x] Export Nightfall ABI for app/keeper (`app/src/abis/nightfall.abi.json`).
- [ ] App talks to deployed/local contract (read game state).
- [ ] Night action + vote submission path (even if mocked STRK20 calldata).
- [ ] Keeper joins a lobby seat and emits a decision.
- [ ] Unit tests for settle / winner determination.

## Wave 3 — STRK20 + demo readiness

- [ ] Day 0: at least document how to shield + first mainnet tx.
- [ ] Fill `strk20.json` as txs land (do not invent hashes).
- [ ] Session-key / paymaster notes (implement if time).

## Review / architecture (done)

- [x] Reviewer pass — Claude Opus 5 (out of credits) → Kimi K3; Supervisor review done.
- [x] Architect (Grok 4.6) — REQUEST CHANGES: codegen, privacy gates, GameEngine trait (Wave 2/3).

## Definition of Done tonight (minimum)

Not full v0. Overnight success =

1. Contract compiles + Cairo tests pass for the state machine.
2. App builds and shows a playable-looking Nightfall lobby/table.
3. Keeper runs locally and prints a structured decision.
4. README explains how to run all three.
5. Everything reviewed and committed.

Full v0 (mainnet playable + 3 txs + demo video) continues after this loop.
