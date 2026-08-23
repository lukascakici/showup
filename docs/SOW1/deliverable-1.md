# Deliverable 1 — evidence

A publicly deployed, production-ready Showup dApp on Stellar Testnet, with CI.

> **SOW §6.1:** the public URL, the repo with CI passing, a screenshot of the
> wallet-selection dialog, and a screenshot of a completed transaction with its
> hash and Explorer link.

| Evidence | |
| :-- | :-- |
| Live app | **https://showup.click** — press *Connect a wallet*; Albedo needs no install |
| Repository | **https://github.com/lukascakici/showup** — CI green on every push |
| Wallets | Freighter, xBull, Albedo, Hana, plus WalletConnect on phones |

CI runs 60 contract tests and 150 frontend tests, plus two checks that verify the
docs against the live chain.

## The wallet-selection dialog

![The wallet-selection dialog, showing every supported wallet](../screenshots/wallets.png)

## A completed transaction, with its hash and Explorer link

![An event page showing a completed transaction with its hash](../screenshots/event-created.png)

Both transactions below were signed in a browser wallet through the app itself,
which is what a screenshot on its own leaves open. Event
[`CCBELUML3QPYDXC7RSQUD3GPDCZ6P3DZYORTY6MCBRMIHFKLCDYA4G6X`](https://stellar.expert/explorer/testnet/contract/CCBELUML3QPYDXC7RSQUD3GPDCZ6P3DZYORTY6MCBRMIHFKLCDYA4G6X):

| Action | Transaction |
| :-- | :-- |
| `create_event` | [`ca6c547481a3704198f027157acba1bfd4f3b45f14210039daa06c97f5104ffe`](https://stellar.expert/explorer/testnet/tx/ca6c547481a3704198f027157acba1bfd4f3b45f14210039daa06c97f5104ffe) |
| `rsvp` | [`03d159194db4242e884c2b85d00fb4ea7c729e0b4684ec5e7e8ee35a416de3c8`](https://stellar.expert/explorer/testnet/tx/03d159194db4242e884c2b85d00fb4ea7c729e0b4684ec5e7e8ee35a416de3c8) |

## Deployed contracts

| What | Address |
| :-- | :-- |
| Event factory | [`CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE`](https://stellar.expert/explorer/testnet/contract/CD5AEMRB35FBZKO24562DRITAY337CMBXGF6HVSUDRKWHE4RKQLE7FCE) |
| Reputation ledger | [`CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ`](https://stellar.expert/explorer/testnet/contract/CDFGVEIJDNCTGN2F6VN47QFDWTGTKJMBNBEETAWGZ5RV7GDYPEOLA3DJ) |

Detail: [README](../../README.md#deliverable-1--a-deployed-multi-wallet-dapp-with-ci)
· [deployments.md](../deployments.md#deliverable-1-evidence--the-app-itself-moves-money)
