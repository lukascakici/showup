"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CircleDollarSign, FlaskConical, Wallet } from "lucide-react";
import { fromStroops } from "@/lib/contracts";
import { Button } from "./ui";

/** No subscription: nothing outside this component changes the answer. */
const noChanges = () => () => {};

/** Rendered as nothing on the server, so the client is free to read storage. */
const serverSnapshot = () => true;

const KEY = "showup.firstrun.v1";

/**
 * Whether this browser has already been through it.
 *
 * Wrapped because `localStorage` does not merely come back empty in a locked-down
 * browser, it throws. Losing the record means explaining the deposit twice, which
 * is the right way round for this to fail.
 */
function seen(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

function remember() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Nothing to do, and nothing lost but a repeat.
  }
}

/**
 * What a deposit is, before anybody is asked to sign for one.
 *
 * Titled "Before you reserve" rather than "How this works", which is what the
 * cold-start explainer further down the same page is already called. Two things on
 * one screen with the same heading is a page that has not decided what it is
 * saying — and this one is specifically about the money, not about the product.
 *
 * Shown once per browser, on the event page, using **this event's own numbers**
 * rather than an example. The generic version of this screen is the one people
 * skip: "a deposit is refunded when you attend" is a sentence about software, and
 * "your 10 XLM comes back when you check in" is a sentence about their money.
 *
 * Three things, in the order somebody actually needs them:
 *
 * 1. **The money comes back.** This is the only question anybody has, and every
 *    other explanation is noise until it is answered.
 * 2. **It is not real money.** Testnet XLM is free and worth nothing. Said plainly
 *    and early, because the alternative is somebody believing they are risking
 *    savings, and the alternative to *that* is somebody believing the opposite of
 *    a real deposit on mainnet later.
 * 3. **A wallet is the thing that holds it.** Last, because it is the step, not
 *    the reason.
 *
 * Dismissable from anywhere outside it. An explanation nobody can get past is an
 * obstacle, and somebody who already knows all three is being detained.
 */
export function FirstRun({ deposit, refund }: { deposit: bigint; refund: bigint }) {
  const already = useSyncExternalStore(noChanges, seen, serverSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const open = !already && !dismissed;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        remember();
        setDismissed(true);
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open) return null;

  const close = () => {
    remember();
    setDismissed(true);
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="welcome-scrim fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-title"
    >
      <div className="welcome-panel w-full max-w-md rounded-2xl border border-border-strong bg-surface p-6 shadow-2xl shadow-black/60">
        <h2
          id="first-run-title"
          className="font-display text-[28px] font-bold leading-[1.1] tracking-[-0.03em] text-balance"
        >
          Before you reserve
        </h2>

        <ul className="mt-5 flex flex-col gap-4">
          <Step icon={<CircleDollarSign className="size-4 text-accent" />} title="You get it back">
            Reserving locks {fromStroops(deposit)} XLM in the event&apos;s own contract.
            Check in when you turn up and {fromStroops(refund)} XLM comes straight back
            to you, in the same transaction. Only a no-show forfeits theirs.
          </Step>
          <Step
            icon={<FlaskConical className="size-4 text-muted" />}
            title="It isn't real money"
          >
            This runs on Stellar&apos;s test network. The XLM is free, there is a faucet
            in the app, and it is worth nothing anywhere. Nothing here can touch
            money you actually own.
          </Step>
          <Step icon={<Wallet className="size-4 text-muted" />} title="A wallet holds it">
            Not us. The contract takes the deposit from your wallet and returns it to
            your wallet, and every step is a transaction you approve yourself.
          </Step>
        </ul>

        <Button autoFocus onClick={close} size="lg" fullWidth className="mt-6">
          Got it
        </Button>
      </div>
    </div>
  );
}

function Step({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-1 block text-[13.5px] leading-[1.6] text-muted">{children}</span>
      </span>
    </li>
  );
}
