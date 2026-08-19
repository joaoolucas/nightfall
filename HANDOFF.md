# Handoff — Portage.fun

Paste this whole file as your first message to the next assistant.

---

You are picking up **Portage.fun**, a Starknet project, mid-task. Read this
briefing before touching anything. It exists because several of the facts below
cost real effort to establish, and a few of them contradict what you probably
believe.

## The project

An idle creature-collecting RPG that is also a submission for the STRK20
privacy hackathon.

- **Repo**: `C:\Users\joaol\Documents\projects\starknet`, branch `main`,
  remote `git@github.com:joaoolucas/portage-strk.git`. Working tree is clean at
  `bc22a1c`.
- **`app/`** — Next.js 16 client. The game simulation lives in `app/src/game/`
  (headless, deterministic, `npm run test:game`); the client UI is in
  `app/src/app/components/game/`.
- **`contracts/`** — Cairo, scarb 2.18, `npm run test:contracts` (36 tests).
- **Live at portage.fun.** Deploys are **manual and local**: `cd app && npx
  vercel deploy --prod --yes`. There is **no GitHub integration** — pushing to
  `main` deploys nothing. The user's standing instruction is that finished work
  must end up on `main` *and* deployed.

Verify with: `cd app && npm run lint && npm run test:game`, and
`npm run test:contracts` from the root.

## Where things stand

The deployed game runs entirely in the browser against `localStorage`. **It
touches no chain** — no wallet, contract or STRK20 call is reachable from any
screen. The chain code is real and typechecked but orphaned; `app/src/app/
page.tsx` renders only `GameClient`.

Recent work, newest first: a commit-reveal hatch replacing a grindable one;
corrections to false "provably fair" claims that were live on the site; several
movement bugs in the game sim; a Market tab (trading post).

## The immediate next step, and what is blocking it

**Blocked on the user funding a testnet account.** Nothing else.

A throwaway Sepolia account was generated for them. Address:

```
0x73f9f1026babf5584bc3afed7897d6bb0360b03525ddc4f29cf8e4e78120ae9
```

Its credentials are already in `app/.env.local` as `DEPLOYER_ADDRESS` /
`DEPLOYER_PRIVATE_KEY` (gitignored — confirm with `git check-ignore -v
app/.env.local` before doing anything near it). It is a **counterfactual**
address: it does not exist on chain until its first transaction deploys it.
The user was sent to https://starknet-faucet.vercel.app/ for **STRK** (not
ETH — Starknet fees are STRK now).

Once they confirm it is funded, run in this order:

1. `deployAccount` via starknet.js to materialise the account (pays from its
   own balance; class hash and public key are in `app/.env.local`).
2. `npm run deploy` with `PORTAGE_NETWORK=sepolia`, `PORTAGE_RPC_URL=…`,
   `DEPLOYER_ADDRESS=…`, `DEPLOYER_PRIVATE_KEY=…`. Writes
   `contracts/deployments/sepolia.json`.
3. `npm run verify:hatch` — a real commit → wait 10 blocks → reveal, then an
   independent recomputation of the roll checked against what the chain stored.

Full runbook: `docs/DEPLOYMENT.md`. Step 3 is the point of the exercise, not
step 2 — see below.

## Facts that will cost you time if you assume otherwise

**`get_block_hash_syscall` has no upper age limit.** Its range is
`[first_v0_12_0_block, current_block - 10]`. Only the lower bound binds. I
originally documented a 1024-block ceiling, built `REVEAL_WINDOW` around it and
wrote a test asserting it; all of that was wrong and is now corrected
(`10fe9eb`). `REVEAL_WINDOW = 1000` survives as *policy* — it frees an
abandoned commitment slot and makes declining a roll cost something — not as a
protocol constraint.

**The `cairo_test` VM cannot execute `get_block_hash_syscall`.** It returns
`Err`. Verified empirically with a throwaway test. This is why the reveal's
happy path is not a unit test and why `scripts/verify-hatch.mjs` exists. Tests
that merely need a creature to exist use `mint_for_testing`, gated behind
`#[cfg(test)]` so it cannot reach the deployed class. **Do not** try to make
the happy path a unit test; do not add a production seam to work around it.

**The STRK20 privacy pool is Mainnet-only.** The `awesome-strk20` list names
exactly one deployed pool (`0x040337b1…`, Mainnet). Ready's in-wallet privacy
is Mainnet-only; Xverse's dapp-facing API is not shipped. What looks like
testnet in `_reference/starknet-privacy/demo/.env.example` is
`SN_INTEGRATION_SEPOLIA` — a StarkWare integration network, not public Sepolia,
requiring your own deployed pool plus indexer and prover. There is no testnet
rehearsal for the pool half. Do not go looking for a Sepolia pool address; it
does not exist.

