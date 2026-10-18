# Measurement — what the chain recorded, and what is now instrumented

The Customer Development Plan commits to a traffic and measurement report at the end
of the period. This is it.

Showup's central claim is that attendance can be made verifiable instead of assumed.
That makes measurement unusually strong here: **the two numbers that matter most —
who reserved, and who turned up — are not analytics at all. They are contract
state**, settled on Stellar Testnet, openable by anyone, and impossible for us to
edit after the fact.

---

## What the period produced

Two complete runs through the live product, both settled, both re-derivable by a
reviewer with no account and no wallet:

| | First run | Second run |
| :-- | --: | --: |
| Spots reserved | 12 | 12 |
| Guests who turned up and checked in | 11 | 10 |
| Deposits returned **in full, in the same transaction** | 11 | 10 |
| Forfeited deposits redistributed to the people who came | 5 XLM | 20 XLM |
| Left stranded in the contract afterwards | **0** | **0** |

**24 reservations and 21 check-ins**, each one a signed transaction with its own hash.

The second run is the one the engagement was built for: **a guest list of twelve
where not a single spot could be taken without a member first putting their own
record behind the person.** Six members vouched, two guests each. Ten turned up and
were refunded the moment they checked in. Two did not, and one `finalize` transaction
split their deposits among the ten who came, recorded the absences, and charged the
two members who had vouched for them — all of it decided by the contract, none of it
by us.

Wallet by wallet and hash by hash: **[deliverable-3.md](deliverable-3.md)**.

---

## Why these figures are stronger than a dashboard

A conventional funnel reports what a browser was willing to tell it. These figures
have three properties an analytics product cannot offer:

- **They are adversarial-proof.** A reservation exists because XLM moved into an
  event contract. We cannot inflate it, and a reviewer does not have to take our word
  for a single row.
- **They are reproducible on demand.** `npm run evidence -- <event>` reads every
  reservation, check-in, phase change and settlement straight off the chain and
  prints the table again. If a hash in our documentation were ever altered, the
  script would disagree with it.
- **They settle completely.** Every run ends with **0** left in the contract. The
  deposit is not held, not escrowed, not pending — it is back in the attendee's
  wallet in the same transaction as the check-in.

---

## What is instrumented on the live site

Alongside the on-chain record, the journey an invitation starts is now measured
end to end, so the next period can read behaviour as well as outcomes:

| Step | Recorded when | Also provable on-chain |
| :-- | :-- | :-- |
| Opened an invitation | an event page is opened | — |
| Connected a wallet | a wallet connects on that page | — |
| Locked a deposit | `rsvp` is confirmed | yes |
| Turned up and checked in | `check_in` is confirmed | yes |

Three design decisions make it trustworthy:

- **The final step survives the page leaving.** Check-in fires as the browser is
  navigating away, so it is sent with `keepalive` — the most important step is the
  one least likely to be lost.
- **A refresh is not a second visitor.** Every row carries a deterministic id built
  from the step, the session and the event, so re-opening a page overwrites rather
  than appends.
- **Approximate and exact are kept apart.** Browser sessions are an estimate of
  people; the contract is not. Wherever the two overlap, the chain is treated as the
  authority.

---

## The first question it answers next

The instrument is built, wired to confirmed transactions rather than page views, and
ready. The first event an organiser runs for their own community gives it the traffic
it was designed for, and the first thing it will report is the question the plan cares
most about: **how many people who open an invitation go all the way to locking a
deposit.** That is the number a deposit-backed RSVP stands on, and the work needed to
get it is now a conversation rather than a build.

---

## Where the rest of the customer-development record goes

Written summaries from organiser conversations are added to this directory as they
happen, one page per conversation, with objections recorded in the organiser's own
words rather than paraphrased — including from anyone who decides Showup is not for
them, because a record of only the people who said yes would not be worth keeping.
