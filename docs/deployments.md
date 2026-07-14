# Deployments — Stellar Testnet

Everything below is live on the **Test SDF Network ; September 2015** and
verifiable on [Stellar Expert](https://stellar.expert/explorer/testnet). No real
funds are involved.

## Contracts

| What | Value |
| :-- | :-- |
| Event factory | [`CAC7FV5HAUS6HZ62AGA5GV3Q23FY2DLVBNUEHHX5KVIYKT3ALY6FV2FC`](https://stellar.expert/explorer/testnet/contract/CAC7FV5HAUS6HZ62AGA5GV3Q23FY2DLVBNUEHHX5KVIYKT3ALY6FV2FC) |
| Event wasm hash | `1c68e7f8b6422f3fdc52de79bf8772168e555b1d5522f0bf685558209bbcf7ae` |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Deployer / factory admin | `GDL3H646S6HGGJTH2BBNCBDONJDN5E7L56ZRFWGCOSPXEDHOJLZOZKI5` |

The factory holds the event wasm hash and deploys a fresh event contract per
organizer, so there is exactly one address the frontend has to know.

## A full event, end to end

One event run start to finish on Testnet: 10 XLM deposit, capacity 5, a 0.1 XLM
fee allowance per guest, forfeits set to split among attendees.

| Step | Transaction |
| :-- | :-- |
| `initialize` the factory | [`7a3863c0…f3c99a9e`](https://stellar.expert/explorer/testnet/tx/7a3863c0c0da0dc49c925b7e40f41959987433e0c9e938a215d09d77f3c99a9e) |
| `create_event` → [`CDA2TG3C…UILZFF3T`](https://stellar.expert/explorer/testnet/contract/CDA2TG3CSZ4KQIPOYKQVJBRZKYJ275YHJAIG25ZBCXQ2W7UTUILZFF3T) | [`9ffb742d…0816fb10`](https://stellar.expert/explorer/testnet/tx/9ffb742d0ebc4f7ebd231694f3930345b5ecebc31716ac1f610fed0b0816fb10) |
| `rsvp` — 10 XLM locked | [`214d202b…636d0b1b`](https://stellar.expert/explorer/testnet/tx/214d202bccedbddcc7b620383703fb30a4874a94514ce18714a57ab8636d0b1b) |
| `check_in` — 10.1 XLM returned | [`4d13f997…1f36aa9b`](https://stellar.expert/explorer/testnet/tx/4d13f997f5688c70ef2331b6f37c665a60085472fbc5f0b2d54dfb751f36aa9b) |
| `finalize` — 0.4 XLM unspent pool returned | [`5b681146…13e3867f`](https://stellar.expert/explorer/testnet/tx/5b681146549f2d67f748c229ddd0eb71cf68780963c01acb4142eb9713e3867f) |

**The guest opened with 10,000 XLM and closed with 10,000.0926 XLM.** They got
the deposit back and the 0.1 XLM allowance more than covered the ~0.0074 XLM of
fees they spent across `rsvp` and `check_in` — which is the whole point of the
organizer funding the pool upfront: showing up must never cost the guest money.

Checking in with the wrong secret was rejected with `Error(Contract, #10)` —
`WrongCode` — before any transfer happened.

## Reproducing

```bash
stellar contract build

stellar contract upload  --source <key> --network testnet \
  --wasm target/wasm32v1-none/release/event.wasm          # -> event wasm hash
stellar contract deploy  --source <key> --network testnet \
  --wasm target/wasm32v1-none/release/factory.wasm        # -> factory address

stellar contract invoke --id <factory> --source <key> --network testnet -- \
  initialize --admin <key address> --event_wasm_hash <event wasm hash>
```

The check-in secret is never stored on-chain — only its sha256. Pass the secret
to `check_in` as hex:

```bash
printf 'your-secret' | shasum -a 256   # code_hash, given at create_event
printf 'your-secret' | xxd -p          # secret, given at check_in
```
