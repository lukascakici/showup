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
| Event wasm hash — **current** | `f6faabe325ff4de6b759596008c1c5aa85fdd567addd5a4d354eae20c99241e5` |
| Event wasm hash — at the admission upgrade | `2ffab53113a4d2df8dd5742f9ffdc71911694f2a210e9f7cd449bd498744d754` |
| Event wasm hash — at the titles upgrade | `8fe992b8209d298ecc7c2e2bd882f8fe6412572ef39bdbbf29a687bc69c10949` |
| Event wasm hash — at v2 bring-up | `96cd1eb65889b856ea033fde4b3537176641ad2ca1d3c8dc25f2226c140a6860` |
| Reputation wasm hash — **current** | `bef89aa051523067c0f720f118bbddf47f055e867865bdd785e6c067ebaec9ff` |
| Factory wasm hash — **current** | `40d69765c45bc8d2f01fde373a732161876b30cb794b734a0363ea7dc21bda10` |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Deployer / admin | `GDL3H646S6HGGJTH2BBNCBDONJDN5E7L56ZRFWGCOSPXEDHOJLZOZKI5` |

Four event wasm hashes because the factory has been pointed at a new event
revision three times — 08.08.2026, 23.09.2026 and 24.09.2026 — each recorded
below with the transaction that did it. The **current** one is the value
`scripts/check-wasm-hash.mjs` asks the live factory for on every push; the older
ones are kept because the transactions recorded under *Bringing it up* and the two
upgrade sections uploaded exactly that code, and deleting them would make those
records unverifiable.

