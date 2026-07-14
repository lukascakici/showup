# Deployments — Stellar Testnet

Everything below is live on the **Test SDF Network ; September 2015** and
verifiable on [Stellar Expert](https://stellar.expert/explorer/testnet). No real
funds are involved.

## Contracts

| What | Value |
| :-- | :-- |
| Event factory | [`CAI5RQZFS46KK2MWOBW7EEM3DJWJN6JSE5LW5JRJ6RCIJMTHCA7JD3CW`](https://stellar.expert/explorer/testnet/contract/CAI5RQZFS46KK2MWOBW7EEM3DJWJN6JSE5LW5JRJ6RCIJMTHCA7JD3CW) |
| Event wasm hash | `aef70ac35e540a1e5b48277c7c740277f91334f6defbf7dca47ca07f6fd8171d` |
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Deployer / factory admin | `GDL3H646S6HGGJTH2BBNCBDONJDN5E7L56ZRFWGCOSPXEDHOJLZOZKI5` |

The factory holds the event wasm hash and deploys a fresh event contract per
organizer, so there is exactly one address the frontend has to know.

## A full event, end to end

One event run start to finish on Testnet: 10 XLM deposit, capacity 5, a 0.1 XLM
fee allowance per guest, forfeits set to split among attendees.

Event contract: [`CB4HHNLD…KXLN66ZIW`](https://stellar.expert/explorer/testnet/contract/CB4HHNLDAR5FCX7CRSFGJTNGPALB4ZZQXXDYCCQMR4EFKBKEXLN66ZIW)

| Step | Result |
| :-- | :-- |
| `create_event` | event deployed and its fee pool funded in one transaction |
| `rsvp` | 10 XLM locked |
| `check_in` **before** check-in opened | rejected, `Error(Contract, #13)` — `CheckInNotOpen` |
| `open_checkin` | `PhaseChanged { phase: CheckingIn }` |
| `rsvp` **after** check-in opened | rejected, `Error(Contract, #12)` — `ReservationsClosed` |
| `check_in` with the wrong secret | rejected, `Error(Contract, #10)` — `WrongCode` |
| `check_in` with the right secret | 10.1 XLM returned |
| `finalize` | no-shows settled, unspent fee pool returned |

**The guest opened with 10,000 XLM and closed with 10,000.19 XLM.** They got the
deposit back and the 0.1 XLM allowance more than covered the fees they spent —
which is the point of the organizer funding the pool upfront: showing up must
never cost the guest money.

The two rejections in bold are the phase machine doing its job. Without it,
someone forwarded the check-in link could reserve and check in on the spot
without ever attending, pocketing the fee allowance and taking a cut of the
no-shows' forfeited deposits.

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
