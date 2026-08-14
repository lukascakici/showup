"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { networkName } from "@/lib/stellar";
import { Button } from "./ui";

/**
 * The app knew and never said so.
 *
 * `wrongNetwork` has been computed in the wallet context since week 1 and was
 * read by nothing. A wallet left on Mainnet therefore produced a signature the
 * network rejects, surfaced as whatever the wallet chose to call it, with no
 * mention anywhere of the one setting that fixes it.
 *
 * Only Freighter answers `getNetwork` — xBull, Albedo and Hana reject it — so
 * this can only ever appear for Freighter users. That is the right shape: an
 * unanswered question stays quiet, and the case we can prove gets named.
 */
export function NetworkBanner() {
  const { wrongNetwork, network, walletName, refreshNetwork } = useWallet();
  const [checking, setChecking] = useState(false);

  if (!wrongNetwork) return null;

  const wallet = walletName ?? "your wallet";

  // Deliberately a warning and not a lock. The network is read once, when the
  // address arrives, and a wallet can be switched at any time afterwards — so
  // blocking the buttons on this would strand whoever just did as they were
  // told. The recheck is how the banner gets to be wrong and then go away.
  const recheck = async () => {
    setChecking(true);
    try {
      await refreshNetwork();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="border-b border-danger/40 bg-surface-2" role="alert">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
          <p className="text-sm text-foreground">
            <strong className="font-semibold">
              {walletName ?? "Your wallet"} is on {networkName(network.passphrase)}.
            </strong>{" "}
            <span className="text-muted">
              Showup runs on Stellar Testnet. Switch networks in {wallet} — nothing here
              can be signed until you do.
            </span>
          </p>
        </div>
        <Button
          variant="secondary"
          className="shrink-0 sm:ml-auto"
          onClick={() => void recheck()}
          loading={checking}
        >
          I switched — check again
        </Button>
      </div>
    </div>
  );
}