The factory and reputation hashes are listed from 24.09.2026 onward, the point at
which it became worth tracking them here too. Both contracts have been upgraded in
place more than once — first on 08.08.2026 — and neither address has ever moved.

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
| upload event wasm | [`265deb114c7bed1021e49e6b5784d73ac3f38de0f5ce224b60130345b372da35`](https://stellar.expert/explorer/testnet/tx/265deb114c7bed1021e49e6b5784d73ac3f38de0f5ce224b60130345b372da35) |
| deploy factory v2 | [`ca327ecd5bf18e23a92e2eedbb85c0511ad85ab995c18fe6ec3f3461a2aed99c`](https://stellar.expert/explorer/testnet/tx/ca327ecd5bf18e23a92e2eedbb85c0511ad85ab995c18fe6ec3f3461a2aed99c) |
| `factory.initialize(admin, event_wasm_hash)` | [`fcecf709b6e3cb22343a209e372272a690c69dd975633aad339bfb84a637bbea`](https://stellar.expert/explorer/testnet/tx/fcecf709b6e3cb22343a209e372272a690c69dd975633aad339bfb84a637bbea) |
| deploy reputation | [`b80ec972cf9689fe69f97093ce7ff771c04cf2a7ab0dd0ab55130173708f336c`](https://stellar.expert/explorer/testnet/tx/b80ec972cf9689fe69f97093ce7ff771c04cf2a7ab0dd0ab55130173708f336c) |
| `reputation.initialize(admin, factory)` | [`137b0150ae7f86afc548e6de53fc0a06183796df149b73cc7571c9f5301a6fae`](https://stellar.expert/explorer/testnet/tx/137b0150ae7f86afc548e6de53fc0a06183796df149b73cc7571c9f5301a6fae) |
| `factory.set_reputation(reputation)` | [`79b70065d3fac0d84dd41f32cd77b2cdab8666a20514e3d74949591c292645bc`](https://stellar.expert/explorer/testnet/tx/79b70065d3fac0d84dd41f32cd77b2cdab8666a20514e3d74949591c292645bc) |

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
| `factory.set_event_wasm_hash` → new event revision | [`84c4088ba46c0ba3632176c123ca3e2008c3634ad0ee4d369695296558ac8aee`](https://stellar.expert/explorer/testnet/tx/84c4088ba46c0ba3632176c123ca3e2008c3634ad0ee4d369695296558ac8aee) |
| `factory.upgrade` → new factory code | [`4b81178d10794af68b9f510490f9414d04c5b9ee04aa9e312a7fb095781d2115`](https://stellar.expert/explorer/testnet/tx/4b81178d10794af68b9f510490f9414d04c5b9ee04aa9e312a7fb095781d2115) |
| `reputation.upgrade` → new ledger code | [`a3cc5193197e9a0ba5ab76d083555eca1c6dcee9e9ae33b348d9ee9518983588`](https://stellar.expert/explorer/testnet/tx/a3cc5193197e9a0ba5ab76d083555eca1c6dcee9e9ae33b348d9ee9518983588) |
| extend the D2 event's lease from outside | [`30f4193f2e81aaa1ad5f39aee1586fb426a69ceab99c2297a45731eaf869eb44`](https://stellar.expert/explorer/testnet/tx/30f4193f2e81aaa1ad5f39aee1586fb426a69ceab99c2297a45731eaf869eb44) |

Event wasm hash after this upgrade: `8fe992b8209d298ecc7c2e2bd882f8fe6412572ef39bdbbf29a687bc69c10949`

State survived both upgrades — `reputation.get_score()` still returns
`{ shows: 1, no_shows: 0 }` for the guest who checked in, and the factory still
lists its events.


## Upgraded again — admission on-chain (23.09.2026)

Four admission modes and co-hosting, live at the **same factory address**. No
address anywhere changed, which is the second time the upgrade path built in the
first engagement has paid for itself.

**This was two upgrades, not one, and that is the part worth reading.**
`create_event` gained an `admission` argument — so the change is not only in the
event contract. The factory is what calls the event's `initialize`, so the
factory's own code had to move with it. Pointing the factory at the new event
wasm and stopping there would have left every create failing: a factory sending
ten arguments into an `initialize` that wants eleven. Both halves ship together
or neither does.

| Step | Transaction |
| :-- | :-- |
| upload the event revision | [`21a454b355ee617a3f6d0a5663785e39085983845948ef130f31088bab316861`](https://stellar.expert/explorer/testnet/tx/21a454b355ee617a3f6d0a5663785e39085983845948ef130f31088bab316861) |
| `factory.set_event_wasm_hash` → that revision | [`87964713d0d8bcc95f23b0be1f676f3c1f876d0f07a8d0481cdb8678961a927a`](https://stellar.expert/explorer/testnet/tx/87964713d0d8bcc95f23b0be1f676f3c1f876d0f07a8d0481cdb8678961a927a) |
| upload the factory revision | [`507d26431a2f75b35761a512e750621e323392464fddc47db397f87d1438aeb6`](https://stellar.expert/explorer/testnet/tx/507d26431a2f75b35761a512e750621e323392464fddc47db397f87d1438aeb6) |
| `factory.upgrade` → that revision | [`875a22206204a98adc9fd72e8b1580f6ddc0a0eac9b64602305524fe027ba2a6`](https://stellar.expert/explorer/testnet/tx/875a22206204a98adc9fd72e8b1580f6ddc0a0eac9b64602305524fe027ba2a6) |

- Event wasm hash after this upgrade: `2ffab53113a4d2df8dd5742f9ffdc71911694f2a210e9f7cd449bd498744d754`
- Factory wasm hash after this upgrade: `f52faeeb6c605e33d4f99c75112d5ab2eb02e592c4e80af54b978610926a3490`

Both read back off the chain rather than off these notes: `get_event_wasm_hash`
returns the first, and `stellar contract info interface` on the factory now shows
`create_event` taking `admission: Admission`. That second check is the only one
that tells a whole deploy from a half one, and it is free and needs no key.

### The gate, proved on Testnet

A `Score(1)` event created through the upgraded factory:
[`CAA3T2YD…L23RQLD5LO`](https://stellar.expert/explorer/testnet/contract/CAA3T2YDD2HIX7EMBTVOG7IN2PGPRJGKZ22U6YT5QCWWF3L23RQLD5LO).
`get_terms` reads back `{"admission":{"Score":1},"hosts":["GDL3H646…OZKI5"]}`.

| Wallet | Record | `rsvp` on that event |
| :-- | :-- | :-- |
| `GDEM74TE…UYJWCWWV` | `{shows: 0, no_shows: 0}` | **refused, `Error(Contract, #17)` — `ScoreTooLow`** |
| `GB7TWPUD…MYXLVNKCL` | `{shows: 1, no_shows: 0}` | admitted — [`031029855aea87393e964c9cef1b5d9a8e6f596afe9659b5e0f36b2aeeecf319`](https://stellar.expert/explorer/testnet/tx/031029855aea87393e964c9cef1b5d9a8e6f596afe9659b5e0f36b2aeeecf319) |

Same event, same gate, two wallets, and the only thing separating them is a show
recorded by a different event contract entirely. The second wallet earned its one
show by actually attending a warm-up event first:
[`rsvp`](https://stellar.expert/explorer/testnet/tx/896279038728aed610dded3e3aaed3bb4e64e440845cb5492d77b736d37fd77d) →
[`open_checkin`](https://stellar.expert/explorer/testnet/tx/dc461251d8cac88c970172ebfb9733e8e906a39695f1a6dbd105187be9bb1ab5) →
[`check_in`](https://stellar.expert/explorer/testnet/tx/1194c69724e2c59370345271ebbc2d49a26af22f32fbd6845dc49170e87f85b6).

**A refusal has no transaction hash, and cannot have one.** Soroban simulates a
call before it is submitted, so a contract error means the transaction is never
built — there is nothing to open on Stellar Expert. This is the same way the
phase-machine rejections were recorded for Deliverable 1 in the first
engagement: by the error code the contract returns, reproducible by anyone with
the CLI and no key:

```bash
stellar contract invoke --network testnet \
  --id CAA3T2YDD2HIX7EMBTVOG7IN2PGPRJGKZ22U6YT5QCWWF3L23RQLD5LO \
  --source <a wallet with no shows> -- rsvp --guest <that wallet>
# error: HostError: Error(Contract, #17)
```

### Admission by the organizer's yes, proved on Testnet

An `Approval` event created through the upgraded factory:
[`CA5SLCNM…S7GV63S6W2`](https://stellar.expert/explorer/testnet/contract/CA5SLCNML2EWC3FJVVMEIGTC3CJ7COBDZGO4FQ5754B4QQS7GV63S6W2).
2 XLM deposit, capacity 3, forfeits to the organizer.

The order below is the whole promise of this mode: **nothing is taken until the
organizer has said yes**, and the guest is the one who pays when it happens.

| Step | Result |
| :-- | :-- |
| `rsvp` before applying | rejected, `Error(Contract, #18)` — `NotApplied` |
| `apply` | [`ad69d4825366b327ffc697be6616471b14f23db305df61e83c790f72e1c45cb6`](https://stellar.expert/explorer/testnet/tx/ad69d4825366b327ffc697be6616471b14f23db305df61e83c790f72e1c45cb6) |
| state after applying | `"Applied"`, and `get_reserved` is still `[]` — **no money has moved** |
| `rsvp` while still only applied | rejected, `Error(Contract, #18)` — `NotApplied` |
| `approve` | [`9a57f288f8f924c689c32ec47594527d0f2eeed491e81b01a48b554f265485fd`](https://stellar.expert/explorer/testnet/tx/9a57f288f8f924c689c32ec47594527d0f2eeed491e81b01a48b554f265485fd) |
| `rsvp` after approval | [`f3731b318a7f25c763c210dc0970a07e5ae70f1f56fd1042e401694dd6eb666e`](https://stellar.expert/explorer/testnet/tx/f3731b318a7f25c763c210dc0970a07e5ae70f1f56fd1042e401694dd6eb666e) — **2 XLM transferred**, and not before |
| `check_in` | [`1949e9778e5ee8d91427d953956bada33a77dc60f84bfb309b034f1f14a6be0d`](https://stellar.expert/explorer/testnet/tx/1949e9778e5ee8d91427d953956bada33a77dc60f84bfb309b034f1f14a6be0d) — 2.1 XLM back, deposit plus the fee allowance |

The approval is the organizer's transaction and the reservation is the guest's.
That split is the point: an approval that could pull somebody's deposit would
mean anyone could be charged for being liked.

A second wallet through the same event, turned down:

| Step | Result |
| :-- | :-- |
| `apply` | [`c713ac8635f7466406623019de0f15a847aa2376d10a73119f43bf100bf6926b`](https://stellar.expert/explorer/testnet/tx/c713ac8635f7466406623019de0f15a847aa2376d10a73119f43bf100bf6926b) |
| `decline` | [`2698df98cbf7012807415d0e4b9d0c8d844e8230f1cd0f0a38f8db85a386ada2`](https://stellar.expert/explorer/testnet/tx/2698df98cbf7012807415d0e4b9d0c8d844e8230f1cd0f0a38f8db85a386ada2) |
| `rsvp` after being declined | rejected, `Error(Contract, #18)` — `NotApplied` |
| `apply` again after being declined | rejected, `Error(Contract, #19)` — `AlreadyApplied` |

A decline is terminal in both directions. A declined applicant cannot reserve,
and cannot re-apply their way back into an organizer's inbox.

### An event run by someone who did not create it

Same event, and the co-host is the wallet that was declined a spot in it — which
is a good illustration of the split: running an event and being admitted to one
are unrelated powers.

| Step | Result |
| :-- | :-- |
| `open_checkin` by a non-host | rejected, `Error(Contract, #20)` — `NotAHost` |
| `add_host` by the creator | [`2a28739712b24ec967fc160d7655a913718cbcb5ad8e4f12936a31cee6489b23`](https://stellar.expert/explorer/testnet/tx/2a28739712b24ec967fc160d7655a913718cbcb5ad8e4f12936a31cee6489b23) |
| `open_checkin` by that same wallet | [`0a183ffb124a76cb954e3566c07859ed6b77908522388c81eac99508d31edc5c`](https://stellar.expert/explorer/testnet/tx/0a183ffb124a76cb954e3566c07859ed6b77908522388c81eac99508d31edc5c) |
| `finalize` by that same wallet | [`f7e3735184875b87027a1bac06dcf93bdaf97030b60504cd7dabaf32f806218c`](https://stellar.expert/explorer/testnet/tx/f7e3735184875b87027a1bac06dcf93bdaf97030b60504cd7dabaf32f806218c) |

`get_terms` on that event now reads:

```json
{"admission":"Approval","hosts":["GDL3H646…OZKI5","GB7TWPUD…VNKCL"]}
```

**A co-host can run the event; they cannot redirect its money.** Every payout in
`finalize` goes to `config.organizer`, never to whichever host happened to make
the call — so adding one is a decision about who can act, not about funds. The
settlement above was called by the co-host and paid the creator.

### Events deployed before this revision still run

`set_event_wasm_hash` changes what the factory deploys **next**; every event
already on the chain keeps running the code it was deployed from. Checked rather
than assumed — a reservation on an event created under the previous revision,
after the upgrade:
[`0432a76506cb426767138b794c17badc05af470b8784fee847300d1183e0c45c`](https://stellar.expert/explorer/testnet/tx/0432a76506cb426767138b794c17badc05af470b8784fee847300d1183e0c45c).
The deposit moved, the guest is on the list, nine spots left.

This is also why `Config` could not simply grow an `admission` field: those
events hold a `Config` written by an older wasm, and adding a field to the struct
made every client generated from the new spec fail to decode them. The admission
mode and the host list are keyed separately and read through `get_terms`, which
an older event answers with "function not found" — a failure a caller can
recognise and answer for itself.

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
[`fa17c71042ca4ce3a2133504c5eb9c0421f953943891378d090b148c18592c1a`](https://stellar.expert/explorer/testnet/tx/fa17c71042ca4ce3a2133504c5eb9c0421f953943891378d090b148c18592c1a)

The limit is bytes rather than characters because that is what storage costs.
"Perşembe halı saha, Kadıköy" is 27 characters and 31 bytes; a form that counted
characters would let a Turkish title through and the contract would reject it
after the wallet prompt.

Events created before this revision — including the D2 event below — have no
title at all. They still work, still settle, and are still listed; they show
their address, exactly as every event did until now.

## Upgraded a third time — vouching, and a record that grew (24.09.2026)

Three contracts moved, and **no address anywhere changed** — including the
reputation ledger, which has held the first engagement's results at
`CDFGVEIJ…A3DJ` since the first week it existed.

| Step | Transaction |
| :-- | :-- |
| upload the reputation revision | [`2b77626019925091c1cf4799e4c36d8c58515b54ff41e0bf22fca285f55dfa3a`](https://stellar.expert/explorer/testnet/tx/2b77626019925091c1cf4799e4c36d8c58515b54ff41e0bf22fca285f55dfa3a) |
| `reputation.upgrade` → that revision | [`b20f9b39cdac2bd597e6a324868f00991401b205bc29f963accacf09722c9a3a`](https://stellar.expert/explorer/testnet/tx/b20f9b39cdac2bd597e6a324868f00991401b205bc29f963accacf09722c9a3a) |
| upload the event revision | [`2b1e12fffe56f0d8df0dd56144763656abc5c776556aa6ab49a3802db02600d6`](https://stellar.expert/explorer/testnet/tx/2b1e12fffe56f0d8df0dd56144763656abc5c776556aa6ab49a3802db02600d6) |
| `factory.set_event_wasm_hash` → that revision | [`338cd1d51e3afa60f64918a9cf83290d576263feb740919c46732e195234d728`](https://stellar.expert/explorer/testnet/tx/338cd1d51e3afa60f64918a9cf83290d576263feb740919c46732e195234d728) |
| upload the factory revision | [`a66cfece92d56cf2709fcc556dab4acfdcc0bb3f1490b102583daca72619f762`](https://stellar.expert/explorer/testnet/tx/a66cfece92d56cf2709fcc556dab4acfdcc0bb3f1490b102583daca72619f762) |
| `factory.upgrade` → that revision | [`b00500ec11758a128e796443c97b327b2791559120e077182530599034f436b2`](https://stellar.expert/explorer/testnet/tx/b00500ec11758a128e796443c97b327b2791559120e077182530599034f436b2) |

- Reputation wasm hash after this upgrade: `bef89aa051523067c0f720f118bbddf47f055e867865bdd785e6c067ebaec9ff`
- Event wasm hash after this upgrade: `f6faabe325ff4de6b759596008c1c5aa85fdd567addd5a4d354eae20c99241e5`
- Factory wasm hash after this upgrade: `40d69765c45bc8d2f01fde373a732161876b30cb794b734a0363ea7dc21bda10`

### The order was forced, not chosen

Reputation first. The event contract's new `vouch` reads `get_record`, and that
read is deliberately **not** a `try_` call: an unanswerable read has no safe
default, and defaulting to a clean record would let anybody vouch for anybody. So
an event contract that knows about vouching, pointed at a ledger that does not,
fails at the gate. The reverse order is harmless — a ledger that can answer
`get_record` before anything asks is simply a ledger nobody is using yet.

### The published scores were checked before and after

The reputation ledger holds fourteen records earned in the first engagement, and
this repository publishes them as Deliverable 2 evidence. An upgrade is the one
moment that claim could quietly stop being true, so it was not eyeballed:

```bash
node scripts/reputation-snapshot.mjs --out before.json   # before the upgrade
node scripts/reputation-snapshot.mjs --against before.json   # after
# ok     every record is exactly as before.json left it
```

Fourteen of fourteen, unchanged. The script reads *storage* rather than calling
`get_score`, which means it needs **no key, no funded account and no signature** —
a reviewer can re-derive every number in this file from the addresses it names.

The same record then read back through the new entry point, which is what the site
will call:

```bash
stellar contract invoke --network testnet --id CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ \
  --source <any funded account> -- \
  get_record --member GBAW4G42254EEXDLUQ5X5GSZ6H7E46PM5AL364H2EVKRMMANDQCUFQXF
# {"events_organised":0,"no_shows":0,"shows":1,"vouches_broken":0,"vouches_given":0}
```

`shows: 1` is from the first engagement. The three new counters read `0` because
this member predates them entirely — and that is the design working, not a
coincidence. `Score` was **frozen**: it could not grow a field, because every
entry in the ledger was written by an older wasm and a client generated from a
wider struct cannot decode them. So the new counters live in a separately keyed
`Extras` entry that a member is allowed not to have, and the reader defaults
instead of unwrapping. `Record` is assembled from both at read time and never
stored.

### What each contract gained, diffed against the chain

Not against the repository. Each was `stellar contract info interface` on the live
contract before the upgrade, compared with the built wasm, and **every diff was a
pure addition** — nothing removed, nothing renamed, no error code renumbered:

| Contract | Gained |
| :-- | :-- |
| Reputation | `renew`, `get_record`, `record_organised`, `record_vouch_given`, `record_vouch_broken`; `Extras`, `Record`; `RecordRenewed`, `VouchRecorded` |
| Event | `vouch`, `get_vouches`, `DataKey::Vouchers`, errors **24–27**, the `Vouched` event |
| Factory | the `Record` struct in its published spec, and nothing else |

Error codes 24–27 are numbered after every existing one, so **no deployed value
changed meaning**. An event contract created last week still returns `#17` for the
same refusal it always did.

The factory upgrade was **cosmetic and optional**: not one function signature
moved. It carries every `#[contracttype]` declared in `interfaces`, which is the
known price of the shared-trait design, so `Record` appearing there made the
repository's generated factory bindings describe a spec the chain did not serve.
One transaction closed that gap.

### Verified from the chain afterwards, not from these notes

```bash
stellar contract invoke --id CD5AEMRB…7FCE --network testnet -- get_event_wasm_hash
# "f6faabe325ff4de6b759596008c1c5aa85fdd567addd5a4d354eae20c99241e5"
stellar contract invoke --id CD5AEMRB…7FCE --network testnet -- get_event_count
# 8
```

The second is the one worth running. An upgrade replaces a contract's code and
keeps its storage; a factory that came back having forgotten its eight events
would have been a catastrophe that the first command cannot see.

All three live specs were then compared line by line against the wasms built here
and came back **identical** — 94 lines for the factory, 112 for the reputation
ledger, 243 for the event contract. That comparison is the only check that tells a
whole deploy from a half one, and it costs nothing and needs no key.

### A newcomer admitted on somebody else's record, proved on Testnet (26.09.2026)

A `Vouch(1)` event created through the upgraded factory:
[`CDCGNAG4…BNFTKJ43AO`](https://stellar.expert/explorer/testnet/contract/CDCGNAG4RTC3KFYIRX2WDLSDKZMQWXLBCNIF3MITT6CSIRBNFTKJ43AO),
2 XLM deposit, capacity 3, forfeits to the organizer, created in
[`84470cca8cdbfc51a36f5573578dbf717c4feab6d961ed7007bf11b50a033b86`](https://stellar.expert/explorer/testnet/tx/84470cca8cdbfc51a36f5573578dbf717c4feab6d961ed7007bf11b50a033b86).
`get_terms` reads back `{"admission":{"Vouch":1},"hosts":["GDL3H646…OZKI5"]}`.

The three wallets, and why each was chosen:

| Role | Wallet | Record at the start |
| :-- | :-- | :-- |
| the newcomer | `GBEDUGGM…EXV3KACU` | minted for this, **all five counters zero** |
| the voucher | `GB7TWPUD…MYXLVNKCL` | `shows: 1`, `vouches_broken: 0` — qualifies |
| a stranger | `GBYT3TBN…BN7WOV52K` | minted for this, no record at all |

The newcomer was generated the same day precisely so that "somebody with nothing
of their own" is a fact and not a description.

**The gate, then the four ways through it that are closed:**

| Call | Result |
| :-- | :-- |
| newcomer `rsvp`, before any vouch | refused, `Error(Contract, #27)` — `NotEnoughVouches` |
| the stranger tries to `vouch` | refused, `Error(Contract, #24)` — `CannotVouch` |
| the voucher vouches for themselves | refused, `Error(Contract, #26)` — `CannotVouchForYourself` |
| the voucher vouches a second time for the same guest | refused, `Error(Contract, #25)` — `AlreadyVouched` |
| anyone vouches after `open_checkin` | refused, `Error(Contract, #12)` — `ReservationsClosed` |

Refusals have no transaction hashes and cannot have them — Soroban simulates
before submitting, so a contract error means the transaction is never built. Each
is reproducible with the CLI and no key, exactly as the `ScoreTooLow` refusal
above was recorded.

**And the way through:**

| Step | Transaction |
| :-- | :-- |
| the voucher's `vouch` | [`1f84ca6d9419f412187257b5b61fd72c29c8bae8ec99b6e8b07f618fd71bcad4`](https://stellar.expert/explorer/testnet/tx/1f84ca6d9419f412187257b5b61fd72c29c8bae8ec99b6e8b07f618fd71bcad4) |
| the newcomer's `rsvp`, now admitted | [`a01715f5e9b93d0de130fea2d9cc7c55301a22e928635d2130a0d24bdb2cc633`](https://stellar.expert/explorer/testnet/tx/a01715f5e9b93d0de130fea2d9cc7c55301a22e928635d2130a0d24bdb2cc633) |
| `open_checkin` | [`4226a1f8a73f45e28c2b5714af42beb3ee3adeafe95496a5af42f10799d719d4`](https://stellar.expert/explorer/testnet/tx/4226a1f8a73f45e28c2b5714af42beb3ee3adeafe95496a5af42f10799d719d4) |

The `vouch` transaction moves **no money and takes no spot**: it publishes
`Vouched { vouches: 1 }` on the event and `vouch_recorded { broken: false }` on
the ledger, and that is all. The reservation is the next transaction, it is the
newcomer's own, and it is where the 2 XLM moves — `Reserved { spots_left: 2 }`.
A vouch is permission to reserve, not a reservation.

### The cost of backing the wrong person, in one transaction

The newcomer never checked in. `finalize`:
[`bc35d8fe9daf9c2617d15e635f1ec6d3bd36a9adb6221e8eac284764c2bf6f3a`](https://stellar.expert/explorer/testnet/tx/bc35d8fe9daf9c2617d15e635f1ec6d3bd36a9adb6221e8eac284764c2bf6f3a)

That **one** transaction carries all four of these:

- `transfer` of 23 000 000 stroops to the organizer — the 2 XLM forfeited plus the
  0.3 XLM fee pool nobody drew from
- `score_changed { member: GBEDUGGM…, shows: 0, no_shows: 1 }` — the newcomer
- `vouch_recorded { voucher: GB7TWPUD…, broken: true }` — the voucher
- `Finalized { showed: 0, no_shows: 1, forfeited: "20000000" }`

There is no ordering of transactions in which the deposit has been forfeited and
the voucher's record still says nothing went wrong, because there is only ever one
transaction.

Records read straight afterwards:

| Wallet | `get_record` |
| :-- | :-- |
| the voucher | `{shows: 1, no_shows: 0, vouches_given: 1, vouches_broken: 1, events_organised: 0}` |
| the newcomer | `{shows: 0, no_shows: 1, vouches_given: 0, vouches_broken: 0, events_organised: 0}` |
| the organizer | `{shows: 0, no_shows: 0, vouches_given: 0, vouches_broken: 0, events_organised: 1}` |

**The voucher's `shows` is still 1 and their `no_shows` is still 0.** Backing
somebody who did not turn up is not the same failure as not turning up yourself,
and folding them into one number would leave the record unable to answer either
question afterwards. The organizer's `events_organised: 1` is `record_organised`
firing for the first time on the chain: a line written at settlement rather than at
creation, because an event that was deployed and abandoned is not an event anybody
ran.

**The ledger's own storage metadata proves the separation**, without taking the
paragraph above on trust. At ledger 4 878 340:

| Entry | Last modified | Meaning |
| :-- | :-- | :-- |
| voucher's `Score` | 4 833 933 | untouched by `finalize` — last written when they checked in on 23.09 |
| voucher's `Extras` | 4 878 318 | the `finalize` ledger: this is where the broken vouch went |
| newcomer's `Score` | 4 878 318 | the `finalize` ledger |
| newcomer's `Extras` | *does not exist* | they never gave, broke or organised anything |

That last row is the frozen-struct design paying off in plain sight: `Extras` is a
separately keyed entry a member is allowed not to have, so the ledger does not
write down what did not happen.

### One broken vouch closes the door, and it is not a show count

A second `Vouch(1)` event,
[`CBD3UFX3…OAZ2EZWWQ`](https://stellar.expert/explorer/testnet/contract/CBD3UFX3WP53JW2MDCOVX5QAPIROCHUU35M6TNKA7SMEHJDOAZ2EZWWQ),
created in
[`204d532e3aa41ac443065ccf84ea37dec51542ebe4155591b7d635471dd4f3fe`](https://stellar.expert/explorer/testnet/tx/204d532e3aa41ac443065ccf84ea37dec51542ebe4155591b7d635471dd4f3fe),
exists to separate two members who look identical on paper:

| Member | `shows` | `vouches_broken` | `vouch` at the new event |
| :-- | :-- | :-- | :-- |
| `GB7TWPUD…MYXLVNKCL` | 1 | 1 | **refused, `Error(Contract, #24)` — `CannotVouch`** |
| `GA5TJJJC…W6KEVNGEO` | 1 | 0 | admitted — [`160a5e87a1929e320a0a2a0f2388b333ba5c637d585e84f247fe838000bd7c76`](https://stellar.expert/explorer/testnet/tx/160a5e87a1929e320a0a2a0f2388b333ba5c637d585e84f247fe838000bd7c76) |

Same event, same gate, same attendance count. The only thing separating them is
one bad call, made at a **different event contract entirely** — and it followed the
member here. This is what stops somebody buying the right to keep waving strangers
in by attending a lot of their own events: the rule is not a threshold, so no
amount of showing up clears it.

### A record kept alive by somebody who does not own it

`renew` takes no auth and no admin, because a record is a claim its owner should
not have to ask permission to keep. Proved by the wallet least entitled to do it —
minted that morning, holding no record, neither the admin nor the factory:

| Call | Transaction |
| :-- | :-- |
| the stranger renews the **voucher's** record | [`551bada3e826d5956a94465e5a61f5a7dfc1f66d24c2504a43a2b97d946ffa05`](https://stellar.expert/explorer/testnet/tx/551bada3e826d5956a94465e5a61f5a7dfc1f66d24c2504a43a2b97d946ffa05) |
| the stranger renews a wallet the ledger has **never seen** | [`1d8f7bb15fb1ce492088000e05c38cabdf9d1e006f43a377bfc6b4c5d2f93b40`](https://stellar.expert/explorer/testnet/tx/1d8f7bb15fb1ce492088000e05c38cabdf9d1e006f43a377bfc6b4c5d2f93b40) |

Both succeed and publish `RecordRenewed`. What they do *not* do is the point:

- **The numbers do not move.** The voucher's record reads identically before and
  after. `renew` extends a lease; it has no way to write a score.
- **No entry is created for a stranger.** After the second transaction the ledger
  still has nothing stored for that address — otherwise anybody could fill it with
  blank records at our expense.
- **The lease did not move either, and that is correct.** `extend_ttl` is a no-op
  while an entry is already healthier than its threshold, and the voucher's
  `Score` had 1 510 793 ledgers left — about **87 days** against a 30-day
  threshold. Nothing needed extending yet. Re-extending a healthy entry would only
  burn fees, so the host refuses to, and `renew` is honest about being the call you
  make when a record is *near* archival, not a lever that does something every
  time it is pulled.

**There is deliberately no button for this in the app**, and the reason is worth
recording because it is the same fact from the other side. `renew` takes no auth
and, above the threshold, writes nothing — so a simulated `renew` has zero
authorization entries and an empty read-write footprint, and that is exactly how
the Stellar SDK defines a *read call*:

```js
get isReadCall() {
  const authsCount = this.simulationData.result.auth.length;
  const writeLength = this.simulationData.transactionData.resources().footprint().readWrite().length;
  return authsCount === 0 && writeLength === 0;
}
```

`signAndSend()` refuses a read call unless it is forced. So a button would have sat
there doing nothing useful and reporting *"This is a read call. It requires no
signature or sending"* to anyone who pressed it. The transactions above were made
with the CLI's `--send=yes`, which is that same override, and they are the right
place for this capability to be demonstrated: it is a property of the contract,
proven on the chain, not a control a guest needs. Restoring a record that has
actually archived is a one-line CLI call anybody can run.

The durability policy, in one paragraph for a non-technical reader: **Soroban rents
state.** An entry nobody touches for long enough is archived — not deleted, and
never lost, but no longer readable until somebody pays to restore it. Every write
already extends what it wrote, which quietly meant a record would survive only
while its owner kept attending things, expiring precisely for the person who had
stopped needing to prove anything. `renew` removes that: the member, a friend, or
an organizer who wants to admit them next month can each pay a few stroops to keep
the record alive, and none of them needs our permission. That is what makes the
ledger outlive our goodwill.

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
| `create_event` | 4,056,609 | [`ca6c547481a3704198f027157acba1bfd4f3b45f14210039daa06c97f5104ffe`](https://stellar.expert/explorer/testnet/tx/ca6c547481a3704198f027157acba1bfd4f3b45f14210039daa06c97f5104ffe) |
| `rsvp` — the row visible in the screenshot | 4,056,613 | [`03d159194db4242e884c2b85d00fb4ea7c729e0b4684ec5e7e8ee35a416de3c8`](https://stellar.expert/explorer/testnet/tx/03d159194db4242e884c2b85d00fb4ea7c729e0b4684ec5e7e8ee35a416de3c8) |

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
| `create_event` | [`5feeec693c7f674e4c41457714ade03904f2846663606f98fac8b8b845946240`](https://stellar.expert/explorer/testnet/tx/5feeec693c7f674e4c41457714ade03904f2846663606f98fac8b8b845946240) | event deployed, fee pool funded, **and `event_registered` published by the reputation ledger in the same transaction** |
| `rsvp` (showed) | [`64ebd04cec719183e6fe0a0d594b302f9a97c3ff632dc0891e057fa0c1d5fffa`](https://stellar.expert/explorer/testnet/tx/64ebd04cec719183e6fe0a0d594b302f9a97c3ff632dc0891e057fa0c1d5fffa) | 10 XLM locked, `spots_left: 1` |
| `rsvp` (flaked) | [`6714a8553fd6760b612d69aa7c59edfd7088d3a867dc5c22000a082db3d5da56`](https://stellar.expert/explorer/testnet/tx/6714a8553fd6760b612d69aa7c59edfd7088d3a867dc5c22000a082db3d5da56) | 10 XLM locked, `spots_left: 0` |
| `open_checkin` | [`5f84bc626a59da7e37abee0c01526273a9b1947b7311a6279b62a2392fb428aa`](https://stellar.expert/explorer/testnet/tx/5f84bc626a59da7e37abee0c01526273a9b1947b7311a6279b62a2392fb428aa) | `PhaseChanged { phase: CheckingIn }` |
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

<details>
<summary>Full addresses and hashes, to copy</summary>

```
1. GC5DKLTLWPTOQXHDVCCZLKUN54Y5LBNYWQHEESJI76ETCCSKBS332MIH
   rsvp     60c621871d0c2b29746d4b797d627fd81e7690b909fa82a624b4aa8ccdfda259
   check_in —
2. GBAW4G42254EEXDLUQ5X5GSZ6H7E46PM5AL364H2EVKRMMANDQCUFQXF
   rsvp     bbbcc73bf903cf7c2aa52bcf9d884589d51fcda3e0c1881bbfb31df13217f177
   check_in 7e0f0c95e935f217571b7ec28fc4329f137ee59774fd2609b396e05b727b5361
3. GBBHPJYHGFN5UEFQCSQBS6J5FAL2UG4RAKJY545ESHSGBKMIKMFCIDTL
   rsvp     da1361f4b538dad0a67a3c2574fa107169477f97a009b8fb9953c8667054c7c5
   check_in ac9589f73780fe5e59f094e4204f187434c4c333d675d00c4632812e5c77005e
4. GAESJSOUVOV4CIRKCWU6PXWILLO2VQN5RMFWHQVDISVUMWSBHHHVURD7
   rsvp     189388810f91c661927daa2a5f7696bc5604fab1df7541dc581422a2ed517266
   check_in 21bd8dbcf0a6e5d97bdcc3391e66ded2d87fa06f5cf4c664fb50dd059f2c4769
5. GBTM4BY6ABARXTZSVED6NZEHCFFHHNAO64WGTBIUPXAUIMRHBUYDVVWQ
   rsvp     d8a161ab9a841bfc1fa924b99d3f23f04c68f519083cc7e7dbc50947dc079a5f
   check_in 0152403930698e09ee69152b8761c958d29376e620e5dabc0d0995cc419925cd
6. GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW
   rsvp     0479f8b0e60177a9a4135d0ef6af6d9fbcbec8145f349f3784f36c37e3720a2e
   check_in e91eb97fda09eac349c0cb0c656b3673f61d419807cc89bcdf7571611783b45a
7. GBZTYVPNXDCDWXVOT6Y36TTC7DRQGSKCZF25OXVZYBGRONTJDPZEJP6Z
   rsvp     c2beefc749d926d88041cb2ea5af09616c11c8f7dce27972f57cce3e591f43bf
   check_in 24e4ba5e6f6bb646c3425733721ba0265c6c826efa3748e6a8921f0b7bf24eaf
8. GBCCJXEN2ZAAKAW4MOO4GJI7FMTISSYI3ZMS2QC5FGUA4WKYWHN7HESQ
   rsvp     5ea3cc39455eea3a1a51909539b545def4f08988b821412f9ea1c2bd90360a31
   check_in c0d11d906c88cb34b92a5cedc8d3a64832bd356401e683a1a73f9c6687d45bc7
9. GBMQXTV2SJTKDFI2SHEZS35JBUFS2V5L4T7YJTR2ASGOS65LEGLKRY2H
   rsvp     8614f36acbab7da76bb5c84177fe711efa20982a4887c67cbcb1bbe770d9398c
   check_in 0077a18260bacaedd4c20834a7f57211dd33f4ef71231403880840f4d7d3a643
10. GCFCDFPTUGCHH4VQO3DQ3BQVBTCUA7W3U7NYPAYWMSH3GXWF46FTWDUW
   rsvp     e038765e2d8c929279ceefcfeff5d5eee559950d563baab602893c8cbcdefb9a
   check_in c10cd44896ae26d7df330b0e7a565f0636b5dd28866058e895e705ff393d12f9
11. GCAZMRVBGJUQ6O7MO22LLVOIPKRH2GM4G4JOJUXXRNR4PPCLF2A6IFNO
   rsvp     38b74e916f7f9db6be696132b32426d079b1b32a4e19b5ef4ae2e2b3329a1ad7
   check_in 3ecf832a29e62abcfa5746c5458c3d66fbcb680ba07b2d13b8a5e84b84b66417
12. GAPUTDS2QTBWFP3XVTZSSXL22RZFUTHLZPISJIHSQM6SGVNFDCKX7FMO
   rsvp     8aa3803d449c55c2cf5b1af679ef1155c5ebbef5b62e20f5f42ae4e0f12851ab
   check_in 55c52b4e6566f6f30258281d1581580a75c68a1f997f7fb6939e4541e4c17758
```

</details>

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
