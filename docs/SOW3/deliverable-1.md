# Deliverable 1 — evidence

**A deposit nobody can strand.** Every previous way a deposit came back required
the organizer to do something: open check-in, call `finalize`. An organizer who
simply stopped — lost the key, lost interest — left everybody's money locked in a
contract with no path out, forever. That is now closed, and with it every amount
in the money path is bounded.

> **SOW §6.1:** the contract address and transaction hashes for a Testnet event
> that was abandoned and whose deposit was recovered anyway; the organiser's
> accountability counter read after the fact; the new event wasm hash and the
> transaction pointing the live factory at it; each refusal with its error code
> and a command to re-run it.

Everything on this page is on Stellar **Testnet**, which is where the contract
work was done and frozen. The *same binaries* are now also on Mainnet — see
[deliverable-3.md](deliverable-3.md).

---

## `reclaim` — a door that opens on a clock

Forty-eight hours after an event's start time, any guest still holding a
reservation takes their own deposit back. Signed by themselves, **with no
organizer in the transaction and no admin anywhere in the path.** It is not a
refund somebody grants.

The 48 hours are the organizer's to settle in: before that the contract refuses
with `ReclaimTooEarly`, because a reclaim racing a `finalize` is the one case
where both parties are acting legitimately.

### Proved on the live chain

An event created with a start time two days in the past, reserved, and then
abandoned — the organizer never called anything again.

