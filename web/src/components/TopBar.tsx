"use client";

import Link from "next/link";
import { Wallet, LogOut } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { shortAddr } from "@/lib/format";
import { Button } from "./ui";

export function TopBar() {
  const { address, status, connect, disconnect } = useWallet();

  return (
    <header className="glass sticky top-0 z-50 border-b border-border">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight">Showup</span>
          <span className="text-xs font-medium text-muted">Testnet</span>
        </Link>

        {status === "connected" && address ? (
          <div className="flex items-center gap-2">
            <span className="hidden rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-xs text-foreground sm:inline">
              {shortAddr(address)}
            </span>
            <Button variant="secondary" onClick={disconnect} aria-label="Disconnect wallet">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Disconnect</span>
            </Button>
          </div>
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
