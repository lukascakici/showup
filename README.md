# Showup

**Put a refundable deposit on showing up.** Showup turns event RSVPs into
on-chain deposits on [Stellar](https://stellar.org): reserve your spot with a
small deposit, check in at the event, and reclaim it. No-shows forfeit — so the
people who actually show up are the ones who get rewarded.

It's the anti-flake primitive for meetups, study groups, game nights, and calls —
a "skin in the game" layer that a group chat can never enforce.

> **Network:** Stellar **Testnet** only. No real funds are used.

[![CI](https://github.com/lukascakici/showup/actions/workflows/ci.yml/badge.svg)](https://github.com/lukascakici/showup/actions/workflows/ci.yml)

- **Live demo:** **[showup.click](https://showup.click)**
- **Demo video:** _coming with the real event run_

<p align="center">
  <img src="docs/screenshots/home.png" alt="Showup landing page" width="720" />
</p>

---

## Deployed contracts (Testnet)

| What | Address |
| :-- | :-- |
| **Event factory** | [`CAI5RQZFS46KK2MWOBW7EEM3DJWJN6JSE5LW5JRJ6RCIJMTHCA7JD3CW`](https://stellar.expert/explorer/testnet/contract/CAI5RQZFS46KK2MWOBW7EEM3DJWJN6JSE5LW5JRJ6RCIJMTHCA7JD3CW) |
| **Event wasm hash** | `aef70ac35e540a1e5b48277c7c740277f91334f6defbf7dca47ca07f6fd8171d` |
| **Native XLM SAC** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |

The factory holds the event wasm hash and deploys a fresh event contract per
organizer, so the frontend only ever has to know one address. Full deployment
record — including a complete event run end to end, with every phase-machine
rejection — is in **[docs/deployments.md](docs/deployments.md)**.

---

## Wallets, balances and payments

The layer underneath the contracts: connect any of four Stellar wallets, see a
balance, top it up from a faucet, and move a deposit with full transaction feedback.

**Features**

- **Four wallets** — Freighter, xBull, Albedo and Hana via
  [StellarWalletsKit](https://github.com/Creit-Tech/Stellar-Wallets-Kit), behind a
  flat picker of our own rather than the kit's modal, with silent reconnect.
- **Balance** fetched from Horizon and shown in a wallet menu, with copy-address
  and Stellar Explorer links.
- **Built-in faucet** — fund a new account with 10,000 test XLM via Friendbot,
  with honest "already funded" messaging.
- **Send XLM** to any address with client-side validation, wallet signing, and a
  **transaction hash + Explorer link** on success.
- **Robust error handling** — wallet not installed, request rejected, pop-up
  blocked, wrong network, underfunded, non-existent destination, stale-sequence
  retries and every contract error code, all mapped to plain-language copy. Each
  wallet reports failure differently and none of them throw an `Error`, so the
  mapping is written against the shipped source of all four.
- **Uber-like UI** — flat dark theme, a single warm-amber accent, a floating
  liquid-glass navbar, and a subtle pointer-driven grid trail.

**Screenshots**

| Wallet connected | Balance + faucet |
| :--: | :--: |
| ![Connected wallet on the home screen](docs/screenshots/connected.png) | ![Wallet menu showing XLM balance and faucet](docs/screenshots/balance.png) |

| Successful transaction |
| :--: |
| ![Successful payment with transaction hash and Explorer link](docs/screenshots/transaction.png) |

---

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router) + **TypeScript**
- **[Tailwind CSS v4](https://tailwindcss.com)** (class-based dark mode)
- **[@stellar/stellar-sdk](https://github.com/stellar/js-stellar-sdk)** — Horizon
  queries, transaction building & submission
- **[StellarWalletsKit](https://github.com/Creit-Tech/Stellar-Wallets-Kit)** — wallet
  connection & signing across Freighter, xBull, Albedo and Hana
- **[Vitest](https://vitest.dev)** + jsdom — frontend unit tests
- **[lucide-react](https://lucide.dev)** — line icons
- Deployed on **[Vercel](https://vercel.com)** (Root Directory = `web`)

---

## Getting started

### Prerequisites

- **Node.js 24** and npm (pinned in `web/package.json`, matching CI and Vercel)
- A Stellar wallet on the **Test SDF Network / Testnet**. Any of
  **[Freighter](https://www.freighter.app)**, **[xBull](https://xbull.app)**,
  **[Albedo](https://albedo.link)** or **[Hana](https://hanawallet.io)** — xBull and
  Albedo need nothing installed, they open in a pop-up.

### Run locally

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. **Connect wallet** (top right) — pick a wallet and approve the connection.
2. Open the wallet menu and hit **Request test XLM** if your account is new.
3. Go to **Send**, enter a destination and amount, and **Send payment**.
4. Copy the **transaction hash** or open it on **Stellar Explorer** to verify.

---

## How a payment works

```
Wallet ──connect──▶ Showup ──loadAccount──▶ Horizon (Testnet)
    │                  │
    │                  └──friendbot?──▶ fund new account (10,000 XLM)
    │
    └──sign payment XDR──▶ Showup ──submitTransaction──▶ Horizon ──▶ tx hash
```

Payments are built with `TransactionBuilder`, signed in the connected wallet, and
submitted to Horizon. The returned hash links straight to Stellar Explorer.

---

## Roadmap

Showup is being built as a 30-day [Instawards](https://stellar.org) engagement with
the Stellar Türkiye chapter, in four weeks. This README grows with it — nothing that
shipped ever disappears from the record.

- [x] **Week 1** · four wallets via StellarWalletsKit, every failure mode in plain
      language, public deployment, GitHub Actions CI on every push
- [ ] **Week 2** · on-chain `reputation` contract — a factory-gated show-up score,
      raised on check-in and lowered on a finalised no-show
- [ ] **Week 3** · product pass: event list and detail, organizer check-in link/QR,
      mobile over every screen, honest empty/loading/error states, docs
- [ ] **Week 4** · one real event with 10+ real attendees, every transaction hash
      recorded, and a demo video of the full flow

---

## License

MIT
