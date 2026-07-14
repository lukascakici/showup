"use client";

import { useMemo } from "react";
import { useWallet } from "./wallet";
import { errMessage, NETWORK_PASSPHRASE } from "./stellar";
import type { SignTx } from "./contracts";

/**
 * Adapt the wallet to what the generated contract clients expect.
 *
 * Freighter reports a rejection by returning an `error` field; the contract
 * client only understands a thrown error, so translate it here rather than
 * letting a rejected signature look like a successful empty one.
 */
export function useSigner(): { publicKey?: string; signTransaction?: SignTx } {
  const { address, sign } = useWallet();

  return useMemo(() => {
    if (!address) return {};
    const signTransaction: SignTx = async (xdr) => {
      const res = await sign(xdr, {
        networkPassphrase: NETWORK_PASSPHRASE,
        address,
      });
      if (res.error) {
        throw new Error(errMessage(res.error) || "You rejected the request in your wallet.");
      }
      return { signedTxXdr: res.signedTxXdr, signerAddress: address };
    };
    return { publicKey: address, signTransaction };
  }, [address, sign]);
}
