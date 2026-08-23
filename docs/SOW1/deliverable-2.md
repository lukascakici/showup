# Deliverable 2 — evidence

An on-chain `reputation` contract: a show-up score, factory-gated.

> **SOW §6.1:** the contract's address on Stellar Expert, a transaction hash for
> a check-in that raised a score and a finalise that lowered a no-show's, with
> the resulting score readable from the contract.

## The contract

[`CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ`](https://stellar.expert/explorer/testnet/contract/CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ)

## The two transactions

| | Transaction |
| :-- | :-- |
| **Check-in — the score rises**<br>10.1 XLM refund **and** `score_changed { shows: 1 }`, in the same transaction | [`c76cd351f2645c2aec78f1e7b9687ada167790fbb9d8151af9a9dae0cefd9357`](https://stellar.expert/explorer/testnet/tx/c76cd351f2645c2aec78f1e7b9687ada167790fbb9d8151af9a9dae0cefd9357) |
| **Finalise — the score falls**<br>the no-show's deposit settles **and** `score_changed { no_shows: 1 }` | [`5d394178e5a9d58933ffa58b93ed1ce853c39ff3749f307c8b615e638f7019dc`](https://stellar.expert/explorer/testnet/tx/5d394178e5a9d58933ffa58b93ed1ce853c39ff3749f307c8b615e638f7019dc) |

The money and the score move in one transaction, so nobody has to be asked to
trust that a second transaction belongs to the first.

## The scores, read back from the contract afterwards

| Address | Score | |
| :-- | :-- | :-- |
| [`GA5TJJJCL2VXRFJPEQW42Q5GC7NOXWIXZRGOI77TEOW42OTW6KEVNGEO`](https://stellar.expert/explorer/testnet/account/GA5TJJJCL2VXRFJPEQW42Q5GC7NOXWIXZRGOI77TEOW42OTW6KEVNGEO) | `{ shows: 1, no_shows: 0 }` | showed up |
| [`GB2QLDW2Y6ETGK5Z7AO2XSYWNN6KZNC3ZQNJMVVUJWZBUG5C3Y2ZVOST`](https://stellar.expert/explorer/testnet/account/GB2QLDW2Y6ETGK5Z7AO2XSYWNN6KZNC3ZQNJMVVUJWZBUG5C3Y2ZVOST) | `{ shows: 0, no_shows: 1 }` | skipped |
| [`GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW`](https://stellar.expert/explorer/testnet/account/GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW) | `{ shows: 1, no_shows: 1 }` | accumulated across two events |

Anyone can re-read them; no key needed:

```bash
stellar contract invoke --network testnet \
  --id CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ \
  -- get_score --member <G…address>
```

## The gate, refused on-chain

`record_checkin` from an unregistered address is rejected with
`Error(Contract, #3)`; `set_factory` from a non-admin is rejected before
submission. The app itself has no code path that writes a score.

Detail: [README](../../README.md#deliverable-2--the-on-chain-reputation-contract)
· [deployments.md](../deployments.md#deliverable-2-evidence--a-score-rises-and-falls)
