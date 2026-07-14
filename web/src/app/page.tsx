"use client";

import { Wallet, ShieldCheck, AlertTriangle } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { SendPayment } from "@/components/SendPayment";
import { Button, Card } from "@/components/ui";

export default function Home() {
  const { status, connect, wrongNetwork, error } = useWallet();

  return (
    <div className="flex flex-col gap-8">
      <section className="pt-4">
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Put a deposit on
          <br />
          <span className="text-accent">showing up.</span>
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
        <>
          {wrongNetwork && (
            <div className="flex items-start gap-3 rounded-xl border border-danger/40 bg-surface-2 p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Wrong network
                </p>
                <p className="mt-1 text-sm text-muted">
                  Switch your Freighter wallet to <strong>Testnet</strong> to use
                  Showup.
                </p>
              </div>
            </div>
          )}
          <SendPayment />
        </>
      )}
    </div>
  );
}
