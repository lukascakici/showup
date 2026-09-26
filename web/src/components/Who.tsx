"use client";

import { useEffect, useState } from "react";
import { shortAddr } from "@/lib/format";
import { readNames } from "@/lib/names";

/**
 * A wallet, by whatever name it has.
 *
 * Falls back to the shortened address, always, and that is the whole design: a
 * name is optional, so every screen has to read correctly without one. Nothing
 * here waits for a name either — the address renders immediately and the name
 * replaces it if there is one, so an unnamed wallet never shows a gap and a slow
 * Firestore read never delays a guest list.
 *
 * `title` carries the full address regardless, because a name is a label somebody
 * chose and the address is the thing the chain knows. Anybody checking one against
 * the other should not have to leave the page.
 */
export function Who({
  address,
  head = 4,
  tail = 4,
  className = "",
}: {
  address: string;
  head?: number;
  tail?: number;
  className?: string;
}) {
  const name = useName(address);

  return (
    <span className={className} title={address}>
      {name ?? <span className="font-mono">{shortAddr(address, head, tail)}</span>}
    </span>
  );
}

/**
 * One wallet's name, or `null` while unknown and `null` if it has none.
 *
 * The two are deliberately the same value here. A component that distinguished
 * them would have a third state to render, and there is nothing useful to say in
 * it — "this wallet may or may not have a name yet" is not information a guest
 * list should carry.
 */
export function useName(address: string | null): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let live = true;
    void readNames([address])
      .then((found) => {
        if (live) setName(found.get(address) ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [address]);

  return name;
}

/**
 * Names for a whole list, in one query rather than one per row.
 *
 * `addresses` is a fresh array on every render, so the effect keys on what it
 * contains — otherwise a guest list re-queries Firestore on every tick of the
 * event poll.
 */
export function useNames(addresses: string[]): Map<string, string> {
  const key = [...addresses].sort().join(",");
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!key) return;
    let live = true;
    void readNames(key.split(","))
      .then((found) => {
        if (live) setNames(found);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);

  return names;
}
