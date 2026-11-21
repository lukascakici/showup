import "server-only";

import { headers } from "next/headers";
import { networkFromHostname, type Network } from "./networks";

/**
 * The network this request is being served on, read off the `Host` header.
 *
 * `x-forwarded-host` first, because behind Vercel's proxy that is the host the
 * browser actually asked for, while `host` can be the underlying deployment
 * hostname. Getting that order wrong would quietly serve every request as
 * Testnet from a `*.vercel.app` host — which is the safe direction to fail, but
 * it would also mean the Mainnet domain never worked and nothing would say why.
 *
 * Spoofing the header changes nothing worth having: `networkFromHostname`
 * allowlists Mainnet, so the only reachable outcome is being shown public
 * Mainnet data, and nothing here signs anything — a transaction is signed by the
 * visitor's own wallet against the network that wallet is set to.
 */
export async function requestNetwork(): Promise<Network> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return networkFromHostname(host);
}
