# Deliverable 3 — evidence

The product these mechanics need: the four admission modes made usable, names to
attach a record to, an explanation before anybody signs, and a conversation for the
people who have a spot.

> **SOW §6.1:** the public URL of the rebuilt app. Before-and-after screenshots of
> every screen, desktop and phone. A claimed display name appearing across the app,
> and the Firestore rules in the repo that make claiming one safe. A screen recording
> of first-run onboarding. A screenshot of the event conversation with confirmed
> guests in it. A 1-2 minute demo video of an event whose guest list was built by
> vouching.

Everything below is on Stellar **Testnet**. No real money is involved.

**Every screen described here is live at [showup.click](https://showup.click).** The
screenshots, the onboarding recording and the demo video are filmed on the event run
itself, so each section says where its recording comes from.

---

## The app

**[showup.click](https://showup.click)** — built · every screen below is live.

| Screen | What shipped |
| :-- | :-- |
| Home | Events grouped by day, each card saying **whether you can get in at all** — `Regulars only`, `By approval`, `Needs a vouch`. The default mode stays unlabelled, so the one row that carries information is not diluted. |
| Event page | All four admission modes read honestly. A score-gated event shows your own check-in count against the threshold **before the button**; a vouch-gated one shows how many members have backed you and lets any member vouch. |
| Create | The four modes, with only the chosen mode's number appearing. Co-hosts addable and removable from the event page. |
| `/u/<address>` | A wallet's whole record, read from the chain, openable by anyone. See [deliverable-2.md](deliverable-2.md). |

### The refusals a guest used to meet as a failed transaction

Both gated modes used to be enforced on-chain and unexplained in the interface, so a
guest below the bar met the gate as a **wallet prompt followed by a contract
error**. Both now put the numbers in front of the button:

- **Score** — your check-ins, the threshold, and the sentence that actually answers
  the question: a refusal costs nothing, because the reservation is refused rather
  than taken and forfeited.
- **Vouch** — how many members have vouched for you out of how many are needed, your
  address ready to send to somebody who can, and a form for any member to vouch from.

Neither shows a `0` it has not been told. A count that has not arrived renders as
*checking*, because a guest who has already been vouched for, shown a screen saying
nobody has, would go and ask again.

---

## Display names

**Built.** Optional by design: a wallet with no name reserves, checks in, vouches and
organizes exactly as before, and every screen falls back to the shortened address it
has always shown.

A name appears wherever a wallet does — the record page heading, an event's organizer
row, the host list, the approval queue, the conversation — and the full address stays
on hover, because a name is a label somebody chose and the address is what the chain
knows.

### What makes claiming one safe

A display name is **the only thing in this app a person authors**, which makes it the
only thing needing a real answer to "who is asking". It sits next to somebody's
attendance record and in an organizer's approval queue, so a name claimed for a
wallet you do not hold is an impersonation the interface would perform on your behalf.

The proof is a **challenge transaction**, and the reason it is not a signed message
is worth stating: **Albedo, one of the four wallets this project promises, has
`signMessage()` stubbed out as SEP-0043 incompatible.** Building on it would have
left a quarter of users unable to have a name, and they would have been the ones to
find out.

So: the server issues a transaction sourced from the claimed account carrying a
one-use nonce, the wallet signs it, and the server verifies the signature **against
that account's own public key** before writing anything. Nothing is ever submitted,
no fee is paid, and the screen says so before the prompt appears.

| Where to look | |
| :-- | :-- |
| The rules | [`firestore.rules`](../../firestore.rules) — `names` is readable and **not writable by any client**; the nonces are neither |
| The proof | [`web/src/lib/wallet-proof.ts`](../../web/src/lib/wallet-proof.ts) — one implementation, shared with the conversation |
| The route | [`web/src/app/api/names/route.ts`](../../web/src/app/api/names/route.ts) |

Each check closes a named door, and the file says which: signature against the
claimed key, nonce issued here for this address and purpose, spent once, expires.

---

## First-run onboarding

**Built.** Three things before anybody is asked to sign, **using the event's own
numbers rather than an example** — "a deposit is refunded when you attend" is a
sentence about software, and "your 10 XLM comes back when you check in" is a sentence
about their money.

1. **You get it back.** The only question anybody has, answered first.
2. **It isn't real money.** Testnet XLM is free and worth nothing anywhere. Said
   plainly and early, because somebody believing they are risking savings is a
   failure — and so is somebody believing the opposite of a real deposit later.
3. **A wallet holds it.** Last, because it is the step and not the reason.

Once per browser, dismissable from anywhere, and it still appears rather than
crashing in a browser that refuses storage.

The screen recording §6.1 asks for is filmed on the run, against a real event.

---

## The event conversation

**Built.** A thread scoped to one event, open to the people holding a spot in it and
to its hosts. No direct messages; the only moderation is a host removing a message
from their own event.

### Why membership is checked in a route and not in a Firestore rule

The plan for this said "with Firestore rules enforcing it rather than the interface
hiding it", and what shipped meets that requirement a different way — because the
obvious way is **weaker** here.

A Firestore rule can only reason about what is in Firestore. To gate on membership it
would have to read the *mirrored* event document, which is a snapshot: a guest list
that was true when the last sync ran. **The authority on who is holding a spot is the
event contract, and no rule can read a contract.** So a rule-based version would
enforce the right idea against the wrong source.

Instead, every request reads `get_reserved`, `get_checked_in` and the host list **off
the chain**, and [`firestore.rules`](../../firestore.rules) denies clients both reads
and writes on the collection — so there is no path to a message that does not go
through that check. A failed chain read refuses the request rather than falling back
to the snapshot.

Verified against the live chain on 26.09.2026, on a real event:

| Caller | Result |
| :-- | :-- |
| no session | `401` — sign in to read this conversation |
| the host | `200`, marked as host |
| a wallet the contract lists as reserved | `200` |
| **a wallet with a genuine session, not in the event** | **`403` — this conversation is for the people holding a spot** |
| a message claiming somebody else as its author | stored under the **session's** address, not the claimed one |

The screenshot §6.1 asks for is taken on the run, once the guest list is real.

---

## Measurement

**Built.** Four steps are recorded — `invite_opened`, `wallet_connected`, `reserved`,
`checked_in` — because the interesting half of the funnel is invisible on-chain: the
chain knows who reserved, and has no idea how many people opened a link and closed
it. That gap is the case for the deposit.

`node scripts/funnel-report.mjs` prints the table from the rows. It states, rather
than smooths over, that the counts are **browser sessions and not people**: one
person on two devices is two, one with storage disabled is none. The last two steps
are also on-chain facts and are cross-checked against the contract, which is the
authority on them.

The identifier is a random per-browser string carrying no wallet, no IP and nothing
derived from the visitor — only enough to recognise one visit across four steps,
without which a drop-off cannot be computed at all.

---

## Mobile

**Built.** `node scripts/mobile-audit.mjs` runs in CI and checks the three faults
that have actually bitten this project: an input under 16px (which makes iOS Safari
zoom in and never back out), a tap target under 44px, and a fixed width wide enough
to leave a 320px screen. All three were real bugs here once.

It is explicit about what it cannot see — overlapping text, a heading that wraps
badly at 280px, a sheet that opens off-screen — because those still need somebody
looking at a phone.

---

## The recordings, and where they come from

Three §6.1 items are captures of software that is already live, and all three are
produced by the same event: the before-and-after screenshots at both widths, the
onboarding recording, the conversation with a real guest list in it, and the 1–2
minute demo video of an event whose guest list was built by vouching.

Filming them last is deliberate rather than incidental. A demo of a vouch-gated
event needs a vouch-gated event with people in it, and the alternative is a video of
a staged screen. **The mechanism itself is already proved on-chain, transaction by
transaction, in [deliverable-2.md](deliverable-2.md)** — a newcomer with no record
admitted on a member's vouch, and that vouch charged when they did not turn up. What
the video adds is a person watching it happen.
