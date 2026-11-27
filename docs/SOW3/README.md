# SOW 3 — evidence of completion

Evidence for the three deliverables of the third Instawards SOW (Stellar Türkiye
chapter). One page each, written against **§6.1**.

**This engagement is the one where the money becomes real.** The first two ran
entirely on Testnet, where a deposit is free and losing it costs nothing — so the
central claim, that a deposit changes who turns up *because it is money*, had
never actually been tested. Showup has been on Stellar **Mainnet** since
27.11.2026.

| | Deliverable | Evidence | State |
| :-- | :-- | :-- | :-- |
| 1 | A deposit nobody can strand | [deliverable-1.md](deliverable-1.md) | complete |
| 2 | Audit readiness, and keys no one person holds | [deliverable-2.md](deliverable-2.md) | complete |
| 3 | Mainnet, and the product around real money | [deliverable-3.md](deliverable-3.md) | deployed; the real run is scheduled |

Also here:

- **[security.md](security.md)** — the full static-analysis report: 73 findings,
  twelve fixed including every critical one, and a written decision on each of the
  remaining 61.
- **[interview-script.md](interview-script.md)** — the Customer Development Plan's
  fixed organiser-interview script, published **before** the interviews so the
  questions cannot be reverse-engineered from the answers we liked.

Live app: **[showup.click](https://showup.click)** (Mainnet — real XLM) and
**[testnet.showup.click](https://testnet.showup.click)** (Testnet — free XLM, and
where to start). The full technical record is in the [README](../../README.md) and
[deployments.md](../deployments.md).

**Nothing in the first two engagements has been invalidated.** Every Testnet
address they publish is still the address, and the Mainnet contracts are the *same
binaries* — the event wasm hash on Mainnet is byte-identical to the one that has
been running on Testnet since the second engagement. Earlier evidence is in
[SOW1](../SOW1/README.md) and [SOW2](../SOW2/README.md).

---

## What a reviewer can check without a wallet, an account, or our permission

Every claim in these pages is backed by something on a public ledger. None of the
commands below need a key, a funded account, or anything installed except the
[Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli).

**The Mainnet contracts exist and are wired to each other:**

```bash
stellar contract invoke --id CCJLDI57GNYKSMP75QTPLUYGJV6VXN2LBT2SEYWVDRLJSBMWWS6E5ZVJ \
  --network mainnet --source-account <any address> -- get_reputation
# "CBFOLND667UO3XLHCSBYHGZ4KE45F5BBFTX425I3PPTBVUJJ2SISWS6M"
```

**The admin is an account, not a person's key** — its signers and thresholds are
public ledger state, so this is checkable rather than assertable:
[`GCHKQ5BI…RPYV2NOG`](https://stellar.expert/explorer/public/account/GCHKQ5BIFT55QZMZFW5OMXN2MNWQP3GUFJWNHYV2PUEPOYI6RPYV2NOG)
— three signers, and **low, medium and high thresholds all 2**.

**The same code runs on both networks.** The event wasm hash published for Mainnet
and for Testnet is the same 64 hex characters, and CI asks each network's own
factory what it actually deploys on every push.

---

## A note on what is not finished

The real Mainnet event with real attendees is **scheduled, not run**. This page
says so rather than describing it in advance, and
[deliverable-3.md](deliverable-3.md) marks the two items that depend on it.

Two commitments carried from the previous Customer Development Plan are also still
open — the organiser interviews and the formal proposal to the chapter. The
interview script is published; the conversations have not happened. A plan that
reports only its completed items is not a plan anybody can learn from.
