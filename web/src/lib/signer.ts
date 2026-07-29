"use client";

import { useMemo } from "react";
import { useWallet } from "./wallet";
import type { SignFn } from "./stellar";

/**
 * Hand the wallet to the generated contract clients.
 *
 * The wallet kit signs by returning `{ signedTxXdr, signerAddress }` and throwing
 * on rejection, which is exactly the hook shape the clients want — so there is
 * nothing to translate. Returning an empty object while no wallet is connected is
 * what gates the forms: without a signer the clients can only simulate.
 */
export function useSigner(): { publicKey?: string; signTransaction?: SignFn } {
  const { address, sign } = useWallet();

  return useMemo(
    () => (address ? { publicKey: address, signTransaction: sign } : {}),
    [address, sign],
  );
}
