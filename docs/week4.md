# Week 4 run sheet — the real event

Deliverable 3 is the one that cannot be retried. Ten or more real people, each
holding a wallet they installed themselves, each locking a real Testnet deposit
and checking in on their own phone. Every other deliverable can be fixed by
pushing a commit; this one happens once, in front of people whose evening it is.

So the design is written down here, in week 3, and week 4 is execution.

Everything below fills in [Deliverable 3's evidence
checklist](../README.md#deliverable-3--one-real-event-10-real-attendees-a-demo-video),
which is itself SOW §6.1 for D3.

---

## 1. Before the invitation goes out

The invitation is the thing with lead time. Announcing two days before the event
is how ten attendees becomes four.

- [ ] **Pick the date and place**, with a real reason for people to come. The
      deposit mechanic is only interesting if the event is something they wanted
      to do anyway.
- [ ] **Create the event on [showup.click](https://showup.click)** from the
      organizer wallet, with:
      - **deposit `5` XLM** — large enough to feel like a commitment, small
        enough that nobody hesitates over faucet money
      - **capacity `20`** for a target of 10–14. Over-sizing is close to free:
        `finalize` returns `fee_allowance × (capacity − showed)` to the
        organizer, so the unspent fee pool comes back
      - **forfeit policy: split among attendees** — it is the more interesting
        half of the demo, and the one the README leads with
- [ ] **Save the check-in link somewhere that is not the group chat.** It is
      generated once, the chain only ever stored its sha256, and nobody —
      including us — can recover it. The create screen shows it once.
- [ ] **Open the invite link in a chat app and look at the preview.** It should
      show the event's name, the deposit and the spots left. If it shows a bare
      URL, something regressed; see §6.
- [ ] **Send the invitation** (§2), at least five days out.
- [ ] **Reserve one spot yourself from a second wallet.** An event showing
      `0 / 20 reserved` reads as abandoned to the second person who opens it.

## 2. The invitation

It goes to a group chat, so it has to survive being skimmed. Three things must
land: it costs nothing real, it takes five minutes, and there is a deadline.

> **Perşembe halı saha — bu sefer kimse ekmiyor**
>
> Bir şey deniyorum: yerini ayırtmak için 5 XLM "depozito" bırakıyorsun,
> geldiğinde geri alıyorsun. Ekersen depozito gelenlere bölünüyor.
>
> **Gerçek para değil.** Stellar'ın test ağı — oradaki XLM alınıp satılamıyor,
> musluktan bedava alıyorsun. Tek maliyeti beş dakika.
>
> Nasıl: linki aç → "Connect a wallet" → listeden birini seç (biri hiçbir şey
> kurmadan çalışıyor) → musluk butonuyla test parası al → "Reserve your spot".
>
> Takılırsan yaz, hallederiz.
>
> showup.click/e/&lt;adres&gt;
>
> Yerler sınırlı, **&lt;tarih&gt;**'e kadar ayırtın.

Send the **invite link**. Never the check-in link.

## 3. On the day — run of show

| When | What | Who |
| --- | --- | --- |
| T−2 days | Nudge whoever has not reserved. Reservations after check-in opens need `reopen_rsvp`. | organizer |
| T−1 hour | Check the event page: reserved count, phase still *Taking reservations*. | organizer |
| T+0 | People arrive. **Do not open check-in until enough of them are in the room** — reservations close when it opens. | organizer |
| T+15 | **Open check-in.** Then share the check-in link or read the code out. | organizer |
| T+15…T+45 | Everyone checks in from their own phone and watches 5.1 XLM come back. | attendees |
| T+45 | Latecomer? **Reopen reservations**, let them reserve, open check-in again. | organizer |
| T+60 | **Finalize.** No-shows' deposits split among the people who showed. | organizer |
| after | Screenshot the finalized page and the activity feed. Collect hashes (§4). | organizer |

Two rules that are easy to get wrong under pressure:

1. **Opening check-in closes the door.** Anyone still walking over is locked out
   until you reopen. Wait longer than feels comfortable.
2. **Finalize once.** It is irreversible and the contract rejects a second call.
   Do it only when nobody else is checking in.

## 4. What to record — the D3 evidence table

Fill this in as it happens, not afterwards. Every hash is on the event page's
activity feed, which reads the contract's own events off-chain-index-free, and
each links straight to Stellar Expert.

**Event**

| | |
| --- | --- |
| Event contract | `C…` |
| `create_event` tx | `…` |
| `open_checkin` tx | `…` |
| `finalize` tx | `…` |
| Reserved / showed | `… / …` |

**Attendees** — SOW §6.1 wants 10+ rows, each with both hashes.

| # | Wallet address | `rsvp` tx | `check_in` tx | Showed |
| --- | --- | --- | --- | --- |
| 1 | `G…` | `…` | `…` | yes |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |
| 11 | | | | |
| 12 | | | | |

At least one deliberate no-show is worth having: the forfeit split and the
reputation ledger's `no_shows` counter are both invisible without one, and they
are half of what D2 exists to prove.

**Screenshots** to take on the night, into `docs/screenshots/`:

- the event page mid-reservation, on a phone, spots visibly filling
- a guest's own check-in, the moment the deposit comes back
- the finalized event with the activity feed showing the whole run
- the room — it is the only evidence that these were real people

## 5. The demo video

SOW §6.2 says the reviewer has minimal technical expertise. So it is a
walkthrough, not a code tour: no terminal, no IDE, nothing explained in terms of
Soroban. Screen recording of a phone plus a short piece of real footage from the
event. Target **3–4 minutes**.

| # | Shot | Says |
| --- | --- | --- |
| 1 | The problem, over footage of the event | "Ten people say yes. Six turn up. Nobody meant any harm." — 15s |
| 2 | Create the event on showup.click | Name, deposit, capacity. "The deposit is the whole idea." — 30s |
| 3 | The invite link pasted into a chat, preview visible | "This is what people get sent." — 10s |
| 4 | A guest opens it with no wallet installed | Wallet picker, faucet, reserve. Real time, no cuts. — 60s |
| 5 | Stellar Expert on the `rsvp` hash | "The money is in a contract, not with me." — 20s |
| 6 | Event night: check-in on a phone | Deposit comes back, +0.1 XLM. — 30s |
| 7 | Finalize | No-show's deposit splits among the people who showed. — 30s |
| 8 | The reputation contract's score for one address | "And it remembers." — 20s |
| 9 | Close on the finalized event page | Address on screen, openable by anyone. — 15s |

Record shot 4 with someone who has genuinely never seen it. Whatever they get
stuck on is the most valuable finding of week 4, video or not.

## 6. If something goes wrong

| Symptom | Do this |
| --- | --- |
| A guest's wallet is on Mainnet | The banner tells them; they switch and press "I switched — check again". |
| A guest has no XLM | The faucet button in the wallet menu. It **creates** an account — for one that exists but is empty, it will not top it up. |
| "Transaction failed" with no detail | Almost always sequence lag. Wait, retry once. The app already retries on a bad sequence. |
| Nobody can reserve | Check the phase. If check-in was opened early, `reopen_rsvp` from the organizer wallet. |
| The invite preview shows a bare URL | The chat app cached it before the fix. Add `?x=1` to the link to bust it. |
| Check-in link lost | Unrecoverable by design. Finalize on the reserved list and note the honest reason. |
| Fewer than 10 people | Do not fake rows. Run it, record what happened, and say so. A short honest table beats a long invented one. |
