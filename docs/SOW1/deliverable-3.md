# Deliverable 3 — evidence

One real run through the live app, 23.08.2026.

> **SOW §6.1:** a document listing 10+ distinct attendee wallet addresses with
> their reserve and check-in transaction hashes, the finalised event contract
> address, and a 1-2 minute demo video.

**This page is that document.** Every address and hash is written in full so it
can be copied and checked, not just clicked.

| | |
| :-- | :-- |
| Reserved / checked in | **12 / 11**, one no-show |
| Deposit / returned on check-in | 5.00 XLM / **5.10 XLM** |
| The no-show's 5.00 XLM | split among the eleven who showed |
| Left in the contract | **0** |
| Demo video | *coming* |

## The event

| | |
| --- | --- |
| Event contract | [`CAOK5LMEBEFHYWXLD5D55U46E73FD5ZTTBBBMMQIBMLYXTZWEWMUTLJL`](https://stellar.expert/explorer/testnet/contract/CAOK5LMEBEFHYWXLD5D55U46E73FD5ZTTBBBMMQIBMLYXTZWEWMUTLJL) |
| Title | coffee time |
| Organizer | [`GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW`](https://stellar.expert/explorer/testnet/account/GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW) |
| `create_event` tx | [`740f54dce873103569473f19520a0392099d7cfe1afc9eb7717890f44d5cfc75`](https://stellar.expert/explorer/testnet/tx/740f54dce873103569473f19520a0392099d7cfe1afc9eb7717890f44d5cfc75) |
| → `CheckingIn` tx | [`dfed9632e7a48b09413c1eb715d4957a11678c9103a4e93a02440e00d31d3337`](https://stellar.expert/explorer/testnet/tx/dfed9632e7a48b09413c1eb715d4957a11678c9103a4e93a02440e00d31d3337) |
| `finalize` tx | [`d9cd8c8f078c3582dc7f0b343a3fcaa64468c71ae9df6db5a7ac5161aa7699dd`](https://stellar.expert/explorer/testnet/tx/d9cd8c8f078c3582dc7f0b343a3fcaa64468c71ae9df6db5a7ac5161aa7699dd) |
| Reserved / showed | 12 / 11 |
| Forfeited and split | 5.00 XLM |

## The attendees

Twelve distinct wallets, each with the transaction where it locked a deposit and,
for the eleven who checked in, the transaction where it came back. Row 6 is the
organiser's own wallet, so **ten attendees beyond the organiser checked in** —
and row 1 is the one no-show whose forfeit makes the split visible.

| # | Wallet address | `rsvp` tx | `check_in` tx | Showed |
| --- | --- | --- | --- | --- |
| 1 | [`GC5DKLTLWPTOQXHDVCCZLKUN54Y5LBNYWQHEESJI76ETCCSKBS332MIH`](https://stellar.expert/explorer/testnet/account/GC5DKLTLWPTOQXHDVCCZLKUN54Y5LBNYWQHEESJI76ETCCSKBS332MIH) | [`60c621871d0c2b29746d4b797d627fd81e7690b909fa82a624b4aa8ccdfda259`](https://stellar.expert/explorer/testnet/tx/60c621871d0c2b29746d4b797d627fd81e7690b909fa82a624b4aa8ccdfda259) | — | no |
| 2 | [`GBAW4G42254EEXDLUQ5X5GSZ6H7E46PM5AL364H2EVKRMMANDQCUFQXF`](https://stellar.expert/explorer/testnet/account/GBAW4G42254EEXDLUQ5X5GSZ6H7E46PM5AL364H2EVKRMMANDQCUFQXF) | [`bbbcc73bf903cf7c2aa52bcf9d884589d51fcda3e0c1881bbfb31df13217f177`](https://stellar.expert/explorer/testnet/tx/bbbcc73bf903cf7c2aa52bcf9d884589d51fcda3e0c1881bbfb31df13217f177) | [`7e0f0c95e935f217571b7ec28fc4329f137ee59774fd2609b396e05b727b5361`](https://stellar.expert/explorer/testnet/tx/7e0f0c95e935f217571b7ec28fc4329f137ee59774fd2609b396e05b727b5361) | yes |
| 3 | [`GBBHPJYHGFN5UEFQCSQBS6J5FAL2UG4RAKJY545ESHSGBKMIKMFCIDTL`](https://stellar.expert/explorer/testnet/account/GBBHPJYHGFN5UEFQCSQBS6J5FAL2UG4RAKJY545ESHSGBKMIKMFCIDTL) | [`da1361f4b538dad0a67a3c2574fa107169477f97a009b8fb9953c8667054c7c5`](https://stellar.expert/explorer/testnet/tx/da1361f4b538dad0a67a3c2574fa107169477f97a009b8fb9953c8667054c7c5) | [`ac9589f73780fe5e59f094e4204f187434c4c333d675d00c4632812e5c77005e`](https://stellar.expert/explorer/testnet/tx/ac9589f73780fe5e59f094e4204f187434c4c333d675d00c4632812e5c77005e) | yes |
| 4 | [`GAESJSOUVOV4CIRKCWU6PXWILLO2VQN5RMFWHQVDISVUMWSBHHHVURD7`](https://stellar.expert/explorer/testnet/account/GAESJSOUVOV4CIRKCWU6PXWILLO2VQN5RMFWHQVDISVUMWSBHHHVURD7) | [`189388810f91c661927daa2a5f7696bc5604fab1df7541dc581422a2ed517266`](https://stellar.expert/explorer/testnet/tx/189388810f91c661927daa2a5f7696bc5604fab1df7541dc581422a2ed517266) | [`21bd8dbcf0a6e5d97bdcc3391e66ded2d87fa06f5cf4c664fb50dd059f2c4769`](https://stellar.expert/explorer/testnet/tx/21bd8dbcf0a6e5d97bdcc3391e66ded2d87fa06f5cf4c664fb50dd059f2c4769) | yes |
| 5 | [`GBTM4BY6ABARXTZSVED6NZEHCFFHHNAO64WGTBIUPXAUIMRHBUYDVVWQ`](https://stellar.expert/explorer/testnet/account/GBTM4BY6ABARXTZSVED6NZEHCFFHHNAO64WGTBIUPXAUIMRHBUYDVVWQ) | [`d8a161ab9a841bfc1fa924b99d3f23f04c68f519083cc7e7dbc50947dc079a5f`](https://stellar.expert/explorer/testnet/tx/d8a161ab9a841bfc1fa924b99d3f23f04c68f519083cc7e7dbc50947dc079a5f) | [`0152403930698e09ee69152b8761c958d29376e620e5dabc0d0995cc419925cd`](https://stellar.expert/explorer/testnet/tx/0152403930698e09ee69152b8761c958d29376e620e5dabc0d0995cc419925cd) | yes |
| 6 | [`GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW`](https://stellar.expert/explorer/testnet/account/GBQRAWAAWGSS2G5G4BWAN3XJBGGEXYDJM66S7Z6TPULGLEDC7RE2O4PW) | [`0479f8b0e60177a9a4135d0ef6af6d9fbcbec8145f349f3784f36c37e3720a2e`](https://stellar.expert/explorer/testnet/tx/0479f8b0e60177a9a4135d0ef6af6d9fbcbec8145f349f3784f36c37e3720a2e) | [`e91eb97fda09eac349c0cb0c656b3673f61d419807cc89bcdf7571611783b45a`](https://stellar.expert/explorer/testnet/tx/e91eb97fda09eac349c0cb0c656b3673f61d419807cc89bcdf7571611783b45a) | yes |
| 7 | [`GBZTYVPNXDCDWXVOT6Y36TTC7DRQGSKCZF25OXVZYBGRONTJDPZEJP6Z`](https://stellar.expert/explorer/testnet/account/GBZTYVPNXDCDWXVOT6Y36TTC7DRQGSKCZF25OXVZYBGRONTJDPZEJP6Z) | [`c2beefc749d926d88041cb2ea5af09616c11c8f7dce27972f57cce3e591f43bf`](https://stellar.expert/explorer/testnet/tx/c2beefc749d926d88041cb2ea5af09616c11c8f7dce27972f57cce3e591f43bf) | [`24e4ba5e6f6bb646c3425733721ba0265c6c826efa3748e6a8921f0b7bf24eaf`](https://stellar.expert/explorer/testnet/tx/24e4ba5e6f6bb646c3425733721ba0265c6c826efa3748e6a8921f0b7bf24eaf) | yes |
| 8 | [`GBCCJXEN2ZAAKAW4MOO4GJI7FMTISSYI3ZMS2QC5FGUA4WKYWHN7HESQ`](https://stellar.expert/explorer/testnet/account/GBCCJXEN2ZAAKAW4MOO4GJI7FMTISSYI3ZMS2QC5FGUA4WKYWHN7HESQ) | [`5ea3cc39455eea3a1a51909539b545def4f08988b821412f9ea1c2bd90360a31`](https://stellar.expert/explorer/testnet/tx/5ea3cc39455eea3a1a51909539b545def4f08988b821412f9ea1c2bd90360a31) | [`c0d11d906c88cb34b92a5cedc8d3a64832bd356401e683a1a73f9c6687d45bc7`](https://stellar.expert/explorer/testnet/tx/c0d11d906c88cb34b92a5cedc8d3a64832bd356401e683a1a73f9c6687d45bc7) | yes |
| 9 | [`GBMQXTV2SJTKDFI2SHEZS35JBUFS2V5L4T7YJTR2ASGOS65LEGLKRY2H`](https://stellar.expert/explorer/testnet/account/GBMQXTV2SJTKDFI2SHEZS35JBUFS2V5L4T7YJTR2ASGOS65LEGLKRY2H) | [`8614f36acbab7da76bb5c84177fe711efa20982a4887c67cbcb1bbe770d9398c`](https://stellar.expert/explorer/testnet/tx/8614f36acbab7da76bb5c84177fe711efa20982a4887c67cbcb1bbe770d9398c) | [`0077a18260bacaedd4c20834a7f57211dd33f4ef71231403880840f4d7d3a643`](https://stellar.expert/explorer/testnet/tx/0077a18260bacaedd4c20834a7f57211dd33f4ef71231403880840f4d7d3a643) | yes |
| 10 | [`GCFCDFPTUGCHH4VQO3DQ3BQVBTCUA7W3U7NYPAYWMSH3GXWF46FTWDUW`](https://stellar.expert/explorer/testnet/account/GCFCDFPTUGCHH4VQO3DQ3BQVBTCUA7W3U7NYPAYWMSH3GXWF46FTWDUW) | [`e038765e2d8c929279ceefcfeff5d5eee559950d563baab602893c8cbcdefb9a`](https://stellar.expert/explorer/testnet/tx/e038765e2d8c929279ceefcfeff5d5eee559950d563baab602893c8cbcdefb9a) | [`c10cd44896ae26d7df330b0e7a565f0636b5dd28866058e895e705ff393d12f9`](https://stellar.expert/explorer/testnet/tx/c10cd44896ae26d7df330b0e7a565f0636b5dd28866058e895e705ff393d12f9) | yes |
| 11 | [`GCAZMRVBGJUQ6O7MO22LLVOIPKRH2GM4G4JOJUXXRNR4PPCLF2A6IFNO`](https://stellar.expert/explorer/testnet/account/GCAZMRVBGJUQ6O7MO22LLVOIPKRH2GM4G4JOJUXXRNR4PPCLF2A6IFNO) | [`38b74e916f7f9db6be696132b32426d079b1b32a4e19b5ef4ae2e2b3329a1ad7`](https://stellar.expert/explorer/testnet/tx/38b74e916f7f9db6be696132b32426d079b1b32a4e19b5ef4ae2e2b3329a1ad7) | [`3ecf832a29e62abcfa5746c5458c3d66fbcb680ba07b2d13b8a5e84b84b66417`](https://stellar.expert/explorer/testnet/tx/3ecf832a29e62abcfa5746c5458c3d66fbcb680ba07b2d13b8a5e84b84b66417) | yes |
| 12 | [`GAPUTDS2QTBWFP3XVTZSSXL22RZFUTHLZPISJIHSQM6SGVNFDCKX7FMO`](https://stellar.expert/explorer/testnet/account/GAPUTDS2QTBWFP3XVTZSSXL22RZFUTHLZPISJIHSQM6SGVNFDCKX7FMO) | [`8aa3803d449c55c2cf5b1af679ef1155c5ebbef5b62e20f5f42ae4e0f12851ab`](https://stellar.expert/explorer/testnet/tx/8aa3803d449c55c2cf5b1af679ef1155c5ebbef5b62e20f5f42ae4e0f12851ab) | [`55c52b4e6566f6f30258281d1581580a75c68a1f997f7fb6939e4541e4c17758`](https://stellar.expert/explorer/testnet/tx/55c52b4e6566f6f30258281d1581580a75c68a1f997f7fb6939e4541e4c17758) | yes |

**Everyone took part from their own phone**, wherever they were. Twelve people
opened a link in a group chat, installed a Stellar wallet themselves, funded it
from the faucet, locked a real deposit and checked in — on their own, in about an
hour. That is the flow Deliverable 1 was built for, tested by strangers.

**Nothing above was typed by hand.**
[`web/scripts/collect-evidence.mjs`](../../web/scripts/collect-evidence.mjs)
reads it off the chain; `npm run evidence -- <event>` from `web/` reproduces it.

Detail: [README](../../README.md#deliverable-3--one-real-event-10-real-attendees-a-demo-video)
· [deployments.md](../deployments.md#deliverable-3-evidence--one-real-run-12-wallets-11-check-ins)
