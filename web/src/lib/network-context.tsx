"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { network, type Network, type NetworkId } from "./networks";

/**
 * Which network this request is being served on, available to every component.
 *
 * The value is resolved **on the server**, from the `Host` header, and handed
 * down as an id — see the root layout. That is deliberate rather than
 * convenient: a client component could read `window.location.hostname` itself,
 * but it renders on the server first, where there is no `window`, so the
 * network would be absent in the initial HTML and appear a moment later. On a
 * page whose whole job is to not let anyone mistake Testnet for real money, a
 * label that flashes in is not an acceptable implementation of "the network is
 * labelled on every screen".
 *
 * The cost is that the root layout reads a header and therefore renders per
 * request instead of being prerendered. It is a cost worth paying here: every
 * screen in this app fetches its data on the client anyway, so the prerendered
 * HTML was only ever a shell.
 *
 * An id crosses the boundary rather than the whole object, so there is one
 * definition of what a network is — `networks.ts` — and no chance of a
 * serialized copy drifting from it.
 */
const NetworkContext = createContext<Network | null>(null);

export function NetworkProvider({ id, children }: { id: NetworkId; children: ReactNode }) {
  const value = useMemo(() => network(id), [id]);
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

/** The network being served. Throws rather than guessing, because guessing is the bug. */
export function useNetwork(): Network {
  const value = useContext(NetworkContext);
  if (!value) {
    throw new Error(
      "useNetwork() outside a NetworkProvider. The provider belongs in the root " +
        "layout, where the Host header is read.",
    );
  }
  return value;
}
