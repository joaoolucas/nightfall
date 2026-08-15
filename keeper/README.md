# Nightfall Keeper — AI Player Agents

Off-chain service that fills empty seats with AI players for **Nightfall: One Night**.

## Principle

Each AI player is cryptographically identical to a human:

- Holds a **wallet + viewing key** for its seat.
- Decrypts **only its own seat's** encrypted role note (via the STRK20 discovery
  service / viewing key).
- Decides its night action and vote with an LLM (default: `openrouter/google/gemini-3.7-flash`)
  under a persona.
- Submits through the **same `privacy_invoke` path** a human wallet uses, paymaster-sponsored.

**Provable fairness:** the AI's knowledge is limited to its seat. Even the operator
cannot make an AI opponent cheat.

## Layout (to be implemented)

```
keeper/
├── src/
│   ├── index.ts        # entrypoint: watch games, drive AI seats
│   ├── persona.ts      # persona system (aggressive/cautious/deceptive...)
│   ├── decide.ts       # LLM prompt -> action/vote decision
│   ├── submit.ts       # privacy_invoke submission (reuse app/ SDK helpers)
│   └── config.ts       # models, RPC, pool/helper addresses
└── package.json
```

## Decision loop (per AI seat, per turn)

1. Poll game state (phase, turn) for the game the seat is in.
2. Read the seat's own role note (decrypt with viewing key).
3. Build prompt: `persona + role + public state + action history`.
4. Ask the LLM for the next action/vote (structured output).
5. Submit via `privacy_invoke`; fall back to default action on timeout.

## Model config (reuses orchestrator roles)

| Seat budget | Model |
|---|---|
| default (fast/cheap) | `openrouter/google/gemini-3.7-flash` |
| "strong" personality | `openrouter/deepseek/deepseek-v4-pro-0813` |

## Notes

- One keeper can drive many seats/games concurrently.
- Bots must respect the same phase time windows as humans (no faster play).
- Never hardcode a role — the keeper only knows what the viewing key reveals.
