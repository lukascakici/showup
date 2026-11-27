# SOW 1 — evidence of completion

Evidence for the three deliverables of the first Instawards SOW (30 days, sprint
start 30.07.2026, Stellar Türkiye chapter). One page each, written against
**§6.1**. Everything is on Stellar **Testnet** — no real money is involved.

> **If a link on these pages does not open, Testnet has been reset.** Stellar
> wipes it periodically, and every hash and address below stops resolving when
> it does. They are archived in
> **[docs/archive/testnet-transactions.json](../archive/testnet-transactions.json)**
> as signed envelope XDR, so **every hash here can be recomputed from that file
> with no network at all** — `node scripts/archive-testnet-evidence.mjs --verify`.
> Nothing about this evidence depends on the explorer still being able to show
> it to you.

| | Deliverable | Evidence | State |
| :-- | :-- | :-- | :-- |
| 1 | Deployed multi-wallet dApp, with CI | [deliverable-1.md](deliverable-1.md) | complete |
| 2 | On-chain `reputation` contract | [deliverable-2.md](deliverable-2.md) | complete |
| 3 | One real event, 10+ attendees, demo video | [deliverable-3.md](deliverable-3.md) | complete |

Live app: **[showup.click](https://showup.click)**. Demo video:
**[youtu.be/QaT61imDXkk](https://youtu.be/QaT61imDXkk)** — the whole flow, create
to reclaim. The full technical record is in the [README](../../README.md) and
[deployments.md](../deployments.md).