**`*.public.blastapi.io` is decommissioned.** It answers every request with
"Blast API is no longer available". It used to be the default in three places.
Nethermind's free RPC and Lava's testnet gateway were both checked and neither
answers reliably. The user's Alchemy key in `.env` (`ALCHEMY_MAINNET_URL`)
**works on both networks** — swap the host between `starknet-mainnet` and
`starknet-sepolia`. Confirmed returning `SN_SEPOLIA`.

**`contracts/src/portage.cairo` has no upgrade path.** No proxy, no
`replace_class_syscall`, no admin. A Mainnet deploy is permanent; fixing
anything afterwards means a second contract with the first stranded on chain
forever. This is why the contract must not go to Mainnet until step 3 above has
passed on Sepolia.

**The submission bar** is in `scripts/validate-strk20.mjs`: ≥3 Mainnet
transactions *each carrying an event from the canonical pool*, ≥1 deployed
Mainnet contract, plus `demo_video` and `demo_url`. Contracts and transactions
are checked independently — the 3 transactions can be plain shield / private
transfer / unshield and need not touch Portage at all. `strk20.json` currently
has empty arrays.

**TypeScript and Cairo poseidon agree**, and it is pinned rather than assumed:
`hash.computePoseidonHashOnElements` == `poseidon_hash_span`. Shared vectors are
asserted in `test_poseidon_matches_starknet_js` and re-checked by
`npm run verify:hatch -- --offline`. A divergence is not a compile error on
either side — it is a reveal that reverts as `BAD_SECRET` after the commit is
already paid for.

**Environment**: Windows, PowerShell plus a Bash tool. `scarb` 2.18 is
installed. `starkli`, `starknet-devnet`, `sncast`, `snforge`, `cargo`, `docker`
and `python` are **not**. `perl` and `curl` are. Do not reach for python.

## Things already tried and rejected — do not redo them

**Holding a route until the quarry leaves the end of it**, instead of repathing
every 6 ticks, in `app/src/game/sim/ai.ts`. It looks like the fix for the
Porter's direction dithering (7 in 10 reversals are a route doubling back on an
unchanged destination) but it measurably worsens things: reversals 7.5% → 8.6%
of steps, apparent fleeing 5.0% → 9.3%. A note in the source says so. If you
want to attack the dithering, the remaining lead is A\* itself, which rounds an
obstacle either way with no preference.

**Player step cost of 3 or 2 ticks.** 4 is deliberate. 3 reads as scurrying; 2
puts the Porter 11 tiles clear of their creature, past the 8 it will engage
within, so it abandons fights. The speed the game actually gained came from
making coins weightless, not from the step cost.

## How this repo is written

Match it; the user cares about this.

- Comments explain **why**, including what was tried and rejected and what the
  measured numbers were. They are prose, not labels. Do not write comments that
  restate the code.
- Commit messages are long and explanatory: what was wrong, why it was wrong,
  what changed, what was considered and dropped. Ending line:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Tests are named as sentences describing the behaviour
  ("an overloaded Porter does not stand guard over loot they cannot lift").
- The user writes in Portuguese; answer in Portuguese.
- Claims in user-facing text and docs are held to being *true*. A live
  "provably fair" claim was removed for exactly this reason (`59541f2`). If you
  cannot yet demonstrate something, do not describe it as done.

## Boundaries the user has agreed to

- **Mainnet transactions are the user's to execute**, not yours. You build the
  flow; they click. Do not send funds.
- Testnet first for everything that can be rehearsed there.
- Private keys never go into a transcript or into `.env` (which is committed —
  note `PIXELLAB_API_KEY` is already exposed there and should be rotated).
  Credentials belong in `app/.env.local`.
- Branch before committing when on `main`, unless the user says otherwise; they
  have been merging fast-forward to `main` and deploying from there.

## After Sepolia passes

The agreed order, decided with the user:

1. Wire the STRK20 privacy drawer into the Market tab — `app/src/utils/
   strk20.ts` is written and typechecked but surfaced nowhere. It is the
   natural home because that tab already deals in currency.
2. The 3 Mainnet pool transactions (shield → private transfer → unshield),
   minimal amounts, **executed by the user**. Note the ~10-block note maturity:
   shield first, pay later, or the public deposit and the private action
   correlate in time and the privacy is lost.
3. Only then the Mainnet contract deploy, and only if step 3 of the Sepolia
   sequence passed.

Explicitly **deferred**: Phase 2 private marketplace settlement. It needs an
independently reviewed Cairo anonymizer and the project's own plan requires
audit before Mainnet. `Marketplace.tsx` already tells users it is disabled.
Do not rush it.
