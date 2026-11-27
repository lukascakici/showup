# Deliverable 3 — evidence

**Mainnet, and the product around real money.** Showup has been on Stellar
Mainnet since 27.11.2026. The deposits there are real XLM, and the whole point of
this engagement is that losing one would actually cost somebody something.

> **SOW §6.1:** Mainnet addresses for all three contracts, re-checked by CI from
> the chain; the complete transaction record of one real event, ending in a
> deposit back in a real wallet; screenshots; and the demo video.

---

## The contracts

| What | Address |
| :-- | :-- |
| **Event factory** | [`CCJLDI57GNYKSMP75QTPLUYGJV6VXN2LBT2SEYWVDRLJSBMWWS6E5ZVJ`](https://stellar.expert/explorer/public/contract/CCJLDI57GNYKSMP75QTPLUYGJV6VXN2LBT2SEYWVDRLJSBMWWS6E5ZVJ) |
| **Reputation ledger** | [`CBFOLND667UO3XLHCSBYHGZ4KE45F5BBFTX425I3PPTBVUJJ2SISWS6M`](https://stellar.expert/explorer/public/contract/CBFOLND667UO3XLHCSBYHGZ4KE45F5BBFTX425I3PPTBVUJJ2SISWS6M) |
| **Event wasm hash** | `5f5e0ec548c2142f6c64427c666ecef71bfa31589f43cd3e02d82659db7d5d03` |

**That hash is the Testnet hash.** The same three binaries, byte for byte — what
has been analysed, audited and run through two engagements is what now holds real
money. Nothing was rebuilt for Mainnet and nothing needed to be.

CI asks **each network's own factory** what it actually deploys, on every push.
Both tables verify themselves; a mismatch on either fails the build.

Every transaction of the deployment — ten of them, plus what each cost — is in
[deployments.md](../deployments.md#mainnet--the-deployment-and-what-it-actually-cost-27112026).

### The path works on Mainnet, not just on Testnet

Before handing the keys over, one event was created from our own wallet and
finalized immediately:

| Step | Transaction |
| :-- | :-- |
| `create_event` | [`8eede647…`](https://stellar.expert/explorer/public/tx/8eede6472aaa0d43ae35f89e9eac895fe87c4b4e58e09ef7447432ee713368e7) |
| `finalize` | [`fca49e8a…`](https://stellar.expert/explorer/public/tx/fca49e8a32975ab9e9ca78af38e9b8a484477bc56e1414f375ed73399d74ea90) |

The event settled to `Finalized` and the reputation ledger recorded
`events_organised: 1` for the organizer **in the same transaction**. So the
factory gate, the settlement and the atomic reputation write are all proven on
Mainnet rather than assumed from Testnet.

It was also run for a practical reason that turned out not to apply. On Testnet,
the first event created from a freshly uploaded wasm costs 36–106 XLM against a
median of about 0.5 — a bill that on Mainnet would land on a real organiser for
nothing they did. It cost **0.22 XLM** here, because Mainnet charges the code
entry's rent at *upload* time instead. There was no way to know that in advance,
and the alternative was letting the first organiser find out.

---

## Two networks, one build

| | `showup.click` | `testnet.showup.click` |
| :-- | :-- | :-- |
| Network | **Mainnet** | Testnet |
| The deposit | **Real XLM** | Free, and worth nothing anywhere |
| Faucet | None, and the UI never offers one | Friendbot |
| Before you reserve | A confirmation step naming the amount | One tap |

**Mainnet is an allowlist of exactly one hostname.** Everything else — the
Testnet subdomain, a preview deployment, localhost, a hostname somebody typed
wrong — resolves to Testnet. The asymmetry is the design: the worst outcome of a
misconfiguration becomes *"this showed Testnet when it should have shown
Mainnet"*, which is visible and harmless, instead of *"this looked like Testnet
and moved real money"*, which is neither.

A network also is not *live* until it has both contracts **and** somewhere to ask
about them, so a deployment missing its Mainnet RPC serves Testnet rather than
offering a network whose every read would fail.

![The Showup home page on Mainnet](../screenshots/sow3/mainnet/lead-desktop.png)

---

## The real-money confirmation

On Testnet a full-width button is the right control: the deposit is faucet XLM
and the only cost of a misclick is a second one to undo it. On Mainnet the same
gesture moves somebody's money, so it buys a step that **names the amount instead
of performing it** — before the wallet asks for a signature, at which point the
question has already been reframed in the wallet's words as a transaction rather
than as a deposit.

The two are deliberately asymmetric. A confirmation on both would train people to
click through the one that matters.

The same rule governs the copy. The sentence *"it isn't real money"* and the
sentence *"this is real XLM"* are written as two separate blocks rather than one
template with the network interpolated — a template that can produce the
reassuring version on Mainnet by getting a flag wrong eventually will. Tests
assert the **absence** of the words "faucet", "test network" and "worth nothing
anywhere" on Mainnet, because the dangerous failure is not a missing warning but
a reassurance that survived.

---

## An event in its organizer's own words

A contract knows a deposit, a capacity and a start time. It does not know where
the door is or what to bring. Hosts can now write that down — stored off-chain,
but with **who may write it read from the chain**: the route loads the event and
checks the wallet against the contract's own `hosts` list before accepting a
word, and does so *before* spending the signature, so an RPC failure costs a
retry rather than another trip to the wallet.

![An event page with its host's own description above the deposit panel](../screenshots/sow3/event-open-desktop.png)

---

## Not finished

Two items on this page depend on an event that has not happened yet, and are
marked rather than described in advance:

- [ ] **A real Mainnet event with real attendees**, run to settlement, with every
      transaction hash recorded. Scheduled for 02–04.12.2026.
- [ ] **The demo video** of that run.

The tooling is ready for it:
[`web/scripts/collect-evidence.mjs`](../../web/scripts/collect-evidence.mjs) reads
every `reserved`, `checked_in`, `phase_changed` and `finalized` event straight off
the chain and prints the evidence table as markdown, on either network. **None of
the tables in these pages were typed by hand**, and the script disagrees with them
if anyone edits a hash.
