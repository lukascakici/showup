# Security report — the contract layer, frozen

**What this is.** Showup's three Soroban contracts are being deployed to Mainnet,
where a mistake is somebody's money rather than a bug. Before that happens the
contracts were frozen at one commit and put through the static analysis an audit
expects to see run first. This page is the result: **every finding, what was done
about it, and the reasoning for anything deliberately left as it is.**

A report with no findings is a report nobody believes. There were 73. Twelve were
fixed, including **every critical one**; the remaining 61 each have a decision
below.

| | |
| :-- | :-- |
| Analyser | **CoinFabrik Scout `0.3.17`**, 39 detectors |
| Code analysed — *before* | commit [`b9fd4d4`](https://github.com/lukascakici/showup/commit/b9fd4d4a5ce537cac69ea321f53e055abdd73b71) — the contract layer frozen 17.11.2026 |
| Code analysed — *after* | commit [`6f5e2fd`](https://github.com/lukascakici/showup/commit/6f5e2fdde2569fdc9e0f4b81561448bb20b85971) — the fixes, and what every "after" number below was measured on |
| Scope | all four crates: `event`, `factory`, `reputation`, `interfaces` |
| When it runs | **every push** that touches the contracts, as the `Security` job in CI, with the version pinned |
| Does it block | **Yes**, since 21.11.2026 — see [what stops this page going out of date](#what-stops-this-page-going-quietly-out-of-date) |
| Fixes live on Testnet | 21.11.2026 — event wasm `5f5e0ec5…`, factory wasm `110c1658…`, [recorded with every transaction](../deployments.md#upgraded-a-fifth-time--every-amount-bounded-the-money-path-checked-21112026) |

Pinned on purpose: a detector set that changes underneath the report makes every
finding in it unreproducible.

---

## The baseline, and where it stands now

| Crate | Critical | Medium | Minor | Enhancement |
| :-- | --: | --: | --: | --: |
| `event` | 10 → **0** | 14 → **13** | 0 | 18 |
| `factory` | 1 → **0** | 8 | 0 | 7 |
| `reputation` | 0 | 2 | 0 | 12 |
| `interfaces` | 0 | 0 | 0 | 1 |
| **Total** | **11 → 0** | **24 → 23** | **0** | **38** |

| Detector | Severity | Before | After |
| :-- | :-- | --: | --: |
| `integer_overflow_or_underflow` | critical | 11 | **0** |
| `front_running` | medium | 1 | **0** |
| `dynamic_storage` | medium | 11 | 11 |
| `contract_import_dependency` | medium | 6 | 6 |
| `init_instead_of_constructor` | medium | 3 | 3 |
| `missing_new_admin_auth` | medium | 2 | 2 |
| `dos_unexpected_revert_with_storage` | medium | 1 | 1 |
| `storage_change_events` | enhancement | 30 | 30 |
| `soroban_version` | enhancement | 4 | 4 |
| `assert_violation` | enhancement | 4 | 4 |

---

## The 11 critical findings — fixed

**Every one was the same class: arithmetic that is not explicitly bounded.**

| Where | Operation |
| :-- | :-- |
| `event/src/lib.rs:378` | `fee_allowance * capacity` — funding the fee pool |
| `event/src/lib.rs:456` | `capacity - reserved.len()` — spots left |
| `event/src/lib.rs:677` | `deposit + fee_allowance` — what a check-in returns |
| `event/src/lib.rs:836` | `reserved.len() - showed - reclaimed.len()` — the no-show count |
| `event/src/lib.rs:838` | `deposit * no_shows` — total forfeited |
| `event/src/lib.rs:843` | `fee_allowance * (capacity - showed)` — the unspent pool |
| `event/src/lib.rs:855` | `forfeited + unspent_pool` |
| `event/src/lib.rs:873` | `forfeited - share * showed` — the division dust |
| `event/src/lib.rs:874` | `remainder + unspent_pool` |
| `factory/src/lib.rs:175` | `count + 1` — the event counter |

### The first thing that decides what these mean

```toml
[profile.release]
overflow-checks = true
```

These contracts are built with overflow checks **on**. That is not the Rust
default for a release build, and it changes the whole category: an operation that
went out of range would **halt the transaction**, not silently wrap to a wrong
number. Nothing here can quietly mis-pay anybody. The worst case is a call that
refuses to complete.

So the question for each one is narrower and more useful: *can somebody other
than the organiser make one of these halt, and would it strand money?*

### The three that depend on guest behaviour — proven unreachable

These are the only ones whose inputs move when guests act, so they are the only
ones a stranger could aim at.

**`capacity - reserved.len()` (line 456).** `rsvp` refuses at
`reserved.len() >= capacity` *before* the list is appended to
(`event/src/lib.rs:442`). So at the subtraction the list is at most `capacity`
long, and the result is at least zero. It cannot go negative.

**`reserved.len() - showed - reclaimed.len()` (line 836).** Everyone in
`checked_in` and everyone in `reclaimed` was `Reserved` first and is therefore in
`reserved`. The two lists cannot overlap: `check_in` refuses a guest who has
reclaimed, and `reclaim` refuses a guest who has checked in. So
`showed + reclaimed ≤ reserved`, and the subtraction cannot go negative. Both
halves of that disjointness have their own tests —
`checking_in_after_reclaiming_is_refused` and
`reclaiming_is_refused_to_a_guest_who_already_checked_in`.

**`capacity - showed` (line 843).** `showed ≤ reserved.len() ≤ capacity`, by the
same guard as the first one.

### The rest are the organiser's own numbers

`fee_allowance * capacity`, `deposit + fee_allowance` and the settlement
multiplications are all bounded by values the organiser chose when they created
the event, validated non-negative at `initialize`. An organiser who supplies an
absurd `fee_allowance` halts **their own** `create_event` transaction and nobody
else's — no deposit has been locked at that point, because the event does not
exist yet.

`count + 1` on the factory is a `u32` that would need 4.29 billion events.

### What was done, and the option that was rejected

**The obvious fix is `saturating_sub`, and it would have made the contracts less
safe.** Each of those three subtractions is correct because of an invariant
enforced somewhere else — the capacity guard, the mutually exclusive attendance
states. Saturating arithmetic would turn a broken invariant into a *silently
wrong* no-show count, and a wrong no-show count mis-pays real money to real
people. A transaction that refuses to complete is recoverable; a settlement that
completes with the wrong arithmetic is not.

So the money path was made **checked**, not saturating, in two layers.

**A ceiling, fixed once at creation.** `initialize` now refuses any event where
`(deposit + fee_allowance) * capacity` — the most the contract could ever hold —
does not fit in an `i128`, with a new `AmountsTooLarge` error. That single bound
puts every amount the settlement computes in range by construction: the
forfeited total, the unspent pool, their sum, one guest's refund, and each
attendee's share. It is checked while the three numbers are still the
organiser's to change, rather than at a settlement where somebody's money
already depends on them — and before the fee pool is pulled, so a refusal never
takes the organiser's money with it.

**Checked arithmetic with a name, everywhere in the money path.** Every
multiplication, addition and subtraction that moves or sizes a payment now goes
through `checked_*` and returns `InvariantViolated` rather than trapping. That
error is unreachable while the invariants hold — which is the point. If one ever
stops holding, settlement **refuses with a name** instead of halting on an
opaque host panic, and a named refusal can be diagnosed where a panic cannot.

The factory's event counter got the same treatment with `CounterExhausted`, and
deliberately not `saturating_add`: the counter doubles as the deploy salt, so a
count that stopped moving would start handing new events the address of an
existing one — far worse than refusing to create the 4,294,967,296th.

**Four tests** cover the new bound: the addition overflowing, the multiplication
overflowing across capacity, ordinary amounts being unaffected, and — the one
that matters — the refusal landing *before* any money moves.

**Status: fixed. Scout reports 0 critical findings across all four crates.**

---

## The remaining 23 medium findings

| Count | Finding | Decision |
| --: | :-- | :-- |
| 11 | Dynamic types in instance/persistent storage | **Ten acknowledged, one real and tracked.** The event contract's reserved, checked-in, reclaimed and voucher lists are `Vec<Address>` bounded by that event's own `capacity`, which is fixed at creation and cannot be raised — the growth the detector warns about is capped by a number the contract already enforces. The factory's list of every event it has ever created is **not** bounded, and that one is a genuine long-term limit rather than a false positive: it is one instance entry that grows forever. At the current size it is nothing; the fix is paginated reads, and it is a redesign rather than a patch. |
| 6 | `contractimport!` without a tracked dependency, and not using `/release/deps/` | **Acknowledged, test-only.** All six are in test files, where the whole point is to load the *built wasm* rather than link the crate — linking it would publish one contract's types into another's spec, which this project avoids deliberately. See below on why they are not silenced. |
| 3 | Use the constructor pattern instead of `init` | **Acknowledged.** `initialize` predates the pattern and is load-bearing for every deployed contract; changing it would break the factory's deploy-and-initialise call and every existing event. |
| 2 | New admin must sign before being stored | **See below — this one is answered by design.** |
| 1 | Storage operation without access control | **Acknowledged.** The flagged write is inside a call already gated by `require_auth`. |
| 1 | Transferred amount should have a minimum, against front-running | **Gone.** It was flagged on the fee-pool transfer at creation, and cleared when that line became a checked call. There was no exposure either way: a deposit is a fixed amount set at creation and returned in the same asset, with no price, no swap and no ordering advantage. |

### Why the test-only findings are left visible rather than silenced

Ten of the remaining findings are in test files, and the tidy move would be an
`#[allow(...)]` on each. **It was tried and rejected, because it costs more than
it saves.**

Scout's detectors are dylint lints, so rustc does not know their names. An
`#[allow(contract_import_dependency)]` fails the build:

```
error: unknown lint: `contract_import_dependency`
  = note: `-D unknown-lints` implied by `-D warnings`
```

Silencing *that* needs `#[allow(unknown_lints)]`, which switches off a real rustc
diagnostic class across the scope it covers — a worse trade than the report noise
it removes. CI builds with `-D warnings` and will keep doing so, so these ten
findings stay visible and stay explained here instead.

### `missing-new-admin-auth`, and why the answer is two transactions

Scout asks that a new admin authorise before the role is stored. **It is, and by a
stronger mechanism than the one the detector looks for.**

The admin does not move in one call. `propose_admin` nominates and changes
nothing; `accept_admin` is a second transaction that **only the nominated address
can send**, because it authorises as itself. An address nobody controls can never
complete the handover, so a mistyped address cannot strand the contract — it is
corrected by proposing again.

The single-call version the detector expects would require a signed
authorisation entry from an address that is not the transaction's source. That is
exactly what a key held outside the signing machine cannot conveniently produce
— and the whole purpose of this handover is to move the admin **off** the
machine, so the one-call form would have been the version that could not be
executed.

The destination makes the point sharper rather than softer. The admin is becoming
a **2-of-3 account**, where authorisation comes from two signatures gathered in
two places; an auth entry from a non-source address would have needed both of
them, assembled by hand, for every admin call forever. The two-step handover
keeps each half an ordinary single-source transaction that ordinary multisig
rules already know how to check.

Both halves were run end to end on the live Testnet factory and then undone, and
the 2-of-3 authorisation was proven against a throwaway factory before anything
depended on it — one signature refused `txBadAuth`, two accepted.
[The transactions are recorded here.](../deployments.md#the-admin-handover-rehearsed-on-the-live-contracts-21112026)

**Status: not changed. The two-step handover is the mitigation, and it is
demonstrated rather than asserted.**

---

## The 38 enhancements

| Count | Finding | Decision |
| --: | :-- | :-- |
| 30 | Consider emitting an event when storage is modified | **Checked one by one; already satisfied.** Every state change worth watching from outside already publishes — `Reserved`, `CheckedIn`, `Finalized`, `DepositReclaimed`, `ScoreChanged`, `EventRegistered`, `EventAbandoned`, `VouchRecorded`, `RecordRenewed`, `AdminProposed`, `AdminChanged`, the phase transitions, the host list and both halves of an application. The detector fires on the function, not on the absence of an event. What is left is internal bookkeeping, where an event per write would charge every user fees for data nobody reads. |
| 4 | Use the latest Soroban version | **Acknowledged, scheduled.** The contracts are built against `soroban-sdk 27.0.0` and run correctly under Protocol 30; the upgrade is tracked separately so that it does not move the code underneath this report. |
| 4 | `assert` causes a panic — return an error instead | **Acknowledged, test-only.** All four are in test code. |

---

## Reproducing this

Scout 0.3.17 does not install cleanly at the time of writing: it pins
`dylint_driver 4.1.2`, whose build script clones `rust-clippy` and checks out the
literal ref `master` — a branch that was renamed to `main`
([CoinFabrik/scout-audit#350](https://github.com/CoinFabrik/scout-audit/issues/350)).
CI works around it with a local mirror carrying both names, and the same steps
work locally:

```bash
# A full clone — a shallow one gets past the branch error and then cannot find
# the clippy commit matching Scout's nightly.
git clone --bare https://github.com/rust-lang/rust-clippy /tmp/rust-clippy.git
git -C /tmp/rust-clippy.git branch master main
git -C /tmp/rust-clippy.git symbolic-ref HEAD refs/heads/master
git config --global url."file:///tmp/rust-clippy.git".insteadOf \
  https://github.com/rust-lang/rust-clippy

cargo install cargo-scout-audit --locked --version 0.3.17
stellar contract build            # the tests contractimport! the wasm
cargo scout-audit
```

Every CI run publishes `scout-report.json` as an artefact, so the numbers above
can be checked against the run that produced them rather than taken on trust.
The artefact is uploaded before the check below, deliberately: the run that fails
is the run whose raw output somebody needs to read.

## What stops this page going quietly out of date

A security report is true the day it is written. What it cannot survive on its
own is the next commit: a new unbounded subtraction, a new unbounded `Vec`, a new
admin setter — each would be a finding nobody read, sitting in a document that
says there are none of those.

So since 21.11.2026 the `Security` job is **blocking**, gated by
[`scripts/check-scout-baseline.mjs`](../../scripts/check-scout-baseline.mjs),
which holds this page's numbers as a machine-readable baseline and fails CI on:

- **any critical finding**, with no baseline to appeal to. Every critical finding
  this project has ever had was unbounded arithmetic standing on somebody's
  deposit.
- **any detector rising above the count published above.** Adding a finding
  therefore costs a deliberate edit to that baseline *and* a decision written
  into this page — which is the discipline this page claims to follow, enforced
  rather than promised.
- **an empty report.** Zero findings is not a pass: a detector build that fails
  leaves an empty file behind, and that looks identical to a clean run.

Counts that *drop* are reported but never auto-lowered. Tightening the baseline
is its own commit, so a fix and a regression in the same push can't cancel out.

It was `continue-on-error: true` until the triage was finished, and that was the
right default for exactly as long as it lasted: a job that is permanently red on
73 known findings is a job everybody learns to scroll past.
