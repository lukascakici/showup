# Organiser interview — the fixed script

The Customer Development Plan commits to **one fixed script**, used unchanged in
every conversation. This is it. It is published before the interviews rather than
after, so that the questions cannot be reverse-engineered from the answers we
liked.

**Why fixed.** Four interviews with four different sets of questions produce four
anecdotes. The same questions asked four times produce a comparison, and a
comparison is the only thing that can move a hypothesis. Wording may be adapted to
how a person speaks; the questions, their order, and what each one is for may not.

**Who.** Three groups, chosen so one of them can disagree with the other two:

| Group | Why them |
| :-- | :-- |
| Stellar Türkiye chapter organisers | The people who would run the first real event |
| University blockchain club leads | Organisers with no budget and high no-show rates |
| **Organisers outside crypto entirely** | The deliberate control on **H3**. If a wallet is a fatal barrier, this is the group that says so, and nobody inside a crypto community ever will |

**What it is for.** Each section reads one assumption from §4.1 of the CDP. They
are listed against each block below so that an interview which drifts can be seen
to have drifted.

**Published as they happen, including the ones that end in a no.** A plan that only
publishes encouraging conversations is a plan that has learned nothing.

---

## Before the questions: the walkthrough (5 min)

Opened with a walkthrough aimed at **a buyer deciding whether to run their own
event**, not at a reviewer checking whether the software works. Show, in this
order, on the live site:

1. Creating an event — the deposit, the capacity, the forfeit policy.
2. What a guest sees on the invite link.
3. Check-in, and the deposit coming straight back.
4. What happens to a no-show's deposit.

Then stop talking. The first thing they ask about is data.

---

## 1. How they run events today (H1, H6)

No mention of Showup in this section. What they do now is the baseline, and it is
contaminated the moment the product is in the question.

1. Son düzenlediğin etkinliği anlat. Kaç kişi kaydoldu, kaç kişi geldi?
2. Gelmeyenleri nasıl öğrendin? Saymak zorunda kaldın mı, yoksa tahmin mi?
3. Bir kişinin gelmemesi sana ne kaybettirdi? *(Boş sandalye, yemek, salon
   ücreti, sponsora verilen söz — hangisi?)*
4. Şu anda no-show'u azaltmak için bir şey yapıyor musun?
5. Geçen seferki katılımcıların kim olduğunu bugün bilebiliyor musun?

**Listen for:** whether the cost of a no-show is named in money or in feeling. H1
is only interesting where it is money.

---

## 2. The deposit, as a decision they would make (H2, H8)

6. Bu bir etkinliğinde işe yarar mıydı — yoksa senin topluluğun için yanlış bir
   araç mı?
7. **Kendi cüzdanından** bir etkinlik açmaya razı olur muydun? Olmazsan, neyi
   görmen gerekirdi?
8. **Kişi başı ne kadar depozito isterdin?** Rakam söyle.
9. O rakamı nereden buldun — neye göre?
10. Yarı yarıya düşürsen ne değişirdi? İki katına çıkarsan?
11. Depozito miktarını hiç değiştirmeyeceğin bir dünya var mı — bir kere ayarlayıp
    bir daha dokunmayacağın?

**Question 11 is the one that can kill H8.** If an organiser says they would set it
once and never touch it, the deposit is a switch rather than a lever, and a large
part of the settings surface this product has is not earning its place. Ask it
even when the previous answers have been enthusiastic — *especially* then.

**Question 7 is the whole of H2.** An organiser who will not create the event
themselves is telling us the customer is somebody else.

---

## 3. The guest's side (H9, H3, H7)

12. Senin etkinliğin için biri gerçek parasını kilitler miydi? Kim kilitlemez?
13. Katılımcı kararını verirken neye bakar sence — etkinliğe mi, **seni tanıyor
    olmasına mı**?
14. Seni tanımayan birine bu nasıl görünür?
15. Kaç katılımcının cüzdanı var? Olmayan ne yapar?
16. *(Kripto dışı gruplar için, sormadan geçme)* Cüzdan kurmak zorunda olmak tek
    başına bu fikri bitirir mi?

**Question 16 is the control.** It is the one question this whole third group
exists to answer, and it must be asked plainly rather than softened.

---

## 4. The close

17. Bunu bir sonraki etkinliğinde denemek ister misin? *(Hayır ise: neyin değişmesi
    gerekirdi?)*
18. Soracağım ama sormadığım ne vardı?

A no here is a finding and gets written up with the same care as a yes. Question 18
has produced more than any question written in advance, which is an argument for
asking it rather than for writing better questions.

---

## Writing it up

One file per conversation, in `docs/SOW3/interviews/`, named
`<group>-<n>.md` — no names unless the person asks to be named.

Each write-up carries, in this order:

- **Date, group, and how long it took.**
- **The answers**, against the question numbers above, so four interviews can be
  read down a column.
- **What moved.** Which hypothesis this conversation pushed on, and in which
  direction. "Nothing moved" is a legitimate and common answer.
- **What it contradicted.** The most valuable line in the file, and the one most
  easily left out. If an answer disagreed with something this project believes,
  write the disagreement down before the explanation of it.

The deposit figures from question 8 go in one table across all interviews. That
table is the direct read on H8 that no Testnet run could produce, and it is the
number the first Mainnet event's deposit should be chosen from.
