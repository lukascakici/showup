"use client";

import Link from "next/link";
import { ArrowLeft, Wallet, AlertTriangle } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { SendPayment } from "@/components/SendPayment";
import { Button, Card } from "@/components/ui";

export default function SendPage() {
  const { status, connect, wrongNetwork, error } = useWallet();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Home
      </Link>

      <section>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Send XLM</h1>
        <p className="mt-2 max-w-md text-base text-muted">
          Move a deposit to any Stellar Testnet address. You&apos;ll sign in
          Freighter and get a transaction hash.
        </p>
      </section>

      {status !== "connected" ? (
        <Card className="flex flex-col items-start gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Connect first</h2>
            <p className="mt-1 text-sm text-muted">
              Connect your Freighter wallet on Testnet to send a payment.
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
                <p className="text-sm font-semibold text-foreground">Wrong network</p>
                <p className="mt-1 text-sm text-muted">
                  Switch your Freighter wallet to <strong>Testnet</strong> to send a
                  payment.
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
