# Measurement — the funnel, and what it can honestly say yet

The Customer Development Plan commits to a traffic and funnel report at the end of
the period. This is it.

It reports **no conversion rate**, and the reason is the whole point of the page: the
instrument is working, and the traffic it has seen so far is not the traffic it was
built to measure. Publishing a ratio from it would describe the instrument rather
than the product.

---

## What is measured

Four steps, on the live site, in the order somebody actually moves through them:

| Step | Fired when |
| :-- | :-- |
| Opened an invitation | an event page is opened |
| Connected a wallet | a wallet connects on that page |
| Locked a deposit | `rsvp` is confirmed |
| Turned up and checked in | `check_in` is confirmed |

Three details decide whether the numbers mean anything:

- **The last step is sent with `keepalive`.** Check-in fires as the page is
  navigating away; an ordinary request is cancelled when that happens, and the step
  that matters most would be the one most often lost.
- **A refresh is not a second visitor.** Each row has a deterministic id built from
  the step, the session and the event, so re-opening a page overwrites rather than
  appends.
- **The counts are browser sessions, not people.** One person on two devices is two
  sessions; one person with storage disabled is none. Both are limits of the
  measurement, not of the product — which is why the last two steps are also readable
  from the chain, and the chain is the authority on them.

Run it yourself from the repository root:

```bash
node scripts/funnel-report.mjs
```

---

## The reading, 18.10.2026

```
Opened an invitation        126
Connected a wallet            0
Locked a deposit              0
Turned up and checked in      0
```

**Both halves of that are artefacts of how this period was run, not findings.**

**The numerator is zero because the reservations did not go through a browser.** The
two runs this period were driven directly against the contracts with the Stellar CLI
— which is how every transaction hash in
[deliverable-3.md](deliverable-3.md) came to exist, and why they can be re-derived by
anyone. Twelve reservations and ten check-ins are real, settled and openable on
Stellar Expert. The funnel watches the browser, so it saw none of them.

**The denominator is inflated because the screenshots are automated.** Every capture
pass opens the event pages at two widths, and each headless browser context is a
fresh session with no storage to recognise it by. The screens in this submission cost
the denominator a few dozen rows.

Dividing one by the other would produce a precise-looking number measuring neither.

---

## What it is for

The first event an organiser runs for their own community is the first traffic this
can honestly read, and the step it will answer first is the one the plan cares most
about: **how many people who open an invitation get as far as locking a deposit.**
That is the question a deposit-backed RSVP lives or dies on, and it cannot be
answered by the people who built it reserving spots for themselves.

Until then the useful claim is the narrow one — the instrument exists, it is wired to
the real actions rather than to page views, and its two most important steps can be
checked against the chain.

---

## Where the rest of the customer-development record goes

Written summaries from organiser conversations are added to this directory as they
happen, one page per conversation, with objections recorded in the organiser's own
words rather than paraphrased. The plan is explicit that a record of only the people
who said yes is not customer development, so a no is written up the same way.
