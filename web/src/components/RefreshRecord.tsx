"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { requestRecordSync } from "@/lib/record-index";

/**
 * Ask the server to re-read this wallet's record off the chain, then show it.
 *
 * The page above renders from the Firestore mirror so the numbers are in the HTML
 * and arrive in one round trip. This is the other half of that bargain: the mirror
 * is refreshed from the contract on every view, and the page re-renders with what
 * came back. Fast first, correct immediately after, and the page says which one
 * the reader is looking at until then.
 *
 * `router.refresh()` rather than local state, because the numbers are rendered by
 * a server component. It re-runs that component with the mirror now current and
 * swaps the markup in place, with no loading state and no flash — there was never
 * a moment with nothing on screen to protect.
 *
 * Deliberately silent when it fails. A record shown as of ten minutes ago, with a
 * line saying so, is a good page; a red error about a refresh nobody asked for is
 * not.
 */
export function RefreshRecord({ address }: { address: string }) {
  const router = useRouter();

  useEffect(() => {
    let live = true;
    void requestRecordSync(address).then(() => {
      // Guarded: an unmounted component calling `refresh` is a warning in
      // development and a wasted render in production.
      if (live) router.refresh();
    });
    return () => {
      live = false;
    };
  }, [address, router]);

  return null;
}
