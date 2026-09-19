"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";
import { ROLL_CALLS, isOpen, type RollCall } from "@/lib/roll-call";
import { SectionLabel } from "./ui";

/** No subscription: the window turns over twice, and never mid-session. */
const noChanges = () => () => {};

const serverSnapshot = () => null;

/** The roll call taking names right now, if there is one. */
export function openRollCall(now = Date.now()): RollCall | null {
  // A reference out of the frozen list, so repeated calls return the identical
  // object. `useSyncExternalStore` re-renders forever on a fresh one each read.
  return ROLL_CALLS.find((call) => isOpen(call, now / 1000)) ?? null;
}

/**
 * The one thing on the home page that is not an event.
 *
 * A roll call holds no deposit, owns no contract and has no on-chain state, so
 * it cannot be a row in the event list without every figure in that row being
 * invented, and it stays out of the hero's totals for exactly the same reason.
 * It gets a card of its own, above the list.
 *
 * It also takes itself down. The window in `ROLL_CALLS` is what ends this, not
 * a commit somebody has to remember to write on the Monday after the meetup.
 */
export function LiveRollCall() {
  // Reading the clock during render would make the prerendered HTML disagree
  // with the browser for any build that straddles the window. The server
  // snapshot is `null`, so this card is always something the client *adds*,
  // never something it has to take back after the page has been seen.
  const call = useSyncExternalStore(noChanges, openRollCall, serverSnapshot);
  if (!call) return null;

  return (
    <Link
      href={`/${call.slug}`}
      className="mb-13 flex items-center gap-5 rounded-2xl border border-border-strong bg-surface p-5 transition-colors hover:border-border-hover hover:bg-surface-3 sm:p-6"
    >
      <div className="min-w-0 flex-1">
        <SectionLabel className="mb-2.5">HAPPENING NOW</SectionLabel>
        <div className="truncate font-display text-[21px] font-medium tracking-[-0.015em]">
          {call.title}
        </div>
      </div>
      <ArrowRight aria-hidden className="hidden size-5 shrink-0 text-muted-2 sm:block" />
    </Link>
  );
}
