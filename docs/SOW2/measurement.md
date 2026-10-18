# Measurement — the funnel, and what it reads today

The Customer Development Plan commits to a traffic and funnel report at the end of
the period. This is it.

**Every step of the journey an invitation starts is now instrumented on the live
site, and the two that matter most are verifiable twice** — once in the measurement,
and once on the chain, which is the authority on them.

---

## What is measured

Four steps, in the order somebody moves through them:

| Step | Fired when | Also readable from |
| :-- | :-- | :-- |
| Opened an invitation | an event page is opened | — |
| Connected a wallet | a wallet connects on that page | — |
| Locked a deposit | `rsvp` is confirmed | the event contract |
| Turned up and checked in | `check_in` is confirmed | the event contract |

Three details decide whether the numbers mean anything, and all three are handled:

- **The last step survives the page leaving.** Check-in fires as the browser is
  navigating away, and an ordinary request is cancelled when that happens — so it is
  sent with `keepalive`, and the step that matters most is the one least likely to be
  lost.
- **A refresh is not a second visitor.** Each row carries a deterministic id built
  from the step, the session and the event, so re-opening a page overwrites rather
  than appends.
- **The counts are browser sessions, and the page says so.** One person on two
  devices is two sessions. That is why the last two steps are also read from the
  chain: where the measurement is approximate, the contract is exact.

Anyone can run it from the repository root — it needs no account:

```bash
node scripts/funnel-report.mjs
```

---

## What the chain recorded this period

The two runs are settled and complete, and every figure below opens on Stellar
Expert:

| | First run | Second run |
| :-- | --: | --: |
| Reserved | 12 | 12 |
| Checked in | 11 | 10 |
| Deposits returned in full | 11 | 10 |
| Left in the contract afterwards | 0 | 0 |

The second run's guest list was built entirely by vouching — twelve spots, every one
opened by a member signing for somebody. Full detail, wallet by wallet and hash by
hash, in [deliverable-3.md](deliverable-3.md).

---

## What the funnel itself has seen so far

The instrument was switched on partway through the period and has recorded **126
sessions opening an invitation**.

The reservations above are not among them, and the reason is a deliberate choice made
earlier: both runs were driven directly against the contracts with the Stellar CLI
rather than clicked through a browser. That is precisely why every transaction in
this submission can be re-derived by a reviewer with no account — and it is also why
the browser-side instrument did not witness them.

So the honest report is the narrow one: **the funnel is live, wired to confirmed
transactions rather than to page views, and waiting on its first organic traffic.**
A ratio taken from what it holds today would describe the instrument rather than the
product, so none is published here.

The reading, in full, so nothing is withheld:

| Step | Sessions |
| :-- | --: |
| Opened an invitation | 126 |
| Connected a wallet | — |
| Locked a deposit | — in the browser; **24 on-chain across the two runs** |
| Turned up and checked in | — in the browser; **21 on-chain across the two runs** |

---

## The first question it will answer

The first event an organiser runs for their own community is the first traffic this
can read, and the step it answers first is the one the plan cares most about: **how
many people who open an invitation get as far as locking a deposit.** That is the
measurement a deposit-backed RSVP stands on, and it is now a matter of pointing the
instrument at real traffic rather than of building anything.

---

## Where the rest of the customer-development record goes

Written summaries from organiser conversations are added to this directory as they
happen, one page per conversation, with objections recorded in the organiser's own
words rather than paraphrased. The plan is explicit that a record of only the people
who said yes is not customer development, so a no is written up the same way.
