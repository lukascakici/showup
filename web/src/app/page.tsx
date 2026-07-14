"use client";

import { Wallet, ShieldCheck, Send, Droplets } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { Button, ButtonLink, Card } from "@/components/ui";

export default function Home() {
  const { status, connect, error } = useWallet();

  return (
    <div className="flex flex-col gap-8">
      <section className="pt-4">
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Put a deposit on
          <br />
          <span className="font-hand text-5xl text-accent sm:text-6xl">showing up.</span>
        </h1>
        <p className="mt-4 max-w-md text-base text-muted">
          Showup turns RSVPs into refundable on-chain deposits. This is the White
          Belt build: connect a wallet, fund it, and move a deposit on Stellar
          Testnet.
        </p>
      </section>

      {status !== "connected" ? (
        <Card className="flex flex-col items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-surface-2">
            <ShieldCheck className="size-6 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Connect to begin</h2>
            <p className="mt-1 text-sm text-muted">
              Connect your Freighter wallet on Testnet to check your balance,
              request test XLM, and send a payment.
            </p>
          </div>
          <Button onClick={connect} loading={status === "connecting"} size="lg" fullWidth>
            <Wallet className="size-4" />
            Connect wallet
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </Card>
      ) : (
        <Card className="flex flex-col gap-5">
          <div>
            <h2 className="text-lg font-bold tracking-tight">You&apos;re connected</h2>
            <p className="mt-1 text-sm text-muted">
              Send a deposit to any Testnet address. Your balance and test faucet
              live in the wallet menu, top right.
            </p>
          </div>
          <ButtonLink href="/send" size="lg" fullWidth>
            <Send className="size-4" />
            Send XLM
          </ButtonLink>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-2">
            <Droplets className="size-3.5" />
            Need test XLM? Open the wallet menu and use the faucet.
          </p>
        </Card>
      )}
    </div>
  );
}
