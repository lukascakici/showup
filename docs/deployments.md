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
| Event wasm hash — **current** | `8fe992b8209d298ecc7c2e2bd882f8fe6412572ef39bdbbf29a687bc69c10949` |
| Event wasm hash — at v2 bring-up | `96cd1eb65889b856ea033fde4b3537176641ad2ca1d3c8dc25f2226c140a6860` |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Deployer / admin | `GDL3H646S6HGGJTH2BBNCBDONJDN5E7L56ZRFWGCOSPXEDHOJLZOZKI5` |

Two wasm hashes because the factory was pointed at a new event revision on
08.08.2026 — see *Upgraded in place* below, which records the transaction that
did it. The **current** one is the value `scripts/check-wasm-hash.mjs` asks the
live factory for on every push; the bring-up one is kept because the transactions
recorded under *Bringing it up* uploaded exactly that code, and deleting it would
make that record unverifiable.

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

## Deliverable 1 evidence — the app itself moves money

SOW §6.1 asks Deliverable 1 for the live link, the repo with CI passing, and two
screenshots: the wallet-selection dialog, and a completed transaction with its
hash and Explorer link. The link is [showup.click](https://showup.click); the
screenshots are `docs/screenshots/wallets.png` and
`docs/screenshots/event-created.png`. Both transactions behind the second one
were made through the app's own UI and signed in a browser wallet — not from the
CLI — which is the part a screenshot alone cannot prove:

[`CCBELUML…CDYA4G6X`](https://stellar.expert/explorer/testnet/contract/CCBELUML3QPYDXC7RSQUD3GPDCZ6P3DZYORTY6MCBRMIHFKLCDYA4G6X) — *"stellar party"*, Wed 26.08.2026 19:00 (UTC+3), 10 XLM deposit, capacity 10

| Action | Ledger | Transaction |
| :-- | --: | :-- |
| `create_event` | 4,056,609 | [`ca6c5474…f5104ffe`](https://stellar.expert/explorer/testnet/tx/ca6c547481a3704198f027157acba1bfd4f3b45f14210039daa06c97f5104ffe) |
| `rsvp` — the row visible in the screenshot | 4,056,613 | [`03d15919…416de3c8`](https://stellar.expert/explorer/testnet/tx/03d159194db4242e884c2b85d00fb4ea7c729e0b4684ec5e7e8ee35a416de3c8) |

Getting this screenshot took two attempts and changed the product, which is worth
recording rather than tidying away. The first one showed `ledger 4056613` where
the hash should have been: activity rows linked to Stellar Expert but printed the
ledger number, so the evidence was in the href and nowhere a reader could see it.
The same screenshot showed the heading `Event` on an event that by then had a
name on-chain — the detail page had never been taught to read `title`. Both are
fixed; the rows now print the hash and the page prints the name. The screenshot
requirement found two real gaps that the tests did not.

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

## Week 2 audit — everything above, re-checked against the live chain

Run on **09.08.2026** at ledger 4,056,789, reading the deployed contracts rather
than trusting anything written above. SOW §3 asks for this before a week can be
called done; the point is that every row here was produced by a call, not by
reading back the notes.

| Question | Answer from the chain |
| :-- | :-- |
| Is the reputation contract deployed? | yes — `CDFGVEIJ…YPEOLA3DJ` answers `get_admin` |
| Does the factory know the ledger? | `factory.get_reputation()` → `CDFGVEIJ…YPEOLA3DJ` |
| Does the ledger know the factory? | `reputation.get_factory()` → `CD5AEMRB…RKQLE7FCE` |
| Is the score readable from the contract? | guest who showed → `{ shows: 1, no_shows: 0 }` · guest who flaked → `{ shows: 0, no_shows: 1 }` |
| Is the D2 event still registered? | `reputation.is_registered(CA6GPBTW…)` → `true` |
| What wasm does the factory deploy events from? | `factory.get_event_wasm_hash()` → `8fe992b8…c69c10949` — the hash this machine's build produced when it was uploaded, and now what the README publishes |

Two things came out of it rather than passing quietly.

**The README's wasm hash was wrong.** It still published v1's
`96cd1eb6…140a6860` after two contract revisions and a redeploy. That is exactly
the kind of claim SOW §6.1 gets graded on, so it now has a check:
`scripts/check-wasm-hash.mjs` runs in CI right after `check-bindings` and fails
the build when the README's hash isn't the one the deployed factory uses. Both
values come out of the README's own table — the factory address and the hash —
so the table verifies itself. The read is keyless and free (`stellar contract
read` needs no source account), an unreachable RPC skips with a warning, and a
mismatch always fails.

**And the wasm turned out not to be byte-reproducible.** The first version of
that check compared the README against `sha256` of a local `stellar contract
build`, which is the obvious way to write it and is wrong. CI went red on its
first run: this repo builds `8fe992b8…` on macOS/arm64 and `fd400806…` on
Linux/x64 — same source, same pinned rustc 1.96.0, same locked soroban-sdk
27.0.0, same stellar CLI 27.0.0. The wasm's metadata sections carry nothing but
those version strings, so what differs is codegen across host platforms. The
comment in `rust-toolchain.toml` claiming the pin kept the hash reproducible has
been corrected; `stellar contract build --locked` was added in CI so the
lockfile can't quietly stop applying. The practical consequence: **the hash to
record is the one `stellar contract upload` prints, never one from a local
build on a different machine.**

**Storage leases are healthy.** The archival problem found on 08.08 is closed,
measured rather than assumed:

| Contract instance | Ledgers left | ~days |
| :-- | --: | --: |
| factory | 1,534,836 | 88.8 |
| reputation | 1,534,837 | 88.8 |
| event — D2 evidence | 1,534,840 | 88.8 |
| event — first titled | 1,534,849 | 88.8 |
| event — *"stellar party"* | 1,555,020 | 90.0 |

Week 4's real event runs around 26–29.08. Every one of these outlives it by more
than two months, and each write extends its own lease again on the way past.

## Deliverable 3 evidence — one real run, 12 wallets, 11 check-ins

Run on **23.08.2026**, remotely: no venue, every participant on their own phone
from wherever they were. Invitations went out in a group chat; twelve people
reserved within about an hour, eleven checked in, one did not.

The whole table below was read off the chain by
[`web/scripts/collect-evidence.mjs`](../web/scripts/collect-evidence.mjs)
(`npm run evidence -- <event>`), which walks the RPC's retained ledger range and
prints every `reserved`, `checked_in`, `phase_changed` and `finalized` event it
finds. Nothing here was typed by hand, and re-running it reproduces this section.

Every row comes from a contract event, never from a contract read. A guest listed
by `get_reserved` would have no transaction behind them; a hash is the only part
a reviewer can independently check, so a person with no hash does not get a row.

**Event**

| | |
| --- | --- |
| Event contract | [`CAOK5LMEBEFHYWXLD5D55U46E73FD5ZTTBBBMMQIBMLYXTZWEWMUTLJL`](https://stellar.expert/explorer/testnet/contract/CAOK5LMEBEFHYWXLD5D55U46E73FD5ZTTBBBMMQIBMLYXTZWEWMUTLJL) |
| Title | coffee time |
| Organizer | [`GBQRAW…E2O4PW`](https://stellar.expert/explorer/testnet/account/GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW) |
| `create_event` tx | [`740f54dc…5cfc75`](https://stellar.expert/explorer/testnet/tx/740f54dce873103569473f19520a0392099d7cfe1afc9eb7717890f44d5cfc75) |
| → `CheckingIn` tx | [`dfed9632…1d3337`](https://stellar.expert/explorer/testnet/tx/dfed9632e7a48b09413c1eb715d4957a11678c9103a4e93a02440e00d31d3337) |
| `finalize` tx | [`d9cd8c8f…7699dd`](https://stellar.expert/explorer/testnet/tx/d9cd8c8f078c3582dc7f0b343a3fcaa64468c71ae9df6db5a7ac5161aa7699dd) |
| Reserved / showed | 12 / 11 |
| Forfeited and split | 5.00 XLM |

**Attendees**

| # | Wallet address | `rsvp` tx | `check_in` tx | Showed |
| --- | --- | --- | --- | --- |
| 1 | [`GC5DKL…332MIH`](https://stellar.expert/explorer/testnet/account/GC5DKLTLWPTOQXHDVCCZLKUN54Y5LBNYWQHEESJI76ETCCSKBS332MIH) | [`60c62187…fda259`](https://stellar.expert/explorer/testnet/tx/60c621871d0c2b29746d4b797d627fd81e7690b909fa82a624b4aa8ccdfda259) | — | no |
| 2 | [`GBAW4G…CUFQXF`](https://stellar.expert/explorer/testnet/account/GBAW4G42254EEXDLUQ5X5GSZ6H7E46PM5AL364H2EVKRMMANDQCUFQXF) | [`bbbcc73b…17f177`](https://stellar.expert/explorer/testnet/tx/bbbcc73bf903cf7c2aa52bcf9d884589d51fcda3e0c1881bbfb31df13217f177) | [`7e0f0c95…7b5361`](https://stellar.expert/explorer/testnet/tx/7e0f0c95e935f217571b7ec28fc4329f137ee59774fd2609b396e05b727b5361) | yes |
| 3 | [`GBBHPJ…FCIDTL`](https://stellar.expert/explorer/testnet/account/GBBHPJYHGFN5UEFQCSQBS6J5FAL2UG4RAKJY545ESHSGBKMIKMFCIDTL) | [`da1361f4…54c7c5`](https://stellar.expert/explorer/testnet/tx/da1361f4b538dad0a67a3c2574fa107169477f97a009b8fb9953c8667054c7c5) | [`ac9589f7…77005e`](https://stellar.expert/explorer/testnet/tx/ac9589f73780fe5e59f094e4204f187434c4c333d675d00c4632812e5c77005e) | yes |
| 4 | [`GAESJS…HVURD7`](https://stellar.expert/explorer/testnet/account/GAESJSOUVOV4CIRKCWU6PXWILLO2VQN5RMFWHQVDISVUMWSBHHHVURD7) | [`18938881…517266`](https://stellar.expert/explorer/testnet/tx/189388810f91c661927daa2a5f7696bc5604fab1df7541dc581422a2ed517266) | [`21bd8dbc…2c4769`](https://stellar.expert/explorer/testnet/tx/21bd8dbcf0a6e5d97bdcc3391e66ded2d87fa06f5cf4c664fb50dd059f2c4769) | yes |
| 5 | [`GBTM4B…YDVVWQ`](https://stellar.expert/explorer/testnet/account/GBTM4BY6ABARXTZSVED6NZEHCFFHHNAO64WGTBIUPXAUIMRHBUYDVVWQ) | [`d8a161ab…079a5f`](https://stellar.expert/explorer/testnet/tx/d8a161ab9a841bfc1fa924b99d3f23f04c68f519083cc7e7dbc50947dc079a5f) | [`01524039…9925cd`](https://stellar.expert/explorer/testnet/tx/0152403930698e09ee69152b8761c958d29376e620e5dabc0d0995cc419925cd) | yes |
| 6 | [`GBQRAW…E2O4PW`](https://stellar.expert/explorer/testnet/account/GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW) | [`0479f8b0…720a2e`](https://stellar.expert/explorer/testnet/tx/0479f8b0e60177a9a4135d0ef6af6d9fbcbec8145f349f3784f36c37e3720a2e) | [`e91eb97f…83b45a`](https://stellar.expert/explorer/testnet/tx/e91eb97fda09eac349c0cb0c656b3673f61d419807cc89bcdf7571611783b45a) | yes |
| 7 | [`GBZTYV…ZEJP6Z`](https://stellar.expert/explorer/testnet/account/GBZTYVPNXDCDWXVOT6Y36TTC7DRQGSKCZF25OXVZYBGRONTJDPZEJP6Z) | [`c2beefc7…1f43bf`](https://stellar.expert/explorer/testnet/tx/c2beefc749d926d88041cb2ea5af09616c11c8f7dce27972f57cce3e591f43bf) | [`24e4ba5e…f24eaf`](https://stellar.expert/explorer/testnet/tx/24e4ba5e6f6bb646c3425733721ba0265c6c826efa3748e6a8921f0b7bf24eaf) | yes |
| 8 | [`GBCCJX…N7HESQ`](https://stellar.expert/explorer/testnet/account/GBCCJXEN2ZAAKAW4MOO4GJI7FMTISSYI3ZMS2QC5FGUA4WKYWHN7HESQ) | [`5ea3cc39…360a31`](https://stellar.expert/explorer/testnet/tx/5ea3cc39455eea3a1a51909539b545def4f08988b821412f9ea1c2bd90360a31) | [`c0d11d90…d45bc7`](https://stellar.expert/explorer/testnet/tx/c0d11d906c88cb34b92a5cedc8d3a64832bd356401e683a1a73f9c6687d45bc7) | yes |
| 9 | [`GBMQXT…LKRY2H`](https://stellar.expert/explorer/testnet/account/GBMQXTV2SJTKDFI2SHEZS35JBUFS2V5L4T7YJTR2ASGOS65LEGLKRY2H) | [`8614f36a…d9398c`](https://stellar.expert/explorer/testnet/tx/8614f36acbab7da76bb5c84177fe711efa20982a4887c67cbcb1bbe770d9398c) | [`0077a182…d3a643`](https://stellar.expert/explorer/testnet/tx/0077a18260bacaedd4c20834a7f57211dd33f4ef71231403880840f4d7d3a643) | yes |
| 10 | [`GCFCDF…FTWDUW`](https://stellar.expert/explorer/testnet/account/GCFCDFPTUGCHH4VQO3DQ3BQVBTCUA7W3U7NYPAYWMSH3GXWF46FTWDUW) | [`e038765e…defb9a`](https://stellar.expert/explorer/testnet/tx/e038765e2d8c929279ceefcfeff5d5eee559950d563baab602893c8cbcdefb9a) | [`c10cd448…3d12f9`](https://stellar.expert/explorer/testnet/tx/c10cd44896ae26d7df330b0e7a565f0636b5dd28866058e895e705ff393d12f9) | yes |
| 11 | [`GCAZMR…A6IFNO`](https://stellar.expert/explorer/testnet/account/GCAZMRVBGJUQ6O7MO22LLVOIPKRH2GM4G4JOJUXXRNR4PPCLF2A6IFNO) | [`38b74e91…9a1ad7`](https://stellar.expert/explorer/testnet/tx/38b74e916f7f9db6be696132b32426d079b1b32a4e19b5ef4ae2e2b3329a1ad7) | [`3ecf832a…b66417`](https://stellar.expert/explorer/testnet/tx/3ecf832a29e62abcfa5746c5458c3d66fbcb680ba07b2d13b8a5e84b84b66417) | yes |
| 12 | [`GAPUTD…KX7FMO`](https://stellar.expert/explorer/testnet/account/GAPUTDS2QTBWFP3XVTZSSXL22RZFUTHLZPISJIHSQM6SGVNFDCKX7FMO) | [`8aa3803d…2851ab`](https://stellar.expert/explorer/testnet/tx/8aa3803d449c55c2cf5b1af679ef1155c5ebbef5b62e20f5f42ae4e0f12851ab) | [`55c52b4e…c17758`](https://stellar.expert/explorer/testnet/tx/55c52b4e6566f6f30258281d1581580a75c68a1f997f7fb6939e4541e4c17758) | yes |

### What the money did

| | |
| :-- | --: |
| Deposit per person | 5.00 XLM |
| Returned on check-in | **5.10 XLM** — the deposit plus the fee allowance |
| Forfeited by the one no-show | 5.00 XLM, split among the eleven who showed |
| Left in the event contract | **0** |

The contract holding zero is the claim worth checking: every deposit either went
back to the person who showed up or was split among the people who did. Nothing
is stranded, and the organizer cannot take it.

### The reputation ledger, read back after the run

| Address | Score | |
| :-- | :-- | :-- |
| `GC5DKL…332MIH` | `{shows: 0, no_shows: 1}` | reserved, never checked in |
| `GBAW4G…CUFQXF` | `{shows: 1, no_shows: 0}` | checked in |
| `GBQRAW…E2O4PW` | `{shows: 1, no_shows: 1}` | **checked in here, flaked on an earlier event** |

That third row is the one no unit test can produce: a score that accumulated
across two separate events, written by two different event contracts, both gated
to the same factory. `reputation.is_registered(CAOK5LME…)` answers `true`, so the
writes came through the gate rather than around it.

Every score above moved inside the same transaction as the money — the
`check_in` hashes in the table carry both the token transfer and the
`score_changed` event, so there is no second transaction anyone has to be asked
to trust.

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
