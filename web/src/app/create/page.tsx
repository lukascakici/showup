"use client";

import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { CreateEvent } from "@/components/CreateEvent";
import { Button, Card } from "@/components/ui";

export default function CreatePage() {
  const { status, connect, error } = useWallet();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Events
      </Link>

      <section>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Create an event</h1>
        <p className="mt-2 max-w-md text-base text-muted">
          Your event gets its own contract on Stellar Testnet. People reserve a spot
          with a deposit and take it back by showing up.
        </p>
      </section>

      {status !== "connected" ? (
        <Card className="flex flex-col items-start gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Connect first</h2>
            <p className="mt-1 text-sm text-muted">
              Your wallet is the event&apos;s organizer, so you need it connected to
              create one.
            </p>
          </div>
          <Button onClick={connect} loading={status === "connecting"} size="lg" fullWidth>
            <Wallet className="size-4" />
            Connect wallet
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </Card>
      ) : (
        <CreateEvent />
      )}
    </div>
  );
}
