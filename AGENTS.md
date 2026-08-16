# Non-Stop Orchestration Protocol (Hackathon)

## Project: Nightfall

**What we build** (north star = `docs/SPEC.md`): a platform for provably-fair
social games with STRK20 privacy. Anchor title: **Nightfall: One Night**
(One Night Werewolf).

**Components**:

- `contracts/` — Cairo: Fair Game Engine (`privacy_invoke` anonymizer)
- `app/` — Next.js (STRK20 starter kit)
- `keeper/` — AI player agents (per-seat viewing key, LLM decides action/vote)
- `docs/` — SPEC + README + docs

**Locked product decisions**: staked + free mode · turn-based (not real-time) ·
AI agents (not bots) · monetization via on-chain rake · v0 = wedge architected as
a reusable platform.

This repo uses pi as a multi-role orchestrator. The **main agent** is the
Supervisor and dispatches **subagents** (isolated `pi` processes) with
specialized models.

## Roles

| Role | Model | Thinking | Tools |
|------|-------|----------|-------|
| Supervisor | `openai-codex/gpt-5.6-sol` | high | read, bash, edit, write, grep, find, ls, run_agent |
| Worker | `orcarouter/deepseek/deepseek-v4-pro-0813` | high | read, bash, edit, write, grep, find, ls |
| Reviewer | `claude-bridge/claude-opus-5` | high | read, grep, find, ls, bash (read-only) |
| Merger | `orcarouter/deepseek/deepseek-v4-pro-0813` | high | read, bash, edit, write, grep, find, ls |
| Architect | `orcarouter/grok/grok-4.6` | high | read, grep, find, ls |

Commands: `/role <role>` switches the main agent's model; `/kickoff <goal>`
starts the non-stop loop.

## Non-stop loop

Repeat until the Definition of Done (v0, in `docs/SPEC.md`) is met:

1. **Plan** — read `docs/SPEC.md`, understand the goal, and break it into small tasks.
2. **Implement** — dispatch `run_agent` with `role=worker`. Use `tasks[]` (parallel)
   only for independent tasks that **do not** edit the same files
   (e.g. `contracts/`, `app/`, and `keeper/` can advance in parallel).
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
- **Definition of Done (v0)** — see `docs/SPEC.md` §9.

## Orchestration commands

- `/kickoff <goal>` — start the non-stop loop.
- `/role worker|reviewer|merger|architect|supervisor` — manually take a role in the main agent.
- `run_agent` (model tool) — dispatch a subagent: `{role, task}` or `{tasks: [{role, task}, ...]}`.
