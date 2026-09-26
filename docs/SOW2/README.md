# SOW 2 — evidence of completion

Evidence for the three deliverables of the second Instawards SOW (Stellar Türkiye
chapter). One page each, written against **§6.1**. Everything is on Stellar
**Testnet** — no real money is involved.

| | Deliverable | Evidence | State |
| :-- | :-- | :-- | :-- |
| 1 | Admission, enforced on-chain | [deliverable-1.md](deliverable-1.md) | complete |
| 2 | A reputation record worth reading | [deliverable-2.md](deliverable-2.md) | complete |
| 3 | The product these mechanics need | [deliverable-3.md](deliverable-3.md) | live; recordings filmed on the run |

Live app: **[showup.click](https://showup.click)**. The full technical record is in
the [README](../../README.md) and [deployments.md](../deployments.md). The first
engagement's evidence is in [SOW1](../SOW1/README.md) and **nothing in it has been
invalidated** — both contracts were upgraded in place and neither address moved,
which was the point of building the upgrade paths then.

---

## The one sentence each deliverable is really making

**1 — the gate is the contract's, not the screen's.** An organizer picks how people
get in when the event is created, and `rsvp` enforces it. The interface cannot let
somebody past it and cannot be bypassed by calling the contract directly. Proved by
two wallets refused and admitted at the same event, where the only difference between
them was a check-in recorded by a *different* event contract.

**2 — the record survived being upgraded, and now costs something to lend.** The
reputation contract gained vouching and a full record at the address it has always
had, and the fourteen scores from the first engagement were compared before and after
by machine: unchanged. A member can put their record behind a newcomer who has none,
and if that newcomer does not turn up it is charged to them — on its own counter, in
the same transaction that moves the money.

**3 — the mechanics are usable by somebody who has never heard of Soroban.** The
gates explain themselves before asking for a signature, a wallet can have a name,
and the deposit is explained in the event's own numbers before anybody signs
anything.

---

## How to check any of it without trusting these pages

Three of the checks need **no key, no funded account and no signature**:

```bash
# Does the factory deploy the wasm the repo publishes? CI asks this on every push.
node scripts/check-wasm-hash.mjs

# Are the first engagement's fourteen scores still what they were?
node scripts/reputation-snapshot.mjs

# Is an event's admission mode really fixed in its own storage?
stellar contract invoke --id <event> --network testnet -- get_terms
```

Every transaction hash on these pages opens on Stellar Expert. Every contract error
quoted as evidence is reproducible with the CLI — and a contract refusal deliberately
has **no hash**, because Soroban simulates before submitting, so the transaction is
never built. That is stated wherever it comes up rather than papered over with a
screenshot.

---

## What is not here

- **Mainnet.** Out of scope in both engagements. Every address on these pages is
  Testnet.
- **User counts.** No deliverable promises a number of people or events; every
  evidence item is a transaction that can be produced on demand.
- **A staged demo.** Deliverable 3's screenshots, onboarding recording and video are
  filmed on the event run itself rather than assembled from a script, because a demo
  of a vouch-gated event needs a vouch-gated event with people in it. The mechanism is
  already proved transaction by transaction in
  [deliverable-2.md](deliverable-2.md).
