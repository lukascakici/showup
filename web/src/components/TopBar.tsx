"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Send } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { Button } from "./ui";
import { WalletMenu } from "./WalletMenu";
import { Logo } from "./Logo";

export function TopBar() {
  const { status, connect } = useWallet();
  const pathname = usePathname();
  const sendActive = pathname === "/send";

  return (
    <header className="sticky top-4 z-50 px-4 sm:px-6">
      <div className="glass mx-auto flex h-14 max-w-3xl items-center justify-between rounded-2xl border border-border-strong px-4 shadow-xl shadow-black/40 sm:px-5">
        <div className="flex items-center gap-5">
          <Link href="/" aria-label="Showup home">
            <Logo />
          </Link>
          {status === "connected" && (
            <Link
              href="/send"
              aria-current={sendActive ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                sendActive
                  ? "bg-surface-2 text-accent"
                  : "text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <Send className="size-4" />
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