| | |
| :-- | :-- |
| Event | [`CAYQHGRPZ7SKAESRPNJRK6RQZBDYZWYZFHGYO2LW3U5MNETV4L7KCAK5`](https://stellar.expert/explorer/testnet/contract/CAYQHGRPZ7SKAESRPNJRK6RQZBDYZWYZFHGYO2LW3U5MNETV4L7KCAK5) |
| Organizer, who abandoned it | `GD2CEL7T4F4ZAMAPXULE6WOP4GH5VMCSTFVGZEE7B67X3NMXMPVMRY5H` |
| Guest, who recovered their own money | `GASUZI3HLTYBPQ7YYEAZ427D2K2BNBVOZQDQ5KJC3T5P6R6FZWTODEDY` |
| `rsvp` — 1 XLM locked | [`369dc200cc5555b9c7d08f74347382f7765ab1de942182af480022c29113f75d`](https://stellar.expert/explorer/testnet/tx/369dc200cc5555b9c7d08f74347382f7765ab1de942182af480022c29113f75d) |
| **`reclaim` — 1 XLM back** | [`dc0ec0e27c1b6bb91d4f24475028c1e653597c4169853e7956c9594232d0b3be`](https://stellar.expert/explorer/testnet/tx/dc0ec0e27c1b6bb91d4f24475028c1e653597c4169853e7956c9594232d0b3be) |

Open the `reclaim` transaction and look at who signed it: the guest, and nobody
else. That is the deliverable.

### The organizer's side of it, read back from the chain

An abandoned event is recorded against whoever created it — on its own counter,
`events_abandoned`, separate from `events_organised`. There is no `finalize` to
carry that write, which is the whole point, so the **first** reclaim carries it:
a guest giving up on the organizer is the honest definition of the thing being
recorded.

```bash
# The organizer: 0 before the reclaim, 1 after.
stellar contract invoke --id CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ \
  --network testnet --source-account <any> -- \
  get_record --member GD2CEL7T4F4ZAMAPXULE6WOP4GH5VMCSTFVGZEE7B67X3NMXMPVMRY5H
# {"events_abandoned":1,"events_organised":0,"no_shows":0,"shows":0,...}

# The guest's own record is untouched — a reclaim is neither attendance nor absence.
stellar contract invoke --id CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ \
  --network testnet --source-account <any> -- \
  get_record --member GASUZI3HLTYBPQ7YYEAZ427D2K2BNBVOZQDQ5KJC3T5P6R6FZWTODEDY
# {"events_abandoned":0,"events_organised":0,"no_shows":0,"shows":0,...}
```

The write goes through `try_record_abandoned`: a reputation contract that is
unreachable must never take somebody's deposit down with it.

---

## The settlement was corrected to match

`finalize` now subtracts reclaimers before working out the no-shows. Without that
term the contract tries to redistribute money that has already left, the transfer
traps, and **an event that was abandoned *and* partly reclaimed could never be
settled at all** — stranding precisely the people who waited rather than walking
out. One fix creating a second, worse trap is the failure mode this avoided.

---

## Amounts that cannot overflow

| What | How |
| :-- | :-- |
| The ceiling | `deposit + fee_allowance`, multiplied across the whole capacity, must fit in an `i128` or the event is never deployed |
| Where it is enforced | At creation — the only moment these three numbers can be rejected while nobody's money depends on them |
| The money path | Every line `checked_`, returning `InvariantViolated` rather than trapping |

**Deliberately not saturating arithmetic**, which is the obvious reading of an
overflow finding and would have been the wrong fix: a saturating subtraction
turns a broken invariant into a plausible-looking wrong number, and in `finalize`
that number is how much money each attendee receives. A refusal can be diagnosed
and recovered from; a wrong payout cannot.

---

## The refusals, and why they have no transaction hashes

Soroban simulates a call before it is submitted, so **a refused call never becomes
a transaction.** There is no hash to publish and there cannot be one. The error
code and a command anybody can run are the honest evidence.

```bash
# A deposit that cannot fit: refused at creation, nothing deployed.
stellar contract invoke --id CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE \
  --network testnet --source-account <any> -- create_event \
  --organizer <any> --title "ceiling probe" --starts_at 1800000000 \
  --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
  --deposit 170141183460469231731687303715884105727 --fee_allowance 1 --capacity 2 \
  --code_hash 0000000000000000000000000000000000000000000000000000000000000001 \
  --policy ToOrganizer --admission Open
# Error(Contract, #30)  — AmountsTooLarge

# A second reclaim from a wallet that already took its deposit back.
stellar contract invoke --id CAYQHGRPZ7SKAESRPNJRK6RQZBDYZWYZFHGYO2LW3U5MNETV4L7KCAK5 \
  --network testnet --source-account <any> -- \
  reclaim --guest GASUZI3HLTYBPQ7YYEAZ427D2K2BNBVOZQDQ5KJC3T5P6R6FZWTODEDY
# Error(Contract, #29)  — AlreadyReclaimed
```

**Eight error codes also stopped falling through to "the transaction failed,
please try again."** Codes 24–31 — four from the previous engagement's vouching
work, four from the reclaim and the bounds — were all landing on the generic
retry message. Not one of them is helped by retrying, which is the single piece
of advice that whole list of messages exists to stop giving.

---

## The deployed revision

| What | Value |
| :-- | :-- |
| Event factory, unchanged address | [`CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE`](https://stellar.expert/explorer/testnet/contract/CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE) |
| Event wasm hash | `5f5e0ec548c2142f6c64427c666ecef71bfa31589f43cd3e02d82659db7d5d03` |

That hash is checked against the live factory **by CI on every push**, asked of
the chain rather than of a local build — so the number above cannot quietly stop
being true. The same check now runs for Mainnet.

Ask the factory yourself:

```bash
stellar contract invoke --id CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE \
  --network testnet --source-account <any> -- get_event_wasm_hash
# "5f5e0ec548c2142f6c64427c666ecef71bfa31589f43cd3e02d82659db7d5d03"
```

Events created before this revision keep the one they were born with:
`set_event_wasm_hash` governs the next event, never an existing one. That is also
why the event contract deliberately has **no `upgrade`** — a deployed event holds
other people's deposits under rules they agreed to, and being able to rewrite
those rules afterwards is not a feature.

---

## What is not here

**A vouch with XLM staked**, broken and resolved inside one settlement
transaction, was in the plan for this deliverable and was **not built**. It was
third on the written list of what falls if the month runs short, and it fell.
Vouching still works and still costs the voucher their `vouches_broken` counter —
what is absent is money staked behind a vouch.

The full technical record, including every cost and the reasoning behind each
decision, is in [deployments.md](../deployments.md) and the
[README](../../README.md).
