# Non-Stop Orchestration Protocol (Hackathon)

## Project: Portage.fun

**What we build** (north star = `docs/SPEC.md`): an idle creature-collecting
game on Starknet with provably-fair on-chain hatches, ownable creatures, and a
player-driven marketplace, using STRK20 privacy.

**Components**:

- `contracts/` — Cairo: hatch RNG, creatures (NFT), marketplace, energy
- `app/` — Next.js (STRK20 starter kit)
- `scripts/` — art pipeline + deploy
- `docs/` — SPEC + README + docs

This repo uses pi as a multi-role orchestrator. The **main agent** is the
Supervisor and dispatches **subagents** (isolated `pi` processes) with
specialized models.

## Roles

| Role | Model | Thinking | Tools |
|------|-------|----------|-------|
| Supervisor | `openai-codex/gpt-5.6-sol` | high | read, bash, edit, write, grep, find, ls, run_agent |
| Worker | `hcnsec/DeepSeek-V4-Flash` | off (provider-managed) | read, bash, edit, write, grep, find, ls |
| Reviewer | `hcnsec/Kimi-K2.6` | off (provider-managed) | read, grep, find, ls, bash (read-only) |
| Merger | `hcnsec/DeepSeek-V4-Pro` | off (provider-managed) | read, bash, edit, write, grep, find, ls |
| Architect | `hcnsec/glm-5.2` | off (provider-managed) | read, grep, find, ls |

Commands: `/role <role>` switches the main agent's model; `/kickoff <goal>`
starts the non-stop loop.

## Non-stop loop

Repeat until the Definition of Done (v0, in `docs/SPEC.md`) is met:

1. **Plan** — read `docs/SPEC.md`, understand the goal, and break it into small tasks.
2. **Implement** — dispatch `run_agent` with `role=worker`. Use `tasks[]` (parallel)
   only for independent tasks that **do not** edit the same files.
3. **Review** — dispatch `run_agent` with `role=reviewer` over the diff (`git diff`).
4. **Integrate** — dispatch `run_agent` with `role=merger` to resolve conflicts and
   apply review fixes.
5. **Validate architecture** — dispatch `run_agent` with `role=architect` for
   structural changes (new modules, contracts, schemas, protocol).
6. **Verify** — run build and tests with `bash`. Commit at every stable iteration.

## Rules

- **Do not stop between steps.** Only stop if genuinely blocked; in that case
  report exactly what is missing and what was already done.
- **Frequent commits** — commit at every stable iteration, with a clear message.
- **Parallel workers** — only when file-disjoint; otherwise sequential.
- **Never leave the tree broken** — if a merge breaks the build, fix it before continuing.
- **Never commit secrets** — `.env`, `.env.local`, and keys stay out of git (`.gitignore`).
- **Definition of Done (v0)** — see `docs/SPEC.md` §10.

## Orchestration commands

- `/kickoff <goal>` — start the non-stop loop.
- `/role worker|reviewer|merger|architect|supervisor` — manually take a role in the main agent.
- `run_agent` (model tool) — dispatch a subagent: `{role, task}` or `{tasks: [{role, task}, ...]}`.
