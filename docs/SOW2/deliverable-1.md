# Deliverable 1 — evidence

Four ways for an organizer to control who gets into an event, **enforced by the
event contract rather than by the interface**, plus events that more than one
wallet can run.

> **SOW §6.1:** the new event revision's wasm hash and the transaction pointing the
> live factory at it. A transaction where a wallet below the required score is
> refused by the contract, and one where a qualifying wallet is admitted. An
> approval-gated event showing an application, the organizer's decision and the
> deposit that followed. A co-host opening check-in on an event they did not create.

Everything below is on Stellar **Testnet**. No real money is involved.

---

## The contract revision, and the factory pointing at it

Admission is a field fixed when the event is created and checked inside `rsvp`, so
it cannot be changed by the person holding the deposits and cannot be bypassed by
calling the contract directly.

| What | Value |
| :-- | :-- |
| Event factory, unchanged address | [`CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE`](https://stellar.expert/explorer/testnet/contract/CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE) |
| Event wasm hash, current | `f6faabe325ff4de6b759596008c1c5aa85fdd567addd5a4d354eae20c99241e5` |

| Step | Transaction |
| :-- | :-- |
| upload the admission revision | [`21a454b355ee617a3f6d0a5663785e39085983845948ef130f31088bab316861`](https://stellar.expert/explorer/testnet/tx/21a454b355ee617a3f6d0a5663785e39085983845948ef130f31088bab316861) |
| `factory.set_event_wasm_hash` | [`87964713d0d8bcc95f23b0be1f676f3c1f876d0f07a8d0481cdb8678961a927a`](https://stellar.expert/explorer/testnet/tx/87964713d0d8bcc95f23b0be1f676f3c1f876d0f07a8d0481cdb8678961a927a) |
| upload the factory revision | [`507d26431a2f75b35761a512e750621e323392464fddc47db397f87d1438aeb6`](https://stellar.expert/explorer/testnet/tx/507d26431a2f75b35761a512e750621e323392464fddc47db397f87d1438aeb6) |
| `factory.upgrade` | [`875a22206204a98adc9fd72e8b1580f6ddc0a0eac9b64602305524fe027ba2a6`](https://stellar.expert/explorer/testnet/tx/875a22206204a98adc9fd72e8b1580f6ddc0a0eac9b64602305524fe027ba2a6) |

**That is four transactions rather than two, and the reason is the interesting
part.** `create_event` gained an argument, so the factory — which is what calls each
event's `initialize` — had to move with the event contract. Pointing the factory at
the new event wasm and stopping there would have left every create failing: a
factory sending ten arguments into an `initialize` that wants eleven.

**No address changed.** The factory is the same one the first engagement used, which
is what the upgrade path built then was for.

---

## A wallet below the score is refused, and a qualifying one is admitted

A `Score(1)` event created through the upgraded factory:
[`CAA3T2YD…L23RQLD5LO`](https://stellar.expert/explorer/testnet/contract/CAA3T2YDD2HIX7EMBTVOG7IN2PGPRJGKZ22U6YT5QCWWF3L23RQLD5LO).
`get_terms` reads back `{"admission":{"Score":1}}`.

| Wallet | Its record | `rsvp` on that event |
| :-- | :-- | :-- |
| `GDEM74TE…UYJWCWWV` | no shows | **refused — `Error(Contract, #17)`, `ScoreTooLow`** |
| `GB7TWPUD…MYXLVNKCL` | 1 show | admitted — [`031029855aea87393e964c9cef1b5d9a8e6f596afe9659b5e0f36b2aeeecf319`](https://stellar.expert/explorer/testnet/tx/031029855aea87393e964c9cef1b5d9a8e6f596afe9659b5e0f36b2aeeecf319) |

Same event, same gate, two wallets. The only thing separating them is a show
recorded by **a different event contract entirely** — the second wallet earned its
one show by attending a warm-up event first:
[`rsvp`](https://stellar.expert/explorer/testnet/tx/896279038728aed610dded3e3aaed3bb4e64e440845cb5492d77b736d37fd77d) →
[`open_checkin`](https://stellar.expert/explorer/testnet/tx/dc461251d8cac88c970172ebfb9733e8e906a39695f1a6dbd105187be9bb1ab5) →
[`check_in`](https://stellar.expert/explorer/testnet/tx/1194c69724e2c59370345271ebbc2d49a26af22f32fbd6845dc49170e87f85b6).

### Why the refusal has no link

**A contract refusal cannot have a transaction hash.** Soroban simulates a call
before it is submitted, so a contract error means the transaction is never built —
there is nothing to open on Stellar Expert. The evidence is the error code the
contract returns, and it is reproducible by anyone with the CLI and **no key**:

```bash
stellar contract invoke --network testnet \
  --id CAA3T2YDD2HIX7EMBTVOG7IN2PGPRJGKZ22U6YT5QCWWF3L23RQLD5LO \
  --source <a wallet with no shows> -- rsvp --guest <that wallet>
# error: HostError: Error(Contract, #17)
```

This is the same way the first engagement recorded its phase-machine rejections, so
the standard has not moved.

---

## An application, a decision, and the deposit that followed

An `Approval` event:
[`CA5SLCNM…S7GV63S6W2`](https://stellar.expert/explorer/testnet/contract/CA5SLCNML2EWC3FJVVMEIGTC3CJ7COBDZGO4FQ5754B4QQS7GV63S6W2),
2 XLM deposit, capacity 3.

The order is the whole promise of this mode: **nothing is taken until the organizer
has said yes, and the guest is the one who pays when it happens.** Two transactions,
and the second is the applicant's — because nobody should be able to take somebody's
money on the grounds that they approved of them.

The full sequence, both answers included, is in
**[deployments.md](../deployments.md)** under *Admission by the organizer's yes*. A
declined applicant is recorded there too, because an organizer who approves
everybody and one who is actually choosing publish the same event, and the only
thing telling them apart is that word.

---

## A co-host running an event they did not create

`hosts` is a list with the creator permanently at the front. Any host may open
check-in, answer applications, reopen reservations or finalize; **nobody may remove
the creator**, and every payout goes to the wallet that created the event rather
than to whichever host signed. That is what makes adding a co-host a decision about
labour and not about funds.

Proved on Testnet in **[deployments.md](../deployments.md)** under *An event run by
someone who did not create it*: a wallet that did not create the event opening check-in on it, and a
non-host refused with `NotAHost`.

The app can now add and remove co-hosts from the event page itself, which the
contract had allowed since this revision shipped.

---

## What a reviewer can check without trusting this page

| Question | How to answer it, with no key |
| :-- | :-- |
| Does the factory really deploy this wasm? | `stellar contract invoke --id CD5AEMRB…7FCE --network testnet -- get_event_wasm_hash` |
| Is that the hash the repo publishes? | `node scripts/check-wasm-hash.mjs` — CI runs it on every push |
| Is an event's admission mode really fixed on-chain? | `stellar contract invoke --id <event> --network testnet -- get_terms` |

The last one matters most: it reads the gate out of the contract's own storage, so
it cannot be a claim the interface is making.
