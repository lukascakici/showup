# Showup at the Pro Hackathon, Grand Pera Edition

**Rise In × Stellar — Grand Pera, Beyoğlu, Istanbul, 19–20 September 2026.**

Showup was shown in person across both days to **twenty to thirty people**, with a
page built and deployed for the room —
**[showup.click/prohackathon_residency](https://showup.click/prohackathon_residency)**,
open for the two days the hackathon ran — and printed QR cards left on the tables so
anyone could open it on their own phone.

![Showup open at the Pro Hackathon, Grand Pera Edition, with the printed QR card on the table](../screenshots/hackathon.jpg)

## What came out of it

- **Members of the Stellar team saw it and gave feedback on where to take it next.**
- **An organiser said they would consider running their own event on it** — the first
  read from outside the project on the question that matters most: whether somebody
  who is not the builder would use it for their own crowd.
- **Another team proposed building on top of it**, integrating Showup into the project
  they were working on at the hackathon. Interest in it as a *layer* rather than a
  destination is the clearest sign that the registration problem is felt by builders
  as well as by organisers.
- **Several people asked how the system was designed** — the gates, where the deposit
  is held, what the contract decides and what the screen only displays.

## What it confirmed

**Most of the people shown Showup already held a Stellar wallet.**

That is the assumption the whole go-to-market rests on, and this is the first direct
evidence for it. Starting inside the Stellar ecosystem rather than with restaurants or
five-a-side football groups was a deliberate choice: everywhere else a deposit begins
with a wallet problem, and here it begins with a scheduling problem — which is the one
Showup is for.

## The page built for the room

The roll call deliberately touches no contract and holds no deposit. Its only job is
to get a room full of people past "connect a wallet" in a single tap, at an event
where asking each person to fund a Testnet account and sign a transaction would lose
most of them at the door.

Because of that, nothing it records is ever presented as attendance evidence.
Attendance evidence comes from the chain — twenty-four reservations and twenty-one
check-ins this period, each one a signed transaction openable by anyone. That
separation is the argument the rest of this repository makes, and the roll call is
built to respect it.
