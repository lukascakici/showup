# Security report — the contract layer, frozen

**What this is.** Showup's three Soroban contracts are being deployed to Mainnet,
where a mistake is somebody's money rather than a bug. Before that happens the
contracts were frozen at one commit and put through the static analysis an audit
expects to see run first. This page is the result: **every finding, what was done
about it, and the reasoning for anything deliberately left as it is.**

A report with no findings is a report nobody believes. There are 73.

| | |
| :-- | :-- |
| Analyser | **CoinFabrik Scout `0.3.17`**, 39 detectors |
| Code analysed | commit [`b9fd4d4`](https://github.com/lukascakici/showup/commit/b9fd4d4a5ce537cac69ea321f53e055abdd73b71) — the contract layer frozen 17.11.2026 |
| Scope | all four crates: `event`, `factory`, `reputation`, `interfaces` |
| When it runs | **every push**, as the `Security` job in CI, with the version pinned |

Pinned on purpose: a detector set that changes underneath the report makes every
finding in it unreproducible.

---

## The baseline

| Crate | Critical | Medium | Minor | Enhancement |
| :-- | --: | --: | --: | --: |
| `event` | 10 | 14 | 0 | 18 |
| `factory` | 1 | 8 | 0 | 7 |
| `reputation` | 0 | 2 | 0 | 12 |
| `interfaces` | 0 | 0 | 0 | 1 |
| **Total** | **11** | **24** | **0** | **38** |

---

## The 11 critical findings

**Every one is the same class: arithmetic that is not explicitly bounded.**

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

### Why none of these is being "fixed", and why that is the safer answer

The obvious fix is `saturating_sub` and `checked_mul`. **For the three
subtractions it would make the contracts less safe, not more.**

Each of those three is correct because of an invariant enforced in a different
function. That kind of reasoning is exactly what rots: if a future change ever
removes somebody from `reserved` without removing them from `checked_in`, the
invariant breaks. Today that breakage **halts settlement loudly**. With
`saturating_sub` it would instead produce a silently wrong no-show count — and
a wrong no-show count mis-pays real money to real people.

A transaction that refuses to complete is recoverable. A settlement that
completes with the wrong arithmetic is not.

So the decision is to keep the checked arithmetic, and to defend the invariants
where they actually live — in the tests that already enforce them. **Status:
acknowledged, not changed, deliberately.**

---

## The 24 medium findings

| Count | Finding | Decision |
| --: | :-- | :-- |
| 11 | Dynamic types in instance/persistent storage | **Acknowledged.** The reserved, checked-in, reclaimed and voucher lists are `Vec<Address>`, bounded by the event's own `capacity`, which is fixed at creation and cannot be raised. The growth a detector warns about is capped by a number the contract already enforces. |
| 3 | `contractimport!` without a tracked dependency | **Acknowledged, test-only.** It appears in test files, where the whole point is to load the *built wasm* rather than link the crate — linking it would publish one contract's types into another's spec, which this project avoids deliberately. |
| 3 | `contractimport!` should use `/release/deps/` | **Acknowledged, test-only.** Same three sites. |
| 3 | Use the constructor pattern instead of `init` | **Acknowledged.** `initialize` predates the pattern and is load-bearing for every deployed contract; changing it would break the factory's deploy-and-initialise call and every existing event. |
| 2 | New admin must sign before being stored | **See below — this one is answered by design.** |
| 1 | Storage operation without access control | **Acknowledged.** The flagged write is inside a call already gated by `require_auth`. |
| 1 | Transferred amount should have a minimum, against front-running | **Acknowledged.** There is no price, no swap and no ordering advantage here: a deposit is a fixed amount set at creation and returned in the same asset. |

### `missing-new-admin-auth`, and why the answer is two transactions

Scout asks that a new admin authorise before the role is stored. **It is, and by a
stronger mechanism than the one the detector looks for.**

The admin does not move in one call. `propose_admin` nominates and changes
nothing; `accept_admin` is a second transaction that **only the nominated address
can send**, because it authorises as itself. An address nobody controls can never
complete the handover, so a mistyped address cannot strand the contract — it is
corrected by proposing again.

The single-call version the detector expects would require a signed
authorisation entry from an address that is not the transaction's source, which
is exactly what a hardware wallet cannot conveniently produce. Since the whole
purpose of this handover is to move the admin **onto** hardware, the one-call
form would have been the version that could not be executed.

**Status: not changed. The two-step handover is the mitigation.**

---

## The 38 enhancements

| Count | Finding | Decision |
| --: | :-- | :-- |
| 30 | Consider emitting an event when storage is modified | **Partly adopted.** The writes that matter already publish: `Reserved`, `CheckedIn`, `Finalized`, `DepositReclaimed`, `AdminProposed`, `AdminChanged`, `EventAbandoned`, `VouchRecorded`. The remainder are internal bookkeeping, and an event per storage write would cost every user fees for data nobody reads. |
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

Every CI run publishes `scout-report.md` and `scout-report.json` as artefacts, so
the numbers above can be checked against the run that produced them rather than
taken on trust.
