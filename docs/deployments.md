# Deployments — Stellar Testnet

Everything below is live on the **Test SDF Network ; September 2015** and
verifiable on [Stellar Expert](https://stellar.expert/explorer/testnet). No real
funds are involved.

This file is cumulative. **v1** stays exactly as it was recorded — it is the
evidence that Deliverable 1 worked end to end, and deleting it would delete that
proof.

## Contracts — v2 (current)

| What | Value |
| :-- | :-- |
| Event factory | [`CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE`](https://stellar.expert/explorer/testnet/contract/CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE) |
| Reputation ledger | [`CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ`](https://stellar.expert/explorer/testnet/contract/CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ) |
| Event wasm hash | `96cd1eb65889b856ea033fde4b3537176641ad2ca1d3c8dc25f2226c140a6860` |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Deployer / admin | `GDL3H646S6HGGJTH2BBNCBDONJDN5E7L56ZRFWGCOSPXEDHOJLZOZKI5` |

### Why a new factory address

The v1 factory wrote its event wasm hash once, inside `initialize`, and had no
setter and no `upgrade`. Recording scores meant changing the event contract,
which means a new wasm hash — and a frozen factory can never be pointed at one.
So a new factory was unavoidable.

Since that cost had to be paid once, it was paid properly. The v2 factory has
`set_event_wasm_hash`, `set_reputation` and `upgrade`, all admin-gated, and the
reputation ledger has `set_factory` and `upgrade` of its own. **This is intended
to be the last forced migration:** a future event revision now costs an upload
and one admin call, not a new address, a binding regeneration and a v2/v3 split
through every document.

### Bringing it up

The two contracts each need the other's address, which cannot both be true at
deploy time. It resolves in one direction and then the other, and every step
below is a real transaction on Testnet.

| Step | Transaction |
| :-- | :-- |
| upload event wasm | [`265deb11…72da35`](https://stellar.expert/explorer/testnet/tx/265deb114c7bed1021e49e6b5784d73ac3f38de0f5ce224b60130345b372da35) |
| deploy factory v2 | [`ca327ecd…aed99c`](https://stellar.expert/explorer/testnet/tx/ca327ecd5bf18e23a92e2eedbb85c0511ad85ab995c18fe6ec3f3461a2aed99c) |
| `factory.initialize(admin, event_wasm_hash)` | [`fcecf709…37bbea`](https://stellar.expert/explorer/testnet/tx/fcecf709b6e3cb22343a209e372272a690c69dd975633aad339bfb84a637bbea) |
| deploy reputation | [`b80ec972…8f336c`](https://stellar.expert/explorer/testnet/tx/b80ec972cf9689fe69f97093ce7ff771c04cf2a7ab0dd0ab55130173708f336c) |
| `reputation.initialize(admin, factory)` | [`137b0150…1a6fae`](https://stellar.expert/explorer/testnet/tx/137b0150ae7f86afc548e6de53fc0a06183796df149b73cc7571c9f5301a6fae) |
| `factory.set_reputation(reputation)` | [`79b70065…2645bc`](https://stellar.expert/explorer/testnet/tx/79b70065d3fac0d84dd41f32cd77b2cdab8666a20514e3d74949591c292645bc) |

Verified afterwards by reading both contracts back, rather than by assuming the
calls did what they said:

```
factory.get_reputation()      -> CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ
factory.get_event_wasm_hash() -> 96cd1eb65889b856ea033fde4b3537176641ad2ca1d3c8dc25f2226c140a6860
reputation.get_factory()      -> CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE
```

### Upgraded in place, 08.08.2026 — no new addresses

Two changes had to reach the chain: storage leases (Soroban archives state after
about a week on Testnet, and nothing was extending it) and event titles. Both
landed **without a single address changing**, which is the entire argument for
the admin setters added on day two.

| Step | Transaction |
| :-- | :-- |
| `factory.set_event_wasm_hash` → new event revision | [`84c4088b…ac8aee`](https://stellar.expert/explorer/testnet/tx/84c4088ba46c0ba3632176c123ca3e2008c3634ad0ee4d369695296558ac8aee) |
| `factory.upgrade` → new factory code | [`4b81178d…1d2115`](https://stellar.expert/explorer/testnet/tx/4b81178d10794af68b9f510490f9414d04c5b9ee04aa9e312a7fb095781d2115) |
| `reputation.upgrade` → new ledger code | [`a3cc5193…983588`](https://stellar.expert/explorer/testnet/tx/a3cc5193197e9a0ba5ab76d083555eca1c6dcee9e9ae33b348d9ee9518983588) |
| extend the D2 event's lease from outside | [`30f4193f…69eb44`](https://stellar.expert/explorer/testnet/tx/30f4193f2e81aaa1ad5f39aee1586fb426a69ceab99c2297a45731eaf869eb44) |

Current event wasm hash: `8fe992b8209d298ecc7c2e2bd882f8fe6412572ef39bdbbf29a687bc69c10949`

State survived both upgrades — `reputation.get_score()` still returns
`{ shows: 1, no_shows: 0 }` for the guest who checked in, and the factory still
lists its events.

**One thing worth knowing before upgrading anything:** `upgrade` runs the *old*
code. `update_current_contract_wasm` swaps the code for the *next* invocation, so
the TTL extension written into the new version did not run during the upgrade
itself. Both contracts still read 6.9 days afterwards. One further admin call
each — `set_event_wasm_hash` and `set_factory`, both idempotent, both re-setting
the value they already held — ran the new code and took them to 90 days.

The D2 event could not fix itself either way: it runs the pre-TTL event wasm, and
an event contract has no `upgrade`. It was extended from outside with
`stellar contract extend`, which anyone can pay for on any entry. It is graded
evidence, so it must not archive.

| Contract | Lease before | after |
| :-- | --: | --: |
| factory | 6.9 days | **90.0 days** |
| reputation | 6.9 days | **90.0 days** |
| D2 event | 6.9 days | **90.0 days** |

### Events have names now

`Config` gained `title` (≤ 100 **bytes** of UTF-8) and `starts_at` (unix seconds,
UTC, informational — the phase machine remains the only authority on what is
allowed when). The first titled event, created through the upgraded factory:

[`CCWYYTY5…OMST6FL7C`](https://stellar.expert/explorer/testnet/contract/CCWYYTY5XCJY7KFPUWKMP4MELJG3G3FIYW2O3WJSMEIZTDKOMST6FL7C) — *"Perşembe halı saha, Kadıköy"*, created in
[`fa17c710…592c1a`](https://stellar.expert/explorer/testnet/tx/fa17c71042ca4ce3a2133504c5eb9c0421f953943891378d090b148c18592c1a)

The limit is bytes rather than characters because that is what storage costs.
"Perşembe halı saha, Kadıköy" is 27 characters and 31 bytes; a form that counted
characters would let a Turkish title through and the contract would reject it
after the wallet prompt.

Events created before this revision — including the D2 event below — have no
title at all. They still work, still settle, and are still listed; they show
their address, exactly as every event did until now.

## Deliverable 2 evidence — a score rises and falls

One event run start to finish with two guests: **one shows up, one doesn't.**
10 XLM deposit, capacity 2, a 0.1 XLM fee allowance per guest, forfeits set to
split among the people who show.

Event contract: [`CA6GPBTW…NO3GW2NQU`](https://stellar.expert/explorer/testnet/contract/CA6GPBTWNMC5GIP5L6IP3RT26ZXCI4L744DGPC2V4L5VSBXNO3GW2NQU)

| Who | Address |
| :-- | :-- |
| organizer | `GDL3H646S6HGGJTH2BBNCBDONJDN5E7L56ZRFWGCOSPXEDHOJLZOZKI5` |
| the guest who showed | `GA5TJJJCL2VXRFJPEQW42Q5GC7NOXWIXZRGOI77TEOW42OTW6KEVNGEO` |
| the guest who flaked | `GB2QLDW2Y6ETGK5Z7AO2XSYWNN6KZNC3ZQNJMVVUJWZBUG5C3Y2ZVOST` |

| Step | Transaction | What the chain shows |
| :-- | :-- | :-- |
| `create_event` | [`5feeec69…946240`](https://stellar.expert/explorer/testnet/tx/5feeec693c7f674e4c41457714ade03904f2846663606f98fac8b8b845946240) | event deployed, fee pool funded, **and `event_registered` published by the reputation ledger in the same transaction** |
| `rsvp` (showed) | [`64ebd04c…d5fffa`](https://stellar.expert/explorer/testnet/tx/64ebd04cec719183e6fe0a0d594b302f9a97c3ff632dc0891e057fa0c1d5fffa) | 10 XLM locked, `spots_left: 1` |
| `rsvp` (flaked) | [`6714a855…d5da56`](https://stellar.expert/explorer/testnet/tx/6714a8553fd6760b612d69aa7c59edfd7088d3a867dc5c22000a082db3d5da56) | 10 XLM locked, `spots_left: 0` |
| `open_checkin` | [`5f84bc62…b428aa`](https://stellar.expert/explorer/testnet/tx/5f84bc626a59da7e37abee0c01526273a9b1947b7311a6279b62a2392fb428aa) | `PhaseChanged { phase: CheckingIn }` |
| **`check_in` — the score rises** | [**`c76cd351…fd9357`**](https://stellar.expert/explorer/testnet/tx/c76cd351f2645c2aec78f1e7b9687ada167790fbb9d8151af9a9dae0cefd9357) | 10.1 XLM returned **and** `score_changed { shows: 1, no_shows: 0 }` |
| **`finalize` — the score falls** | [**`5d394178…7019dc`**](https://stellar.expert/explorer/testnet/tx/5d394178e5a9d58933ffa58b93ed1ce853c39ff3749f307c8b615e638f7019dc) | forfeited 10 XLM to the guest who showed, 0.1 XLM unspent pool back to the organizer, **and `score_changed { shows: 0, no_shows: 1 }`** |

The two rows in bold are what SOW §6.1 asks for against Deliverable 2. Note that
in both, the score moves **inside the same transaction as the money** — the
event contract calls the ledger as part of `check_in` and `finalize`, so there
is no second transaction a reviewer has to be asked to trust.

### The scores, read back from the contract

An event log proves something happened. This proves it stuck:

```
reputation.get_score(guest who showed)  -> { shows: 1, no_shows: 0 }
reputation.get_score(guest who flaked)  -> { shows: 0, no_shows: 1 }
reputation.get_score(never seen before) -> { shows: 0, no_shows: 0 }
reputation.is_registered(the event)     -> true
```

The third line is deliberate: an address nobody has ever recorded reads as zero
rather than erroring, so nothing has to special-case a newcomer.

### The gate, refused on-chain

`register_event` is callable only by the factory, and a score write is accepted
only from a registered event that also authorizes the call itself. Both were
tried from an outside account and both were refused:

| Attempt | Result |
| :-- | :-- |
| `record_checkin` from an address the factory never registered | rejected, `Error(Contract, #3)` — `NotAnEvent` |
| `set_factory` from a non-admin | rejected before submission — the simulation demands the admin's signature |

### Where the money ended up

| Account | Opened | Closed | Net |
| :-- | --: | --: | --: |
| organizer | 9,989.4453511 | 9,986.3944544 | −3.0508967 |
| the guest who showed | 10,000.1852403 | 10,010.2539992 | **+10.0687589** |
| the guest who flaked | 10,000.0000000 | 9,989.9956228 | **−10.0043772** |

**The person who turned up left 10 XLM richer; the person who didn't left 10 XLM
poorer.** That is the entire product in two rows. The organizer's −3.05 is
almost all one-off deployment cost — uploading a wasm and deploying two
contracts — not the cost of running an event.

The event contract's balance after `finalize` is **0**. Nothing is stranded.

## Contracts — v1 (superseded, still verifiable)

The original deployment, kept intact. Its events are still readable on Stellar
Expert but will not appear in the v2 factory's `list_events()`.

| What | Value |
| :-- | :-- |
| Event factory | [`CAI5RQZFS46KK2MWOBW7EEM3DJWJN6JSE5LW5JRJ6RCIJMTHCA7JD3CW`](https://stellar.expert/explorer/testnet/contract/CAI5RQZFS46KK2MWOBW7EEM3DJWJN6JSE5LW5JRJ6RCIJMTHCA7JD3CW) |
| Event wasm hash | `aef70ac35e540a1e5b48277c7c740277f91334f6defbf7dca47ca07f6fd8171d` |

Events created by this factory have no reputation ledger — `Config.reputation`
is `None` — and settle exactly as they always did. That path is covered by
`an_event_with_no_ledger_runs_the_whole_flow` in the event contract's tests.

### A full event, end to end (v1)

One event run start to finish on Testnet: 10 XLM deposit, capacity 5, a 0.1 XLM
fee allowance per guest, forfeits set to split among attendees.

Event contract: [`CB4HHNLD…KXLN66ZIW`](https://stellar.expert/explorer/testnet/contract/CB4HHNLDAR5FCX7CRSFGJTNGPALB4ZZQXXDYCCQMR4EFKBKEXLN66ZIW)

| Step | Result |
| :-- | :-- |
| `create_event` | event deployed and its fee pool funded in one transaction |
| `rsvp` | 10 XLM locked |
| `check_in` **before** check-in opened | rejected, `Error(Contract, #13)` — `CheckInNotOpen` |
| `open_checkin` | `PhaseChanged { phase: CheckingIn }` |
| `rsvp` **after** check-in opened | rejected, `Error(Contract, #12)` — `ReservationsClosed` |
| `check_in` with the wrong secret | rejected, `Error(Contract, #10)` — `WrongCode` |
| `check_in` with the right secret | 10.1 XLM returned |
| `finalize` | no-shows settled, unspent fee pool returned |

**The guest opened with 10,000 XLM and closed with 10,000.19 XLM.** They got the
deposit back and the 0.1 XLM allowance more than covered the fees they spent —
which is the point of the organizer funding the pool upfront: showing up must
never cost the guest money.

The two rejections in bold are the phase machine doing its job. Without it,
someone forwarded the check-in link could reserve and check in on the spot
without ever attending, pocketing the fee allowance and taking a cut of the
no-shows' forfeited deposits.

## Reproducing

```bash
stellar contract build

# 1. the event revision the factory will deploy
stellar contract upload --source <key> --network testnet \
  --wasm target/wasm32v1-none/release/event.wasm            # -> <event wasm hash>

# 2. the factory, which is also the root of trust for scoring
stellar contract deploy --source <key> --network testnet \
  --wasm target/wasm32v1-none/release/factory.wasm          # -> <factory>
stellar contract invoke --id <factory> --source <key> --network testnet -- \
  initialize --admin <key address> --event_wasm_hash <event wasm hash>

# 3. the ledger, which has to be told who the factory is...
stellar contract deploy --source <key> --network testnet \
  --wasm target/wasm32v1-none/release/reputation.wasm       # -> <reputation>
stellar contract invoke --id <reputation> --source <key> --network testnet -- \
  initialize --admin <key address> --factory <factory>

# 4. ...and then pointed back at, closing the circle
stellar contract invoke --id <factory> --source <key> --network testnet -- \
  set_reputation --reputation <reputation>
```

Step 4 is a separate admin call rather than an `initialize` argument because the
two addresses cannot both exist first. Both directions stay changeable
afterwards (`factory.set_reputation`, `reputation.set_factory`), which is what
makes a redeploy of either contract recoverable instead of fatal.

The check-in secret is never stored on-chain — only its sha256. Pass the secret
to `check_in` as hex:

```bash
printf 'your-secret' | shasum -a 256   # code_hash, given at create_event
printf 'your-secret' | xxd -p          # secret, given at check_in
```
