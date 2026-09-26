# Deliverable 2 — evidence

The reputation contract grew from one number into a record, **at the address it has
always had**, and there is now a page anybody can open to read it.

> **SOW §6.1:** the reputation contract at its original address after upgrading, with
> scores earned in SOW 1 still readable — the same wallets, the same numbers. A signed
> `vouch` transaction, the reservation it admitted, and a finalise where a vouched-in
> guest who didn't turn up is recorded against their voucher. Public profile URLs
> showing those records read live from the chain.

Everything below is on Stellar **Testnet**. No real money is involved.

---

## The same address, and the first engagement's scores still there

| What | Value |
| :-- | :-- |
| Reputation ledger | [`CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ`](https://stellar.expert/explorer/testnet/contract/CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ) |
| Wasm hash after the upgrade | `bef89aa051523067c0f720f118bbddf47f055e867865bdd785e6c067ebaec9ff` |
| `upgrade` transaction | [`b20f9b39cdac2bd597e6a324868f00991401b205bc29f963accacf09722c9a3a`](https://stellar.expert/explorer/testnet/tx/b20f9b39cdac2bd597e6a324868f00991401b205bc29f963accacf09722c9a3a) |

**This is the promise the whole engagement rests on**, so it was not eyeballed. The
fourteen records earned in the first engagement were snapshotted before the upgrade
and compared after it, by machine:

```bash
node scripts/reputation-snapshot.mjs --out before.json    # before
node scripts/reputation-snapshot.mjs --against before.json # after
# ok     every record is exactly as before.json left it
```

**Fourteen of fourteen, unchanged.** The script reads contract *storage* rather than
calling a function, which means it needs **no key, no funded account and no
signature** — a reviewer can re-derive every number this repository publishes from
the addresses it names.

Then the same record read back through the new entry point, which is what the site
calls:

```bash
stellar contract invoke --network testnet --id CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ \
  --source <any account> -- \
  get_record --member GBAW4G42254EEXDLUQ5X5GSZ6H7E46PM5AL364H2EVKRMMANDQCUFQXF
# {"events_organised":0,"no_shows":0,"shows":1,"vouches_broken":0,"vouches_given":0}
```

`shows: 1` is from the first engagement. The three new counters read `0` because
this member predates them entirely, and **that is the design working rather than a
coincidence**: the stored `Score` struct could not grow a field without making every
entry written by the older contract undecodable, so the new counters live in a
separately keyed entry a member is allowed not to have. The record is assembled from
both at read time and never stored.

---

## A vouch, the reservation it admitted, and what it cost

A `Vouch(1)` event:
[`CDCGNAG4…BNFTKJ43AO`](https://stellar.expert/explorer/testnet/contract/CDCGNAG4RTC3KFYIRX2WDLSDKZMQWXLBCNIF3MITT6CSIRBNFTKJ43AO),
2 XLM deposit. The newcomer&apos;s wallet was **generated that morning**, so
"somebody with nothing of their own" is a fact rather than a description: all five
counters at zero.

| Step | Transaction | What the chain shows |
| :-- | :-- | :-- |
| newcomer `rsvp`, before any vouch | *refused* | `Error(Contract, #27)` — `NotEnoughVouches` |
| a member's `vouch` | [`1f84ca6d…1bcad4`](https://stellar.expert/explorer/testnet/tx/1f84ca6d9419f412187257b5b61fd72c29c8bae8ec99b6e8b07f618fd71bcad4) | `Vouched { vouches: 1 }`, and **no money moves** |
| newcomer `rsvp`, admitted | [`a01715f5…2cc633`](https://stellar.expert/explorer/testnet/tx/a01715f5e9b93d0de130fea2d9cc7c55301a22e928635d2130a0d24bdb2cc633) | 2 XLM locked by a wallet with no record of its own |
| `open_checkin` | [`4226a1f8…d719d4`](https://stellar.expert/explorer/testnet/tx/4226a1f8a73f45e28c2b5714af42beb3ee3adeafe95496a5af42f10799d719d4) | `PhaseChanged { CheckingIn }` |
| **`finalize`** | [**`bc35d8fe…bf6f3a`**](https://stellar.expert/explorer/testnet/tx/bc35d8fe9daf9c2617d15e635f1ec6d3bd36a9adb6221e8eac284764c2bf6f3a) | see below |

A vouch is **permission to reserve, not a reservation**: it moves no money and takes
no spot, and the deposit is the next transaction, paid by the newcomer themselves.

### The cost, in one transaction

The newcomer never checked in. That single `finalize` carries all four of these:

- `transfer` of 23 XLM to the organizer — the 2 XLM forfeited plus the fee pool
  nobody drew from
- `score_changed { no_shows: 1 }` — the newcomer
- `vouch_recorded { broken: true }` — the voucher
- `Finalized { showed: 0, no_shows: 1, forfeited: "20000000" }`

**There is no ordering of transactions in which the deposit has been forfeited and
the voucher's record still says nothing went wrong, because there is only ever one
transaction.**

Records read straight afterwards:

| Wallet | `get_record` |
| :-- | :-- |
| the voucher | `{shows: 1, no_shows: 0, vouches_given: 1, vouches_broken: 1}` |
| the newcomer | `{shows: 0, no_shows: 1}` |
| the organizer | `{events_organised: 1}` |

**The voucher's `shows` is still 1 and their `no_shows` is still 0.** Backing somebody
who did not turn up is not the same failure as not turning up yourself, and one
number could not answer both questions afterwards. The ledger's own storage
timestamps show the voucher's attendance entry was never rewritten — only their
extras entry was — which is in **[deployments.md](../deployments.md)** with the
ledger numbers.

### One bad call closes the door, and it is not a show count

A second `Vouch(1)` event separates two members who look identical on paper:

| Member | `shows` | `vouches_broken` | `vouch` at the new event |
| :-- | :-- | :-- | :-- |
| `GB7TWPUD…MYXLVNKCL` | 1 | 1 | **refused — `CannotVouch`** |
| `GA5TJJJC…W6KEVNGEO` | 1 | 0 | admitted — [`160a5e87…bd7c76`](https://stellar.expert/explorer/testnet/tx/160a5e87a1929e320a0a2a0f2388b333ba5c637d585e84f247fe838000bd7c76) |

Same event, same gate, same attendance count. The only difference is one bad call
made at **a different event contract**, and it followed the member here. The rule is
not a threshold, so no amount of showing up clears it — which is what stops somebody
buying the right to keep waving strangers in by attending a lot of their own events.

---

## A record kept alive by somebody who does not own it

Soroban charges rent on stored data: an entry nobody touches is eventually
**archived — not deleted, and never lost, but unreadable until somebody pays to
restore it.** Every write already extends what it wrote, which quietly meant a record
survived only while its owner kept attending things, expiring precisely for the
person who had stopped needing to prove anything.

`renew(member)` takes no auth and no admin, so anyone who cares about a record can
keep it alive. Proved by the wallet least entitled to do it — minted that morning,
holding no record, neither admin nor factory:

| Call | Transaction |
| :-- | :-- |
| a stranger renews somebody else's record | [`551bada3…6ffa05`](https://stellar.expert/explorer/testnet/tx/551bada3e826d5956a94465e5a61f5a7dfc1f66d24c2504a43a2b97d946ffa05) |
| a stranger renews a wallet the ledger has never seen | [`1d8f7bb1…f93b40`](https://stellar.expert/explorer/testnet/tx/1d8f7bb15fb1ce492088000e05c38cabdf9d1e006f43a377bfc6b4c5d2f93b40) |

Both succeed. What they do not do is the point: **the numbers do not move** — `renew`
extends a lease and has no way to write a score — and **no entry is created** for a
stranger, so nobody can fill the ledger with blank records at our expense.

It is a CLI call rather than a button, deliberately, and
**[deployments.md](../deployments.md)** records why: above its threshold the
extension is a no-op the Stellar SDK correctly classifies as a read, so a button
would have taken a signature and done nothing.

---

## The page anybody can open

`/u/<address>` — the same numbers an event contract gates on, at a URL that can be
pasted into a group chat. No wallet and no account needed to read one.

| Example | |
| :-- | :-- |
| a member with a broken vouch | [`showup.click/u/GB7TWPUDTFK7TZCX2JEJW675KE4B2T5UPOLKNJGRDGRY5H7MYXLVNKCL`](https://showup.click/u/GB7TWPUDTFK7TZCX2JEJW675KE4B2T5UPOLKNJGRDGRY5H7MYXLVNKCL) |
| an organizer | [`showup.click/u/GDL3H646S6HGGJTH2BBNCBDONJDN5E7L56ZRFWGCOSPXEDHOJLZOZKI5`](https://showup.click/u/GDL3H646S6HGGJTH2BBNCBDONJDN5E7L56ZRFWGCOSPXEDHOJLZOZKI5) |

Three things it is careful about, all of them cases where a page could make a claim
the chain never made:

- **"No record" and "zero shows" are different**, and the page says which. Every
  writer the contract has raises some counter, so an all-zero record proves the
  ledger has never written about that wallet rather than suggesting it.
- **A wallet with no reservations has no turnout rate**, not 0% — which would read
  as "never shows up" and would libel every newcomer on the ledger.
- **A failed read is not an empty record.** "We couldn't ask the chain" and "this
  person has never shown up" are opposite claims, and the page refuses to guess.

The numbers are served from a Firestore mirror that is **written only from a chain
read**, with the time of that read printed underneath and a refresh on every view.
Nothing that *decides* anything goes through the mirror: admission, vouching and
settlement all read the contract at the moment they act. There is no code path from
a request body to a stored number, and client writes are denied outright in
`firestore.rules` — a reputation somebody could edit is not a reputation.
