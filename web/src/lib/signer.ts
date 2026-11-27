"use client";

import { useMemo } from "react";
import { useWallet } from "./wallet";
import { useNetwork } from "./network-context";
import type { Network } from "./networks";
import type { SignFn } from "./stellar";

/**
 * Hand the wallet to the generated contract clients.
 *
 * The wallet kit signs by returning `{ signedTxXdr, signerAddress }` and throwing
 * on rejection, which is exactly the hook shape the clients want — so there is
 * nothing to translate. Returning an empty object while no wallet is connected is
 * what gates the forms: without a signer the clients can only simulate.
 *
 * ## The network travels with the signer
 *
 * `ClientOpts.network` defaults to `defaultNetwork()`, and once Mainnet went live
 * that started answering "mainnet" — on **both** hostnames, because one build
 * serves both and Mainnet's RPC path is compiled into it. The read paths had all
 * been given a network by then; the write paths had not, so every `create_event`,
 * `rsvp`, `check_in` and `finalize` on the Testnet host was being built against
 * the Mainnet factory, over the Mainnet RPC, for signing with the Mainnet
 * passphrase.
 *
 * That asymmetry is not a coincidence: a read pointed at the wrong chain shows up
 * immediately as an empty page, and a write pointed at the wrong chain shows up
 * only when somebody tries to act. The first kind gets found; the second kind
 * waits.
 *
 * Putting it here rather than at each call site is the point. Every contract
 * client in the app is constructed from this object, so there is one place that
 * decides, and a new call site inherits the right answer instead of having to
 * remember a rule.
 */
export function useSigner(): {
  publicKey?: string;
  signTransaction?: SignFn;
  network: Network;
} {
  const { address, sign } = useWallet();
  const network = useNetwork();

  return useMemo(
    () => (address ? { publicKey: address, signTransaction: sign, network } : { network }),
    [address, sign, network],
  );
}
