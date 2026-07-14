"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { Button } from "./ui";
import { WalletMenu } from "./WalletMenu";

export function TopBar() {
  const { status, connect } = useWallet();

  return (
    <header className="sticky top-4 z-50 px-4 sm:px-6">
      <div className="glass mx-auto flex h-14 max-w-3xl items-center justify-between rounded-2xl border border-border-strong px-4 shadow-xl shadow-black/40 sm:px-5">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-tight">Showup</span>
            <span className="text-xs font-medium text-muted">Testnet</span>
          </Link>
          {status === "connected" && (
            <Link
              href="/send"
              className="text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              Send
            </Link>
          )}
        </div>

        {status === "connected" ? (
          <WalletMenu />
        ) : (
          <Button onClick={connect} loading={status === "connecting"}>
            <Wallet className="size-4" />
            Connect wallet
          </Button>
        )}
      </div>
    </header>
  );
}
