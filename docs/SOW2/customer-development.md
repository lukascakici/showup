# Customer development — how organiser conversations are run

The Customer Development Plan names six hypotheses the product rests on. Five of them
can only be answered by an organiser, so the conversations that answer them are run to
a fixed method rather than improvised: **the same questions, in the same order, every
time, written up one conversation at a time.**

That matters for a specific reason. Six conversations summarised in aggregate produce
an opinion. Six conversations recorded separately against the same questions produce a
comparison — and a comparison is the only thing that can change a product decision.

Summaries land in this directory as they happen, one page per conversation, with
objections in the organiser's own words rather than paraphrased. Conversations with
organisers who decide Showup is not for them are written up the same way: those are
the ones that carry the most information about what to build next.

---

## What the organiser is shown first

Two minutes, no jargon, no terminal, no mention of Soroban. The order is deliberate —
it opens on the problem they already have, not on the technology:

1. **The problem, in their numbers.** "You invite sixty, you order food for forty,
   twenty-five come." Let them supply the figures; they always have them.
2. **The change, in one sentence.** Reserving a spot locks a small refundable deposit.
   Turning up returns it immediately. Not turning up forfeits it to the people who did.
3. **The invitation.** A link they can post in the group chat they already use.
4. **The door.** They decide who gets in: anyone, regulars only, by their approval, or
   by vouch from a member. The contract enforces it, so the guest list is not a
   suggestion.
5. **The settlement.** At the end, one action returns every attendee's deposit and
   splits the no-shows' deposits among the people who came. Nothing stays with us.
6. **The record.** Everyone who turned up has it on their own public record, usable at
   the next event — theirs or anybody else's.

The live site and the fifteen-second overview are the assets:
[showup.click](https://showup.click) · [youtu.be/0s9vVx6JVSg](https://youtu.be/0s9vVx6JVSg)

---

## The question set

Each question exists to move one hypothesis. The hypothesis is named so a summary can
be read against it later.

### Their current reality — opens the conversation, grounds everything after it

1. How do people register for your events today, and what happens on the day?
2. Of the people who say they are coming, how many actually come? *(Ask for a real
   number from the last event, not an average.)*
3. What does a no-show cost you — in money, in space, in somebody else's seat?

### H1 — a refundable deposit materially changes who turns up

4. If reserving required a small refundable deposit, what would you expect to change?
5. What amount feels like a commitment without being a barrier for *your* crowd?
6. Would you rather have forty people who paid nothing, or thirty who put something
   down?

### H2 — the organiser is the customer, the attendee is the user

7. Is this a decision you make on your own, or does somebody else have to agree?
8. What would have to be true for you to use this for your next event rather than a
   later one?
9. What is the first thing that would make you abandon it halfway through setting it up?

### H3 — inside a crypto community, a wallet is not a fatal barrier

10. How many of your regulars already hold a Stellar wallet?
11. If a few did not, is that something you would help with on the day, or a reason not
    to use it at all?

### H4 and H5 — the record, and the vouch

12. Would you want to require a track record to get into a selective event of yours?
13. Would you let a trusted regular bring somebody *they* answer for?
14. Does a public record of who turned up help you, or is it something your crowd would
    be uneasy about?

### H6 — proof of attendance versus a registration form

15. If you could have only one — a smooth registration form, or a verifiable record of
    who actually came — which do you take?

### Close

16. What have I not asked about that matters more than any of this?
17. Who else runs events like yours that I should talk to?

Question 16 is the one that most often changes the roadmap, which is why it is asked
before question 17 rather than after.

---

## The summary template

One file per conversation, named `YYYY-MM-DD-<organiser-or-community>.md`.

```markdown
# <Organiser / community> — <date>

**Who:** what they run, roughly how often, roughly how many people.
**Format:** call / in person / written.

## Their numbers
Invited · said yes · turned up, from their last event. Their figures, not estimates.

## What they said
Answers in their own words wherever the wording matters. Quote rather than paraphrase
when they are being specific about money, people or effort.

## Reads on the hypotheses
- **H1 (deposit changes turnout):** what this conversation suggests, and how strongly.
- **H2 (organiser is the customer):** …
- **H3 (wallet barrier):** …
- **H4 / H5 (record and vouch):** …
- **H6 (proof vs form):** …
Leave a hypothesis out rather than stretching an answer to cover it.

## Objections, verbatim
The sentences that start with "the problem is" or "I wouldn't because".

## What changes because of this
A product decision, a copy change, or nothing — and if nothing, say so.

## Outcome
Would they run an event on it? What was agreed, and when the follow-up is.
```

The "reads on the hypotheses" section is deliberately separate from "what they said".
Keeping the record apart from the interpretation means a later reader can disagree
with the interpretation without losing the evidence.

---

## What is being offered

The concrete proposal put to an organiser is a single event, run for real:

- **Created from their own wallet**, not ours — so the event is theirs, the forfeited
  deposits pay them, and the guest list is under their control from the first
  transaction.
- **On Testnet**, so nothing at stake is real money while they decide whether the
  mechanic suits their crowd.
- **With the deposit set by them**, because the right number is a property of their
  community and not of the software.

Where an organiser adopts it, the follow-up proposal is a recurring series rather than
a single event: a show-up record demonstrates its value on somebody's third and fourth
event, and one event cannot show that however good the evidence from it is.
